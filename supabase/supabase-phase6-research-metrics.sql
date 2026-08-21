-- ============================================================
--  PET QUEST — PHASE 6: BEHAVIORAL RESEARCH METRICS
--  Paste this ENTIRE file into Supabase → SQL Editor → Run.
--  Safe to re-run: every statement is idempotent.
--
--  Adds per-quest behavioural tracking for a procrastination study:
--    • planned_completion_date      — the user's intended finish time
--    • completion_duration_minutes  — created_at → completed_at, in minutes
--    • is_procrastinated            — flagged late by the rules below
--
--  DESIGN NOTE — why duration and the flag are computed here, not in the
--  browser. Completion is server-authoritative: the client is REVOKE'd from
--  writing tasks.(completed, completed_at, started_at), and complete_task()
--  (SECURITY DEFINER) is the only path that marks a quest done. These two
--  columns are the dependent variables of the study, so they are written in
--  the same trusted function — a participant cannot edit their own duration or
--  un-flag their own procrastination. planned_completion_date is different: it
--  is the user's own planning input, captured on insert from the client.
-- ============================================================


-- ── 1. Schema: three columns on tasks ──
alter table tasks
  add column if not exists planned_completion_date     timestamptz,
  add column if not exists completion_duration_minutes integer,
  add column if not exists is_procrastinated           boolean not null default false;

-- The client writes planned_completion_date on INSERT (it is planning intent,
-- not a reward), so the column must be client-writable. The existing
-- column-level grants on tasks already permit INSERT of user columns; this is
-- explicit and harmless if already covered.
grant insert (planned_completion_date) on tasks to authenticated;

-- Index the flag: the research aggregates below filter on it across all rows.
create index if not exists tasks_is_procrastinated_idx
  on tasks (is_procrastinated) where completed;


