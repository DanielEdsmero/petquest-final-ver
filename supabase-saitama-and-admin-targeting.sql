-- ============================================================
-- SAITAMA MODE + TARGETED ADMIN CHEATS
-- Run this in the Supabase SQL Editor after the earlier phases.
-- Idempotent — safe to run more than once.
--
-- Contains:
--   1. Allow 'saitama' as a game_mode value.
--   2. admin_skip_timers_for(uuid)    — skip quest timers for ANY player.
--   3. admin_reset_tasks_for(uuid)    — un-complete quests for ANY player.
--   4. admin_grant_accessories(uuid, text[]) — grant accessories to ANY player.
--
-- The three functions are SECURITY DEFINER and gated on is_admin(), so a
-- non-admin can never reach another user's rows through them. They mirror the
-- self-only Phase 5/6 helpers (admin_skip_timers / admin_reset_my_tasks) but
-- take an explicit target user id.
-- ============================================================

-- ── 1. Saitama Mode: widen the game_mode check constraint ──
-- The Phase 2 column was created with an inline CHECK; Postgres auto-named it
-- profiles_game_mode_check. Drop and re-add it with the new value included.
alter table profiles drop constraint if exists profiles_game_mode_check;
alter table profiles
  add constraint profiles_game_mode_check
  check (game_mode in ('fitness', 'academic', 'custom', 'saitama'));


-- ── 2. Admin: skip quest timers for a target player ──
create or replace function admin_skip_timers_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_target');
  end if;

  update tasks
    set started_at = now() - interval '10 days'
    where user_id = p_user_id and not completed;
  get diagnostics v_count = row_count;

  update profiles
    set completion_lock_until = null,
        last_completions = '[]'::jsonb
    where id = p_user_id;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_skip_timers_for(uuid) to authenticated;


-- ── 3. Admin: un-complete all quests for a target player ──
-- Also clears the research columns so a re-test starts from a clean slate.
create or replace function admin_reset_tasks_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_target');
  end if;

  update tasks
    set completed = false, completed_at = null, started_at = now(),
        completion_duration_minutes = null, is_procrastinated = false
    where user_id = p_user_id;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_reset_tasks_for(uuid) to authenticated;


-- ── 4. Admin: grant accessories to a target player ──
-- Inserts every id in p_accessory_ids the player does not already own. Works
-- for the admin's own account too. Direct client inserts into another user's
-- owned_accessories are blocked by RLS, hence this SECURITY DEFINER path.
create or replace function admin_grant_accessories(p_user_id uuid, p_accessory_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_target');
  end if;

  insert into owned_accessories (user_id, accessory_id)
  select p_user_id, aid
  from unnest(p_accessory_ids) as aid
  on conflict (user_id, accessory_id) do nothing;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'affected', v_count);
end;
$$;

grant execute on function admin_grant_accessories(uuid, text[]) to authenticated;
