-- ============================================================
--  PET QUEST — SUPABASE DATABASE SETUP
--  Paste this ENTIRE file into Supabase → SQL Editor → Run
-- ============================================================

-- 1. Enable UUID generation
create extension if not exists "uuid-ossp";


-- ============================================================
-- 2. TABLES
-- ============================================================

-- User profiles (extends Supabase auth.users)
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  username    text        not null,
  role        text        not null default 'user' check (role in ('user', 'admin')),
  points      integer     not null default 0,
  selected_pet_id text,
  created_at  timestamptz not null default now()
);

-- Pet stats per user
create table if not exists pet_stats (
  user_id      uuid references profiles(id) on delete cascade primary key,
  hunger       numeric not null default 80,
  cleanliness  numeric not null default 78,
  happiness    numeric not null default 72,
  updated_at   timestamptz not null default now()
);

-- Tasks / quests
create table if not exists tasks (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        references profiles(id) on delete cascade not null,
  text         text        not null,
  completed    boolean     not null default false,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- Accessories the user has purchased
create table if not exists owned_accessories (
  id            uuid        primary key default uuid_generate_v4(),
  user_id       uuid        references profiles(id) on delete cascade not null,
  accessory_id  text        not null,
  purchased_at  timestamptz not null default now(),
  unique(user_id, accessory_id)
);

-- Which accessory is currently equipped per slot/category
create table if not exists equipped_accessories (
  user_id       uuid  references profiles(id) on delete cascade not null,
  category      text  not null,
  accessory_id  text  not null,
  primary key (user_id, category)
);


-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
--    Every table is locked down — users only see their own
--    data; admins can read everything.
-- ============================================================

alter table profiles           enable row level security;
alter table pet_stats          enable row level security;
alter table tasks              enable row level security;
alter table owned_accessories  enable row level security;
alter table equipped_accessories enable row level security;

-- Helper function: is the current user an admin?
create or replace function is_admin()
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- profiles ----------
create policy "profiles: own read"
  on profiles for select
  using ( auth.uid() = id or is_admin() );

create policy "profiles: own insert"
  on profiles for insert
  with check ( auth.uid() = id );

create policy "profiles: own update"
  on profiles for update
  using ( auth.uid() = id );

-- ---------- pet_stats ----------
create policy "pet_stats: own all"
  on pet_stats for all
  using ( auth.uid() = user_id );

create policy "pet_stats: admin read"
  on pet_stats for select
  using ( is_admin() );

-- ---------- tasks ----------
create policy "tasks: own all"
  on tasks for all
  using ( auth.uid() = user_id );

create policy "tasks: admin read"
  on tasks for select
  using ( is_admin() );

-- ---------- owned_accessories ----------
create policy "owned_accessories: own all"
  on owned_accessories for all
  using ( auth.uid() = user_id );

create policy "owned_accessories: admin read"
  on owned_accessories for select
  using ( is_admin() );

-- ---------- equipped_accessories ----------
create policy "equipped_accessories: own all"
  on equipped_accessories for all
  using ( auth.uid() = user_id );

create policy "equipped_accessories: admin read"
  on equipped_accessories for select
  using ( is_admin() );


-- ============================================================
-- 4. AUTO-CREATE PROFILE ON SIGN-UP
--    Whenever a new user registers via Supabase Auth,
--    this trigger creates their profile row automatically.
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- 5. ANALYTICS HELPER VIEW (used by the Admin Dashboard)
--    Aggregates per-user task stats so the admin page can
--    do a single query instead of many round trips.
-- ============================================================

create or replace view user_analytics as
select
  p.id                                                      as user_id,
  p.username,
  p.role,
  p.points,
  p.selected_pet_id,
  p.created_at,

  -- Task counts
  count(t.id)                                               as total_tasks,
  count(t.id) filter (where t.completed)                    as completed_tasks,
  count(t.id) filter (where not t.completed)                as pending_tasks,

  -- Efficiency: completed / total  (0 if no tasks)
  case
    when count(t.id) = 0 then 0
    else round(
      count(t.id) filter (where t.completed)::numeric
      / count(t.id)::numeric * 100, 1)
  end                                                       as efficiency_pct,

  -- Avg completion time in hours
  round(
    avg(
      extract(epoch from (t.completed_at - t.created_at)) / 3600.0
    ) filter (where t.completed and t.completed_at is not null)
  ::numeric, 1)                                             as avg_completion_hours,

  -- Procrastination: tasks that took > 24 h to complete
  count(t.id) filter (
    where t.completed
    and t.completed_at is not null
    and t.completed_at - t.created_at > interval '24 hours'
  )                                                         as procrastinated_tasks,

  -- Last active
  max(t.completed_at)                                       as last_active

from profiles p
left join tasks t on t.user_id = p.id
group by p.id, p.username, p.role, p.points, p.selected_pet_id, p.created_at;

-- Grant the view to authenticated users (RLS on base tables still applies)
grant select on user_analytics to authenticated;


-- ============================================================
-- 6. DAILY ACTIVITY VIEW  (sparkline / line chart data)
-- ============================================================

create or replace view daily_completions as
select
  user_id,
  date_trunc('day', completed_at)::date as day,
  count(*)                              as completions
from tasks
where completed = true
  and completed_at is not null
group by user_id, date_trunc('day', completed_at)::date
order by day;

grant select on daily_completions to authenticated;


-- ============================================================
-- DONE!
-- Now go to Authentication → Users → "Add user"
-- to create your admin account (see README for details).
-- ============================================================


-- ============================================================
-- PHASE 2: QUEST MODES & DIFFICULTIES
-- Run this section in Supabase SQL Editor after the initial
-- schema is already in place.
-- ============================================================

-- Add game mode and period tracking to profiles
alter table profiles
  add column if not exists game_mode text check (game_mode in ('fitness', 'academic', 'custom')),
  add column if not exists hard_period_start   timestamptz not null default now(),
  add column if not exists medium_period_start timestamptz not null default now();

-- Add difficulty to tasks (existing rows default to 'easy')
alter table tasks
  add column if not exists difficulty text not null default 'easy'
    check (difficulty in ('easy', 'medium', 'hard'));

-- Progress logs for medium/hard tasks
create table if not exists task_progress (
  id         uuid        primary key default uuid_generate_v4(),
  task_id    uuid        references tasks(id) on delete cascade not null,
  user_id    uuid        references profiles(id) on delete cascade not null,
  note       text        not null,
  logged_at  timestamptz not null default now()
);

alter table task_progress enable row level security;

create policy "task_progress: own all"
  on task_progress for all
  using ( auth.uid() = user_id );

create policy "task_progress: admin read"
  on task_progress for select
  using ( is_admin() );

-- Allow admins to update other users' profiles (needed for period resets)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'profiles: admin update'
  ) then
    execute $policy$
      create policy "profiles: admin update"
        on profiles for update
        using ( is_admin() )
    $policy$;
  end if;
