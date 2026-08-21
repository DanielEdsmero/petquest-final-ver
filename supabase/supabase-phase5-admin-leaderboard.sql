-- ============================================================
-- PHASE 5: LEADERBOARD + ADMIN TESTING TOOLS
--
-- Standalone file — run in the Supabase SQL Editor AFTER
-- supabase-schema.sql, Phase 3, and Phase 4. Safe to re-run.
--
-- Contains:
--   1. get_leaderboard()      — public ranking data for all players
--   2. admin_skip_timers()    — clear the anti-cheat time gate on the
--                               calling admin's own quests (for testing)
--   3. admin_reset_my_tasks() — un-complete the admin's own quests
--
-- The two admin functions are SECURITY DEFINER because Phase 3 revoked
-- direct UPDATE of tasks.(completed, completed_at, started_at) from
-- authenticated — even admins can't write those columns from the client.
-- They are gated on is_admin() and only ever touch the caller's own rows.
--
-- Progression cheats (points, streak, level, boss unlock, accessories)
-- are done client-side in the Admin page: a user may already update their
-- OWN profile row under the existing "profiles: own update" policy, so no
-- new privilege is introduced here.
-- ============================================================


-- ── 1. Leaderboard ──
-- SECURITY DEFINER so it can aggregate across every player (normal RLS
-- limits a user to their own rows). Only non-sensitive, already-public
-- profile fields are returned — no email, no auth id.
create or replace function get_leaderboard()
returns table (
  username        text,
  pet_id          text,
  current_streak  int,
  longest_streak  int,
  pet_level       int,
  points          int,
  total_completed bigint,
  easy_done       bigint,
  medium_done     bigint,
  hard_done       bigint,
  boss_done       bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.username,
    p.selected_pet_id,
    p.current_streak,
    p.longest_streak,
    p.pet_level,
    p.points,
    count(t.id) filter (where t.completed)                          as total_completed,
    count(t.id) filter (where t.completed and t.difficulty = 'easy')   as easy_done,
    count(t.id) filter (where t.completed and t.difficulty = 'medium') as medium_done,
    count(t.id) filter (where t.completed and t.difficulty = 'hard')   as hard_done,
    count(t.id) filter (where t.completed and t.difficulty = 'boss')   as boss_done
  from profiles p
  left join tasks t on t.user_id = p.id
  group by p.id, p.username, p.selected_pet_id, p.current_streak,
           p.longest_streak, p.pet_level, p.points;
$$;

grant execute on function get_leaderboard() to authenticated;


-- ── 2. Admin: skip quest completion timers ──
-- Backdates started_at on the target player's incomplete quests so the
-- per-difficulty time gate (up to 5h for boss) is already satisfied, and
-- clears any active burst lock. The quest then completes through the normal
-- complete_task() path — so the real award flow is exercised, not bypassed.
-- p_target defaults to the calling admin's own account.
--
-- Drop the earlier zero-arg versions so only the targeted overload remains.
drop function if exists admin_skip_timers();
drop function if exists admin_reset_my_tasks();

create or replace function admin_skip_timers(p_target uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_target, auth.uid());
  v_count  int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update tasks
    set started_at = now() - interval '10 days'
    where user_id = v_target and not completed;
  get diagnostics v_count = row_count;

  update profiles
    set completion_lock_until = null,
        last_completions = '[]'::jsonb
    where id = v_target;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_skip_timers(uuid) to authenticated;


-- ── 3. Admin: reset target's quests to incomplete ──
-- Lets an admin re-run completions against the same quests while testing.
create or replace function admin_reset_my_tasks(p_target uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_target, auth.uid());
  v_count  int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update tasks
    set completed = false, completed_at = null, started_at = now()
    where user_id = v_target;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_reset_my_tasks(uuid) to authenticated;


-- ── 4. Admin: grant accessories to any player ──
-- The base schema only lets a user insert into their OWN owned_accessories.
-- This adds an admin insert path so the cheat panel can grant accessories to
-- a chosen player. (Admins already have read + profile-update on all rows.)
do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'owned_accessories' and policyname = 'owned_accessories: admin write') then
    execute $p$ create policy "owned_accessories: admin write" on owned_accessories
               for insert with check ( is_admin() ) $p$;
  end if;
end $$;