-- ============================================================
-- ── 2. complete_task(): now also records the research metrics ──
--
-- This REPLACES the Phase 4 complete_task(). It is the Phase 4 body verbatim
-- except for two additions, both marked  -- [research]  :
--   • duration + is_procrastinated are computed from the loaded row, and
--   • written in the same UPDATE that marks the task complete, and
--   • echoed back in the return payload so the UI can mirror them without a
--     refetch.
--
-- Procrastination rule (either condition flags it):
--   • completed more than 24 h after created_at, OR
--   • a planned_completion_date exists and completion is more than 2 h past it.
-- ============================================================
create or replace function complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_task         tasks%rowtype;
  v_min_secs     int;
  v_points       int;
  v_lock_until   timestamptz;
  v_existing     jsonb;
  v_recent       jsonb;
  v_burst        int;

  v_today        date;
  v_last         date;
  v_streak       int;
  v_longest      int;
  v_total        int;
  v_new_points   int;
  v_level        int;
  v_old_level    int;
  v_badges       jsonb;
  v_new_badges   text[] := '{}';
  v_bonus        int := 0;
  v_milestone    int := 0;
  v_gift         text := null;
  v_title        text := null;
  v_done_count   int;
  v_today_count  int;
  v_owned_count  int;
  v_boss_unlock  boolean := false;
  v_was_boss_ok  boolean;

  v_now          timestamptz := now();  -- [research] one clock for award + metrics
  v_duration_min int;                   -- [research]
  v_procrast     boolean;               -- [research]
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- 1. Load task, require ownership and not-yet-completed.
  select * into v_task from tasks where id = p_task_id;
  if not found or v_task.user_id <> v_uid or v_task.completed then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- 2. Time gate by difficulty. Boss Battles demand 5 hours of work.
  v_min_secs := case v_task.difficulty
                  when 'boss'   then 18000
                  when 'hard'   then 7200
                  when 'medium' then 1800
                  else 300
                end;
  v_points   := case v_task.difficulty
                  when 'boss'   then 200
                  when 'hard'   then 50
                  when 'medium' then 25
                  else 10
                end;

  if v_now - coalesce(v_task.started_at, v_task.created_at) < make_interval(secs => v_min_secs) then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;

  -- 3. Existing burst lock still active?
  select completion_lock_until, last_completions, current_streak, longest_streak,
         last_completion_date, total_points_earned, pet_level, badges, boss_battles_unlocked
    into v_lock_until, v_existing, v_streak, v_longest,
         v_last, v_total, v_old_level, v_badges, v_was_boss_ok
    from profiles where id = v_uid;

  if v_lock_until is not null and v_now < v_lock_until then
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
        select v_now
      ) u
      order by ts desc
      limit 5
    ) x;

  select count(*) into v_burst
    from jsonb_array_elements_text(v_recent) as e(val)
    where e.val::timestamptz > v_now - interval '60 seconds';

  if v_burst >= 3 then
    v_lock_until := v_now + interval '5 minutes';
    update profiles
      set last_completions = v_recent, completion_lock_until = v_lock_until
      where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_lock_until);
  end if;

  -- [research] 5a. Behavioural metrics, from the loaded row and one clock.
  v_duration_min := floor(extract(epoch from (v_now - v_task.created_at)) / 60.0)::int;
  v_procrast :=
       (v_now - v_task.created_at > interval '24 hours')
    or (v_task.planned_completion_date is not null
        and v_now > v_task.planned_completion_date + interval '2 hours');

  -- 5b. Award the quest, recording the metrics in the same write.
  update tasks
     set completed                    = true,
         completed_at                 = v_now,
         completion_duration_minutes  = v_duration_min,  -- [research]
         is_procrastinated            = v_procrast       -- [research]
   where id = p_task_id;

  v_total := coalesce(v_total, 0) + v_points;

  -- 6. Daily streak. Uses the user's calendar day in UTC.
  v_today  := (v_now at time zone 'utc')::date;
  v_streak := coalesce(v_streak, 0);
  if v_last = v_today then
    null;                                    -- already counted today
  elsif v_last = v_today - 1 then
    v_streak := v_streak + 1;                -- consecutive day
  else
    v_streak := 1;                           -- first ever, or streak broken
  end if;
  v_longest := greatest(coalesce(v_longest, 0), v_streak);

  -- 7. Streak milestones — only on the day the streak first reaches them.
  if v_last is distinct from v_today then
    if v_streak = 7 then
      v_milestone := 7;  v_bonus := 50;
    elsif v_streak = 30 then
      v_milestone := 30; v_gift := 'Rare';
    elsif v_streak = 100 then
      v_milestone := 100; v_gift := 'Epic';
    elsif v_streak = 365 then
      v_milestone := 365; v_gift := 'Legendary'; v_title := 'Eternal Champion';
    end if;
  end if;

  -- Grant the milestone accessory: first one of that rarity not already owned.
  if v_gift is not null then
    select a.id into v_gift
      from (values
        ('santa_hat','Rare'),   ('monocle','Rare'),    ('tuxedo','Rare'),
        ('wizard_hat','Epic'),  ('witch_hat','Epic'),  ('cape','Epic'), ('rainbow','Epic'),
        ('crown','Legendary'),  ('armor','Legendary'), ('wings','Legendary')
      ) as a(id, rarity)
      where a.rarity = v_gift
        and not exists (
          select 1 from owned_accessories o
          where o.user_id = v_uid and o.accessory_id = a.id
        )
      limit 1;

    if v_gift is not null then
      insert into owned_accessories (user_id, accessory_id)
        values (v_uid, v_gift)
        on conflict do nothing;
    end if;
  end if;

  v_new_points := v_points + v_bonus;
  v_total      := v_total + v_bonus;

  -- 8. Evolution level from lifetime points.
  v_level := case when v_total >= 5000 then 5
                  when v_total >= 1500 then 4
                  when v_total >= 500  then 3
                  when v_total >= 100  then 2
                  else 1 end;

  -- 9. Counters used by the badge checks.
  select count(*) into v_done_count  from tasks where user_id = v_uid and completed;
  select count(*) into v_today_count from tasks
    where user_id = v_uid and completed
      and (completed_at at time zone 'utc')::date = v_today;
  select count(*) into v_owned_count from owned_accessories where user_id = v_uid;

  v_badges := coalesce(v_badges, '[]'::jsonb);

  -- 10. Badge evaluation.
  if v_done_count >= 1   and not v_badges ? 'first_steps'   then v_new_badges := array_append(v_new_badges, 'first_steps');   end if;
  if v_done_count >= 50  and not v_badges ? 'scholar'       then v_new_badges := array_append(v_new_badges, 'scholar');       end if;
  if v_streak    >= 7    and not v_badges ? 'unstoppable'   then v_new_badges := array_append(v_new_badges, 'unstoppable');   end if;
  if v_level     >= 3    and not v_badges ? 'dragon_master' then v_new_badges := array_append(v_new_badges, 'dragon_master'); end if;
  if v_owned_count >= 5  and not v_badges ? 'collector'     then v_new_badges := array_append(v_new_badges, 'collector');     end if;
  if v_today_count >= 5  and not v_badges ? 'speed_demon'   then v_new_badges := array_append(v_new_badges, 'speed_demon');   end if;

  if array_length(v_new_badges, 1) > 0 then
    v_badges := v_badges || to_jsonb(v_new_badges);
    insert into achievements (user_id, badge_id)
      select v_uid, unnest(v_new_badges)
      on conflict (user_id, badge_id) do nothing;
  end if;

  -- 11. Boss Battles unlock at 20 completed quests.
  v_boss_unlock := (v_done_count >= 20);

  -- 12. Persist everything in one write.
  update profiles
    set points                = points + v_new_points,
        total_points_earned   = v_total,
        current_streak        = v_streak,
        longest_streak        = v_longest,
        last_completion_date  = v_today,
        pet_level             = v_level,
        badges                = v_badges,
        boss_battles_unlocked = v_boss_unlock,
        last_completions      = v_recent
    where id = v_uid
    returning points into v_new_points;

  return jsonb_build_object(
    'ok',              true,
    'points',          v_new_points,
    'awarded',         v_points,
    'bonus',           v_bonus,
    'total_earned',    v_total,
    'streak',          v_streak,
    'longest_streak',  v_longest,
    'milestone',       v_milestone,
    'gift',            v_gift,
    'title',           v_title,
    'level',           v_level,
    'level_up',        v_level > coalesce(v_old_level, 1),
    'new_badges',      to_jsonb(v_new_badges),
    'boss_unlocked',   v_boss_unlock and not coalesce(v_was_boss_ok, false),
    'duration_minutes', v_duration_min,  -- [research]
    'procrastinated',   v_procrast       -- [research]
  );