end $$;

-- ============================================================
-- PHASE 3: ANTI-CHEAT TIME-GATING
--
-- ⚠️  ORDERING WARNING
-- This section defines complete_task(). So does
-- supabase-phase4-gamification.sql, which SUPERSEDES this one.
-- `create or replace` means WHICHEVER RUNS LAST WINS — re-running
-- this file after Phase 4 silently reverts the function to the
-- pre-gamification version (streaks, evolution and badges stop
-- updating, and the RPC returns only {ok, points}).
--
-- If you re-run this file for any reason, ALWAYS re-run
-- supabase-phase4-gamification.sql afterwards, then verify:
--   select prosrc like '%total_points_earned%' as is_phase4
--     from pg_proc where proname = 'complete_task';   -- must be true
--
-- Run this section in Supabase SQL Editor after Phase 2.
-- Enforces a minimum active time per difficulty before a quest
-- can be completed, plus a burst rate-limit lock, and moves the
-- point award server-side so the gates cannot be bypassed.
-- ============================================================

-- tasks: start anchor for the time gate
alter table tasks add column if not exists started_at timestamptz;
-- Backfill existing quests to their creation time so in-progress
-- quests are not punished by the new gate.
update tasks set started_at = created_at where started_at is null;
-- New rows start their timer at insert time.
alter table tasks alter column started_at set default now();

-- profiles: rate-limit state
alter table profiles
  add column if not exists last_completions      jsonb not null default '[]'::jsonb,
  add column if not exists completion_lock_until timestamptz;

-- Server-side validated completion. Enforces the time gate and the
-- 3-completions-in-60s -> 5-minute lock, then awards points atomically.
-- Returns { ok, error, points, locked_until }.
create or replace function complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        tasks%rowtype;
  v_uid         uuid := auth.uid();
  v_min_secs    int;
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

  -- 2. Time gate by difficulty.
  v_min_secs := case v_task.difficulty
                  when 'hard'   then 7200
                  when 'medium' then 1800
                  else 300
                end;
  v_points   := case v_task.difficulty
                  when 'hard'   then 50
                  when 'medium' then 25
                  else 10
                end;

  if now() - coalesce(v_task.started_at, v_task.created_at) < make_interval(secs => v_min_secs) then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;

  -- 3. Existing lock still active?
  select completion_lock_until, last_completions
    into v_lock_until, v_existing
    from profiles where id = v_uid;
  if v_lock_until is not null and now() < v_lock_until then
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'locked_until', v_lock_until);
  end if;

  -- 4. Rate-limit: append now(), keep the most recent 5, count the last 60s.
  --    Timestamps are stored as jsonb strings (to_jsonb of a timestamptz),
  --    so jsonb_array_elements_text strips the quotes back to castable ISO text.
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
      set last_completions = v_recent,
          completion_lock_until = v_lock_until
      where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'locked_until', v_lock_until);
  end if;

  -- 5. Award: complete the task and add points atomically.
  update tasks set completed = true, completed_at = now() where id = p_task_id;
  update profiles
    set points = points + v_points,
        last_completions = v_recent
    where id = v_uid
    returning points into v_new_points;

  return jsonb_build_object('ok', true, 'points', v_new_points);
end;
$$;

grant execute on function complete_task(uuid) to authenticated;

-- Close the direct write path the RPC exists to guard. Without this, a user
-- could still bypass every gate with a plain
--   supabase.from('tasks').update({ completed: true })
-- from the browser console. complete_task() is SECURITY DEFINER so it runs as
-- the owner and is unaffected. No client code updates these columns directly.
revoke update (completed, completed_at, started_at) on tasks from authenticated;
revoke update (completed, completed_at, started_at) on tasks from anon;

-- NOTE: profiles.points is deliberately still client-writable because
-- spendPoints() (accessories shop, GameContext.jsx) debits it directly. Until
-- that is also moved into an RPC, a determined user can still award themselves
-- points by writing profiles.points, without touching tasks. Closing that hole
-- requires a matching spend_points() RPC plus:
--   revoke update (points) on profiles from authenticated, anon;
