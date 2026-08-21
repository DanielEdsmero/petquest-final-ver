-- ============================================================
-- PHASE 7: QUEST VERIFICATION PIPELINE + ANTI-CHEAT ROLLBACK
--
-- Standalone file — run in the Supabase SQL Editor AFTER
-- supabase-schema.sql + Phases 3/4/5/6 and the saitama file.
-- Safe to re-run.
--
-- Adds evidence-based completion: a live photo + progress log go
-- through AI + admin review, and a flagged completion is reversed
-- with a TARGETED rollback (only that completion's deltas), so
-- legitimate progress earned afterwards survives.
--
-- Security model: the browser is untrusted. Only these SECURITY
-- DEFINER RPCs (and the Vercel serverless function via the service
-- role) mutate award/verdict state. submit_completion() REUSES
-- complete_task() so award/progression logic is never duplicated —
-- complete_task must be the Phase 6 version (last-run-wins).
-- ============================================================


-- ── 1. Tables ──
create table if not exists user_snapshots (
  id            uuid        primary key default uuid_generate_v4(),
  user_id       uuid        references profiles(id) on delete cascade not null,
  snapshot_data jsonb       not null,
  captured_at   timestamptz not null default now(),
  snapshot_type text        not null default 'pre_completion'
);

create table if not exists quest_completions (
  id                 uuid        primary key default uuid_generate_v4(),
  user_id            uuid        references profiles(id) on delete cascade not null,
  quest_id           uuid        references tasks(id) on delete cascade,
  proof_photo_url    text,                 -- storage PATH in the quest-proofs bucket
  proof_captured_at  timestamptz,
  progress_log       text        not null,
  time_started       timestamptz,
  time_completed     timestamptz,
  duration_seconds   integer,
  difficulty         text,
  points_earned      integer     not null default 0,   -- delta awarded (for exact reversal)
  streak_incremented boolean     not null default false,
  snapshot_id        uuid        references user_snapshots(id),
  ai_verdict         text        not null default 'pending',  -- pass | fail | pending | error
  ai_confidence      double precision,
  ai_reason          text,
  admin_verdict      text        not null default 'pending',  -- approved | rejected | suspicious | pending
  admin_reviewer     uuid,
  admin_reason       text,
  status             text        not null default 'pending',  -- pending | verified | rejected | reverted
  created_at         timestamptz not null default now()
);
create index if not exists quest_completions_status_idx on quest_completions (status, created_at desc);

create table if not exists cheat_events (
  id              uuid        primary key default uuid_generate_v4(),
  user_id         uuid        references profiles(id) on delete cascade not null,
  completion_id   uuid        references quest_completions(id) on delete set null,
  violation_type  text,       -- fake_photo | ai_rejected | admin_rejected | suspicious_timing | staged_evidence
  severity        text,       -- warning | strike | ban
  description     text,
  data_snapshot   jsonb,
  points_reverted integer,
  quests_reverted integer,
  streak_reverted integer,
  resolved        boolean     not null default false,
  created_at      timestamptz not null default now()
);


-- ── 2. RLS (read-only for clients; all writes go through the RPCs below) ──
alter table user_snapshots    enable row level security;
alter table quest_completions enable row level security;
alter table cheat_events      enable row level security;

do $$
begin
  -- quest_completions: users see their own, admins see all
  if not exists (select 1 from pg_policies where tablename='quest_completions' and policyname='qc: own read') then
    execute $p$ create policy "qc: own read" on quest_completions for select using ( auth.uid() = user_id ) $p$;
  end if;
  if not exists (select 1 from pg_policies where tablename='quest_completions' and policyname='qc: admin read') then
    execute $p$ create policy "qc: admin read" on quest_completions for select using ( is_admin() ) $p$;
  end if;
  -- snapshots + cheat_events: admin read only (sensitive)
  if not exists (select 1 from pg_policies where tablename='user_snapshots' and policyname='snap: admin read') then
    execute $p$ create policy "snap: admin read" on user_snapshots for select using ( is_admin() ) $p$;
  end if;
  if not exists (select 1 from pg_policies where tablename='cheat_events' and policyname='ce: own read') then
    execute $p$ create policy "ce: own read" on cheat_events for select using ( auth.uid() = user_id ) $p$;
  end if;
  if not exists (select 1 from pg_policies where tablename='cheat_events' and policyname='ce: admin read') then
    execute $p$ create policy "ce: admin read" on cheat_events for select using ( is_admin() ) $p$;
  end if;
end $$;

-- No direct client writes to any of these — only the SECURITY DEFINER RPCs.
revoke insert, update, delete on user_snapshots    from authenticated, anon;
revoke insert, update, delete on quest_completions from authenticated, anon;
revoke insert, update, delete on cheat_events      from authenticated, anon;


-- ── 3. Private storage bucket for proof photos ──
insert into storage.buckets (id, name, public)
  values ('quest-proofs', 'quest-proofs', false)
  on conflict (id) do nothing;

-- A user may upload only under their own {uid}/ folder; read own or admin.
drop policy if exists "quest-proofs: upload own" on storage.objects;
create policy "quest-proofs: upload own" on storage.objects for insert to authenticated
  with check ( bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "quest-proofs: read own or admin" on storage.objects;
create policy "quest-proofs: read own or admin" on storage.objects for select to authenticated
  using ( bucket_id = 'quest-proofs'
          and ( (storage.foldername(name))[1] = auth.uid()::text or is_admin() ) );


-- ── 4. submit_completion(): snapshot + provisional award (reuses complete_task) ──
create or replace function submit_completion(
  p_task_id      uuid,
  p_photo_path   text,
  p_log          text,
  p_time_started timestamptz
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

  -- Trusted server-side snapshot of the pre-completion profile state.
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

  -- Award provisionally. complete_task enforces the time gate + burst lock and
  -- does the full progression update; auth.uid() carries through the nested call.
  v_result := complete_task(p_task_id);
  if not coalesce((v_result->>'ok')::boolean, false) then
    return v_result;  -- too_soon / locked / invalid — nothing awarded, no completion row
  end if;

  v_delta      := coalesce((v_result->>'awarded')::int, 0) + coalesce((v_result->>'bonus')::int, 0);
  v_streak_inc := coalesce((v_result->>'streak')::int, 0) > coalesce(v_prev_streak, 0);

  insert into quest_completions (
    user_id, quest_id, proof_photo_url, proof_captured_at, progress_log,
    time_started, time_completed, duration_seconds, difficulty,
    points_earned, streak_incremented, snapshot_id, ai_verdict, admin_verdict, status
  ) values (
    v_uid, p_task_id, p_photo_path, now(), trim(p_log),
    p_time_started, now(),
    greatest(0, extract(epoch from (now() - coalesce(p_time_started, v_task.created_at)))::int),
    v_task.difficulty,
    v_delta, v_streak_inc, v_snapshot_id, 'pending', 'pending', 'pending'
  ) returning id into v_completion;

  return v_result || jsonb_build_object('completion_id', v_completion);
end;
$$;

grant execute on function submit_completion(uuid, text, text, timestamptz) to authenticated;


-- ── 5. rollback_completion(): targeted reversal ──
-- Callable by the serverless (service_role) and, internally, by
-- admin_review_completion. Reverses ONLY this completion's deltas.
create or replace function rollback_completion(p_completion_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c            quest_completions%rowtype;
  v_uid          uuid;
  v_snap         jsonb;
  v_new_total    int;
  v_new_level    int;
  v_same_day     int;
  v_day          date;
begin
  if not (is_admin() or auth.role() = 'service_role') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_c from quest_completions where id = p_completion_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_c.status = 'reverted' then return jsonb_build_object('ok', true, 'already_reverted', true); end if;

  v_uid := v_c.user_id;

  -- 1. Reverse points + lifetime total, recompute level.
  update profiles
    set points              = greatest(0, points - v_c.points_earned),
        total_points_earned = greatest(0, total_points_earned - v_c.points_earned)
    where id = v_uid
    returning total_points_earned into v_new_total;

  v_new_level := case when v_new_total >= 5000 then 5
                      when v_new_total >= 1500 then 4
                      when v_new_total >= 500  then 3
                      when v_new_total >= 100  then 2
                      else 1 end;
  update profiles set pet_level = v_new_level where id = v_uid;

  -- 2. Un-complete the quest (revoked from clients — only definer can).
  update tasks
    set completed = false, completed_at = null,
        completion_duration_minutes = null, is_procrastinated = false
    where id = v_c.quest_id;

  -- 3. Streak: decrement ONLY if this completion set it AND it was the sole
  --    completion that calendar day (otherwise the day still counts).
  if v_c.streak_incremented then
    v_day := (v_c.time_completed at time zone 'utc')::date;
    select count(*) into v_same_day from tasks
      where user_id = v_uid and completed and id <> v_c.quest_id
        and (completed_at at time zone 'utc')::date = v_day;
    if v_same_day = 0 then
      select snapshot_data into v_snap from user_snapshots where id = v_c.snapshot_id;
      update profiles
        set current_streak       = coalesce((v_snap->>'current_streak')::int, 0),
            last_completion_date  = nullif(v_snap->>'last_completion_date', '')::date
        where id = v_uid;
    end if;
  end if;

  -- 4. Mark the completion reverted.
  update quest_completions
    set status = 'reverted', admin_verdict = 'rejected'
    where id = p_completion_id;

  -- 5. Record the cheat event.
  insert into cheat_events (
    user_id, completion_id, violation_type, severity, description,
    data_snapshot, points_reverted, quests_reverted, streak_reverted
  ) values (
    v_uid, p_completion_id, coalesce(p_reason, 'admin_rejected'), 'strike',
    'Completion reverted (' || coalesce(p_reason, 'flagged') || ')',
    (select snapshot_data from user_snapshots where id = v_c.snapshot_id),
    v_c.points_earned, 1, case when v_c.streak_incremented then 1 else 0 end
  );

  return jsonb_build_object('ok', true, 'reverted', true, 'points_reverted', v_c.points_earned);
end;
$$;

-- Grant to service_role for the serverless AI path. Admins reach it only via
-- admin_review_completion (internal call, no direct grant needed).
grant execute on function rollback_completion(uuid, text) to service_role;


-- ── 6. admin_review_completion(): approve / reject / suspicious ──
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
          admin_reviewer = v_admin, admin_reason = p_reason
      where id = p_completion_id;

    -- Grant the "verified_quest" badge (both stores, mirroring complete_task).
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
      set admin_reviewer = v_admin, admin_reason = p_reason
      where id = p_completion_id;
    perform rollback_completion(p_completion_id, 'admin_rejected');
    return jsonb_build_object('ok', true, 'status', 'reverted');

  elsif p_action = 'suspicious' then
    update quest_completions
      set admin_verdict = 'suspicious', admin_reviewer = v_admin, admin_reason = p_reason
      where id = p_completion_id;
    return jsonb_build_object('ok', true, 'status', 'suspicious');

  else
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;
end;
$$;

grant execute on function admin_review_completion(uuid, text, text) to authenticated;
