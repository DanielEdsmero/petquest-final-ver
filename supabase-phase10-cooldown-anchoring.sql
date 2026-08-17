-- =============================================================================
-- PetQuest — Phase 10: Anchor the completion cooldown to LAST COMPLETION
-- Run this in the Supabase SQL editor.
--
-- Round 5 change (owner-approved): the per-difficulty "minimum active time" gate
-- used to be anchored to a quest's creation time, so brand-new starter quests
-- showed an "Available in 5:00 / 2:00:00" countdown and could not be verified
-- immediately. Quests here complete exactly once (completed = true is terminal),
-- so that gate only ever delayed a first completion — it was not farm protection.
--
-- This redefines complete_task() to REMOVE the creation-anchored time gate. A
-- never-completed quest is instantly completable. The real anti-abuse control —
-- the 3-completions-in-60-seconds burst lock — is kept unchanged. (If quests ever
-- become repeatable, re-add a gate keyed on tasks.completed_at, not created_at.)
-- =============================================================================

create or replace function complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        tasks%rowtype;
  v_uid         uuid := auth.uid();
  v_points      int;
  v_new_points  int;
  v_lock_until  timestamptz;
  v_existing    jsonb;
  v_recent      jsonb;
  v_burst       int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- 1. Load task, require ownership and not-yet-completed.
  select * into v_task from tasks where id = p_task_id;
  if not found or v_task.user_id <> v_uid or v_task.completed then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- 2. Points by difficulty. (The creation-anchored time gate is intentionally
  --    gone — see the header note.)
  v_points := case v_task.difficulty
                when 'hard'   then 50
                when 'medium' then 25
                else 10
              end;

  -- 3. Existing lock still active?
  select completion_lock_until, last_completions
    into v_lock_until, v_existing
    from profiles where id = v_uid;
  if v_lock_until is not null and now() < v_lock_until then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_lock_until);
  end if;

  -- 4. Rate-limit: append now(), keep the most recent 5, count the last 60s.
  select coalesce(jsonb_agg(to_jsonb(ts) order by ts desc), '[]'::jsonb)
    into v_recent
    from (
      select ts from (
        select e.val::timestamptz as ts
          from jsonb_array_elements_text(coalesce(v_existing, '[]'::jsonb)) as e(val)
        union all
        select now()
      ) u
      order by ts desc
      limit 5
    ) x;

  select count(*) into v_burst
    from jsonb_array_elements_text(v_recent) as e(val)
    where e.val::timestamptz > now() - interval '60 seconds';

  if v_burst >= 3 then
    v_lock_until := now() + interval '5 minutes';
    update profiles
      set last_completions = v_recent, completion_lock_until = v_lock_until
      where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_lock_until);
  end if;

  -- 5. Award: complete the task and add points atomically.
  update tasks set completed = true, completed_at = now() where id = p_task_id;
  update profiles
    set points = points + v_points, last_completions = v_recent
    where id = v_uid
    returning points into v_new_points;

  return jsonb_build_object('ok', true, 'points', v_new_points);
end;
$$;

-- complete_task stays revoked from clients (Phase 8): submit_completion() calls
-- it internally as the owner, so the proof pipeline remains the only award path.
