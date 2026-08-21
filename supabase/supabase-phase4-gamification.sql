-- ============================================================
-- PHASE 4: GAMIFICATION SYSTEMS
--   daily streaks · pet evolution · boss battles · achievements
--
-- Standalone file — run in the Supabase SQL Editor AFTER
-- supabase-schema.sql (which must already include Phase 2 and
-- Phase 3). Safe to re-run; every statement is idempotent.
--
-- IMPORTANT: this file REPLACES the complete_task() function
-- defined in supabase-schema.sql (Phase 3). The anti-cheat
-- guarantees from Phase 3 — per-difficulty time gate, the
-- 3-in-60s burst lock, and server-side point awarding — are all
-- preserved here and extended, not dropped. Phase 3's
-- `revoke update (completed, completed_at, started_at) on tasks`
-- still applies and is not undone.
-- ============================================================


-- ── 1. profiles: progression + streak + achievement state ──
alter table profiles
  add column if not exists total_points_earned   integer not null default 0,
  add column if not exists current_streak        integer not null default 0,
  add column if not exists longest_streak        integer not null default 0,
  add column if not exists last_completion_date  date,
  add column if not exists pet_level             integer not null default 1,
  add column if not exists badges                jsonb   not null default '[]'::jsonb,
  add column if not exists boss_battles_unlocked boolean not null default false;


-- ── 2. Boss Battle difficulty ──
-- The Phase 2 column was created with an inline CHECK, which Postgres
-- auto-named tasks_difficulty_check. Swap it for one that allows 'boss'.
alter table tasks drop constraint if exists tasks_difficulty_check;
alter table tasks add constraint tasks_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard', 'boss'));


-- ── 3. achievements ──
create table if not exists achievements (
  id        uuid        primary key default uuid_generate_v4(),
  user_id   uuid        references profiles(id) on delete cascade not null,
  badge_id  text        not null,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table achievements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'achievements' and policyname = 'achievements: own read') then
    execute $p$ create policy "achievements: own read" on achievements
               for select using ( auth.uid() = user_id ) $p$;
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'achievements' and policyname = 'achievements: admin read') then
    execute $p$ create policy "achievements: admin read" on achievements
               for select using ( is_admin() ) $p$;
  end if;
end $$;

-- Badges are granted only by complete_task() (SECURITY DEFINER), never by the
-- client, so no insert/update policy is offered to authenticated users.
revoke insert, update, delete on achievements from authenticated, anon;


-- ── 4. Backfill total_points_earned from completed quest history ──
-- Reconstructed from each completed task's difficulty so the value reflects
-- what the user actually earned, independent of what they have since spent.
update profiles p
set total_points_earned = coalesce((
      select sum(case t.difficulty
                   when 'boss'   then 200
                   when 'hard'   then 50
                   when 'medium' then 25
                   else 10
                 end)
      from tasks t
      where t.user_id = p.id and t.completed
    ), 0)
where p.total_points_earned = 0;

-- Derive the starting evolution level from that backfill.
update profiles set pet_level =
  case when total_points_earned >= 5000 then 5
       when total_points_earned >= 1500 then 4
       when total_points_earned >= 500  then 3
       when total_points_earned >= 100  then 2
       else 1 end;

-- Unlock boss battles for anyone already past 20 completed quests.
update profiles p
set boss_battles_unlocked = true
where not p.boss_battles_unlocked
  and (select count(*) from tasks t where t.user_id = p.id and t.completed) >= 20;


-- ── 5. complete_task(): validated completion + progression ──
-- Everything that grants value lives here because profiles is client-writable:
-- if streaks or badges were computed in the browser, a user could set
-- current_streak = 7 and claim the milestone bonus.
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

  if now() - coalesce(v_task.started_at, v_task.created_at) < make_interval(secs => v_min_secs) then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;

  -- 3. Existing burst lock still active?
  select completion_lock_until, last_completions, current_streak, longest_streak,
         last_completion_date, total_points_earned, pet_level, badges, boss_battles_unlocked
    into v_lock_until, v_existing, v_streak, v_longest,
         v_last, v_total, v_old_level, v_badges, v_was_boss_ok
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

  -- 5. Award the quest.
  update tasks set completed = true, completed_at = now() where id = p_task_id;

  v_total := coalesce(v_total, 0) + v_points;

  -- 6. Daily streak. Uses the user's calendar day in UTC.
  v_today  := (now() at time zone 'utc')::date;
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
  -- Rarity lists mirror src/data/accessories.js — keep the two in sync.
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

  -- 10. Badge evaluation. Cheap: all counts above are already in hand.
  -- NB: array_append, not `|| 'literal'` — with an untyped literal on the
  -- right, Postgres resolves || as array-to-array concatenation and fails
  -- with "malformed array literal".
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
    'boss_unlocked',   v_boss_unlock and not coalesce(v_was_boss_ok, false)
  );
end;
$$;

grant execute on function complete_task(uuid) to authenticated;


-- ── 6. break_streak(): called on app load when a day was missed ──
-- Server-side so the client cannot fake a streak by never reporting a miss.
create or replace function break_streak()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_last   date;
  v_streak int;
  v_today  date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select last_completion_date, current_streak into v_last, v_streak
    from profiles where id = v_uid;

  -- Still current if they completed today or yesterday.
  if v_streak = 0 or v_last is null or v_last >= v_today - 1 then
    return jsonb_build_object('ok', true, 'broken', false, 'streak', coalesce(v_streak, 0));
  end if;

  update profiles set current_streak = 0 where id = v_uid;
  return jsonb_build_object('ok', true, 'broken', true, 'streak', 0, 'lost', v_streak);
end;
$$;

grant execute on function break_streak() to authenticated;