end;
$$;

grant execute on function complete_task(uuid) to authenticated;


-- ── 2b. Reset also clears the research columns ──
-- So an admin re-testing a quest starts from a clean behavioural slate rather
-- than carrying a stale duration/flag from the previous run. REPLACES the
-- Phase 5 admin_reset_my_tasks().
create or replace function admin_reset_my_tasks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update tasks
    set completed = false, completed_at = null, started_at = now(),
        completion_duration_minutes = null, is_procrastinated = false  -- [research]
    where user_id = v_uid;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_reset_my_tasks() to authenticated;


-- ============================================================
-- ── 3. get_research_analytics(): admin-only aggregate for the study ──
--
-- Returns one jsonb object covering ALL users, so it is SECURITY DEFINER and
-- gated on is_admin() (a plain view would be clipped to the caller's own rows
-- by RLS on tasks). All three metrics are computed over completed quests.
--
--   • duration_by_difficulty : avg completion_duration_minutes per difficulty,
--                              with a completed-count so small samples are
--                              visible rather than misleading.
--   • procrastination_rate   : % of completed quests flagged is_procrastinated.
--   • planning_accuracy      : of completed quests that HAD a planned date,
--                              the % finished on or before it. Quests with no
--                              plan are excluded from the denominator — you
--                              cannot be on-time for a deadline you never set.
-- ============================================================
create or replace function get_research_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result        jsonb;
  v_by_diff       jsonb;
  v_total_done    int;
  v_procrast_done int;
  v_planned_done  int;
  v_on_time       int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Average duration + count per difficulty.
  select coalesce(jsonb_object_agg(difficulty, stats), '{}'::jsonb)
    into v_by_diff
    from (
      select
        difficulty,
        jsonb_build_object(
          'avg_duration_minutes',
            round(avg(completion_duration_minutes)
                  filter (where completion_duration_minutes is not null)::numeric, 1),
          'completed_count', count(*)
        ) as stats
      from tasks
      where completed
      group by difficulty
    ) d;

  -- Overall procrastination rate.
  select
    count(*) filter (where completed),
    count(*) filter (where completed and is_procrastinated)
    into v_total_done, v_procrast_done
    from tasks;

  -- Planning accuracy, over quests that carried a plan.
  select
    count(*) filter (where completed and planned_completion_date is not null),
    count(*) filter (where completed and planned_completion_date is not null
                       and completed_at <= planned_completion_date)
    into v_planned_done, v_on_time
    from tasks;

  v_result := jsonb_build_object(
    'ok', true,
    'duration_by_difficulty', v_by_diff,
    'total_completed', v_total_done,
    'procrastinated_count', v_procrast_done,
    'procrastination_rate', case when v_total_done = 0 then 0
                                 else round(v_procrast_done::numeric / v_total_done * 100, 1) end,
    'planned_completed', v_planned_done,
    'on_time_count', v_on_time,
    'planning_accuracy', case when v_planned_done = 0 then null
                              else round(v_on_time::numeric / v_planned_done * 100, 1) end
  );

  return v_result;
end;
$$;

grant execute on function get_research_analytics() to authenticated;


-- ============================================================
-- DONE! Phases 1, 3 and 4 (database side) are now live.
-- The frontend reads tasks.* directly, so the new columns flow through with
-- no further query changes.
-- ============================================================
