-- ============================================================
-- PHASE 8: VERIFICATION PIPELINE QA FIXES
--
-- Standalone file — run in the Supabase SQL Editor AFTER Phase 7.
-- Safe to re-run.
--
-- Adds research timestamps + evidence source to quest_completions,
-- widens submit_completion() to record them, stamps admin review
-- time, and — the key hardening — REVOKES complete_task from
-- authenticated so a quest can only be completed through
-- submit_completion (which requires photo + log). submit_completion
-- is SECURITY DEFINER and calls complete_task with owner privilege,
-- so the internal award path keeps working.
-- ============================================================


-- ── 1. New columns ──
alter table quest_completions
  add column if not exists verification_started_at timestamptz,
  add column if not exists ai_verdict_at           timestamptz,
  add column if not exists admin_reviewed_at        timestamptz,
  add column if not exists source                   text not null default 'camera';  -- 'camera' | 'upload'


-- ── 2. submit_completion(): record verification-start + source ──
-- Signature widens (4 -> 6 args); drop the old overload first.
drop function if exists submit_completion(uuid, text, text, timestamptz);

create or replace function submit_completion(
  p_task_id                 uuid,
  p_photo_path              text,
  p_log                     text,
  p_time_started            timestamptz,
  p_verification_started_at timestamptz default null,
  p_source                  text        default 'camera'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_task         tasks%rowtype;
  v_prev_streak  int;
  v_snap         jsonb;
  v_snapshot_id  uuid;
  v_result       jsonb;
  v_delta        int;
  v_streak_inc   boolean;
  v_completion   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if p_log is null or length(trim(p_log)) < 20 then
    return jsonb_build_object('ok', false, 'error', 'log_too_short');
  end if;

  select * into v_task from tasks where id = p_task_id;
  if not found or v_task.user_id <> v_uid or v_task.completed then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select current_streak,
         jsonb_build_object(
           'points',                points,
           'level',                 pet_level,
           'current_streak',        current_streak,
           'longest_streak',        longest_streak,
           'total_points_earned',   total_points_earned,
           'last_completion_date',  last_completion_date,
           'badges',                badges,
           'boss_battles_unlocked', boss_battles_unlocked)
    into v_prev_streak, v_snap
    from profiles where id = v_uid;

  insert into user_snapshots (user_id, snapshot_data, snapshot_type)
    values (v_uid, v_snap, 'pre_completion')
    returning id into v_snapshot_id;

  v_result := complete_task(p_task_id);
  if not coalesce((v_result->>'ok')::boolean, false) then
    return v_result;
  end if;

  v_delta      := coalesce((v_result->>'awarded')::int, 0) + coalesce((v_result->>'bonus')::int, 0);
  v_streak_inc := coalesce((v_result->>'streak')::int, 0) > coalesce(v_prev_streak, 0);

  insert into quest_completions (
    user_id, quest_id, proof_photo_url, proof_captured_at, progress_log,
    time_started, time_completed, duration_seconds, difficulty,
    points_earned, streak_incremented, snapshot_id,
    ai_verdict, admin_verdict, status,
    verification_started_at, source
  ) values (
    v_uid, p_task_id, p_photo_path, now(), trim(p_log),
    p_time_started, now(),
    -- Research: total elapsed since the quest was CREATED.
    greatest(0, extract(epoch from (now() - v_task.created_at))::int),
    v_task.difficulty,
    v_delta, v_streak_inc, v_snapshot_id,
    'pending', 'pending', 'pending',
    coalesce(p_verification_started_at, now()),
    case when p_source = 'upload' then 'upload' else 'camera' end
  ) returning id into v_completion;

  return v_result || jsonb_build_object('completion_id', v_completion);
end;
$$;

grant execute on function submit_completion(uuid, text, text, timestamptz, timestamptz, text) to authenticated;


-- ── 3. admin_review_completion(): stamp admin_reviewed_at ──
create or replace function admin_review_completion(
  p_completion_id uuid,
  p_action        text,
  p_reason        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      quest_completions%rowtype;
  v_admin  uuid := auth.uid();
  v_badges jsonb;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_c from quest_completions where id = p_completion_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_action = 'approved' then
    update quest_completions
      set status = 'verified', admin_verdict = 'approved',
          admin_reviewer = v_admin, admin_reason = p_reason, admin_reviewed_at = now()
      where id = p_completion_id;

    select badges into v_badges from profiles where id = v_c.user_id;
    if not coalesce(v_badges, '[]'::jsonb) ? 'verified_quest' then
      update profiles
        set badges = coalesce(badges, '[]'::jsonb) || '["verified_quest"]'::jsonb
        where id = v_c.user_id;
      insert into achievements (user_id, badge_id)
        values (v_c.user_id, 'verified_quest')
        on conflict (user_id, badge_id) do nothing;
    end if;
    return jsonb_build_object('ok', true, 'status', 'verified');

  elsif p_action = 'rejected' then
    update quest_completions
      set admin_reviewer = v_admin, admin_reason = p_reason, admin_reviewed_at = now()
      where id = p_completion_id;
    -- If already reverted (AI fail), this just records the admin's confirmation.
    if v_c.status <> 'reverted' then
      perform rollback_completion(p_completion_id, 'admin_rejected');
    end if;
    return jsonb_build_object('ok', true, 'status', 'reverted');

  elsif p_action = 'suspicious' then
    update quest_completions
      set admin_verdict = 'suspicious', admin_reviewer = v_admin,
          admin_reason = p_reason, admin_reviewed_at = now()
      where id = p_completion_id;
    return jsonb_build_object('ok', true, 'status', 'suspicious');

  else
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;
end;
$$;

grant execute on function admin_review_completion(uuid, text, text) to authenticated;


-- ── 4. Enforcement: completion ONLY via submit_completion ──
-- Directly calling complete_task from the client would award points without any
-- photo/log. Revoke it; submit_completion (SECURITY DEFINER, owner privilege)
-- still calls it internally. A console rpc('complete_task', …) now returns
-- "permission denied for function complete_task".
revoke execute on function complete_task(uuid) from authenticated, anon;
