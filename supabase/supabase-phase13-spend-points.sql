-- =============================================================================
-- PetQuest — Phase 13: server-side point spending
-- Run by hand in the Supabase SQL editor, AFTER supabase-phase12-quest-validity.sql.
-- Idempotent. Run WITHOUT RLS (the editor's "destructive" warning is about the
-- `drop trigger if exists`, which is followed immediately by its re-creation).
--
-- Closes the hole supabase-schema.sql has documented since Phase 3:
--
--   > profiles.points is deliberately still client-writable because
--   > spendPoints() debits it directly. Until that is also moved into an RPC,
--   > a determined user can still award themselves points by writing
--   > profiles.points, without touching tasks.
--
-- What this adds
--   §1 spend_points(p_amount, p_reason): the ONLY way a participant's balance
--      goes down. Atomic — the debit and the balance check are one UPDATE, so
--      two concurrent spends cannot both succeed on the same 10 points.
--   §2 care_pet(p_action): feed / wash / play. Debits the care cost and raises
--      the stat in one transaction, so a spend can never land without its stat
--      and vice versa. Cost and boost live here, not in the client.
--   §3 profiles_economy_guard trigger: a browser/phone write (current_user =
--      anon/authenticated) by a NON-admin can no longer change points,
--      total_points_earned, current_streak, longest_streak,
--      last_completion_date, pet_level, badges, boss_battles_unlocked — or
--      role. Admins keep the cheat panel (it writes these directly as an
--      authenticated user; is_admin() lets it through). SECURITY DEFINER RPCs
--      run as the function owner and the Vercel functions as service_role, so
--      every trusted path is unaffected.
--
-- What this does NOT touch
--   complete_task, submit_completion, rollback_completion, admin_* — none are
--   redefined. pet_stats stays own-writable (the web's decay timer upserts it).
--
-- Why a trigger and not `revoke update (points) on profiles`: Postgres
-- column-level REVOKE has no effect while the role still holds the table-level
-- privilege, and Supabase grants ALL on public tables to anon/authenticated. A
-- column revoke would silently do nothing (see phase 12 for the same reasoning
-- on tasks).
--
-- Rollback (reverses everything here):
--   drop trigger if exists profiles_economy_guard on public.profiles;
--   drop function if exists public.profiles_economy_guard();
--   drop function if exists public.care_pet(text);
--   drop function if exists public.spend_points(integer, text);
-- =============================================================================


-- ── 1. spend_points: atomic debit ──
-- Returns {ok:true, points:<new balance>} or {ok:false, error:<code>, points:<balance>}.
-- Error codes: unauthenticated, invalid_amount, insufficient_points.
create or replace function public.spend_points(p_amount integer, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_points integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  -- The balance check is part of the UPDATE's WHERE, so it is atomic: under
  -- concurrent calls the row lock serialises them and the second one sees the
  -- debited balance and matches zero rows.
  update profiles
     set points = points - p_amount
   where id = v_uid
     and points >= p_amount
  returning points into v_points;

  if not found then
    select points into v_points from profiles where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'insufficient_points', 'points', coalesce(v_points, 0));
  end if;

  return jsonb_build_object('ok', true, 'points', v_points, 'reason', p_reason);
end;
$$;

revoke all on function public.spend_points(integer, text) from public, anon;
grant execute on function public.spend_points(integer, text) to authenticated;


-- ── 2. care_pet: feed / wash / play in one transaction ──
-- Mirrors the web's numbers exactly: 10 points, +30 on the stat, capped at 100.
-- Returns {ok:true, points, stats:{hunger,cleanliness,happiness}} or
-- {ok:false, error:<code>, points}. Error codes as spend_points plus
-- invalid_action and no_pet.
create or replace function public.care_pet(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_cost   constant integer := 10;
  c_boost  constant numeric := 30;
  v_uid    uuid := auth.uid();
  v_col    text;
  v_points integer;
  v_stats  pet_stats%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  v_col := case p_action
             when 'feed' then 'hunger'
             when 'wash' then 'cleanliness'
             when 'play' then 'happiness'
           end;
  if v_col is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  if not exists (select 1 from profiles where id = v_uid and selected_pet_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'no_pet');
  end if;

  -- Debit first (same atomic pattern as spend_points). If this matches no row
  -- we return before touching the stat; if the stat write below fails the
  -- whole function — and the debit — rolls back.
  update profiles
     set points = points - c_cost
   where id = v_uid
     and points >= c_cost
  returning points into v_points;

  if not found then
    select points into v_points from profiles where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'insufficient_points', 'points', coalesce(v_points, 0));
  end if;

  -- A brand-new account may have no pet_stats row yet; start it at the same
  -- baseline the web uses (80 / 78 / 72) and apply the boost on top.
  insert into pet_stats (user_id, hunger, cleanliness, happiness, updated_at)
  values (v_uid, 80, 78, 72, now())
  on conflict (user_id) do nothing;

  if v_col = 'hunger' then
    update pet_stats set hunger = least(100, hunger + c_boost), updated_at = now()
     where user_id = v_uid returning * into v_stats;
  elsif v_col = 'cleanliness' then
    update pet_stats set cleanliness = least(100, cleanliness + c_boost), updated_at = now()
     where user_id = v_uid returning * into v_stats;
  else
    update pet_stats set happiness = least(100, happiness + c_boost), updated_at = now()
     where user_id = v_uid returning * into v_stats;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'cost', c_cost,
    'points', v_points,
    'stats', jsonb_build_object(
      'hunger', v_stats.hunger,
      'cleanliness', v_stats.cleanliness,
      'happiness', v_stats.happiness
    )
  );
end;
$$;

revoke all on function public.care_pet(text) from public, anon;
grant execute on function public.care_pet(text) to authenticated;


-- ── 3. profiles_economy_guard: the browser cannot write its own economy ──
-- NOT security definer on purpose: it must run as the caller so current_user
-- tells a direct client write apart from our RPCs / the service role.
create or replace function public.profiles_economy_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client  boolean := current_user in ('anon', 'authenticated');
  v_guarded text[]  := array[
    'points', 'total_points_earned', 'current_streak', 'longest_streak',
    'last_completion_date', 'pet_level', 'badges', 'boss_battles_unlocked',
    'role'
  ];
  v_col     text;
  v_old     jsonb := to_jsonb(old);
  v_new     jsonb := to_jsonb(new);
begin
  if not v_client then
    return new;
  end if;
  if is_admin() then
    return new;   -- the admin cheat panel writes these directly, as itself
  end if;

  -- Compared through jsonb so the guard keeps working (and keeps installing)
  -- even if one of these columns is renamed or absent in a given environment.
  foreach v_col in array v_guarded loop
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception 'economy_column_locked: % is managed by the server', v_col
        using errcode = 'P0001', hint = 'Use spend_points() / care_pet(); awards come from submit_completion().';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_economy_guard on public.profiles;
create trigger profiles_economy_guard
  before update on public.profiles
  for each row execute function public.profiles_economy_guard();


-- ── 4. Verify ──
-- select routine_name, security_type from information_schema.routines
--  where routine_schema = 'public' and routine_name in ('spend_points', 'care_pet', 'profiles_economy_guard');
-- select tgname, tgenabled from pg_trigger where tgname = 'profiles_economy_guard';
--
-- As a signed-in NON-admin in the app (browser console):
--   await supabase.from('profiles').update({ points: 99999 }).eq('id', (await supabase.auth.getUser()).data.user.id)
--   → error "economy_column_locked: points is managed by the server"
--   await supabase.rpc('spend_points', { p_amount: 1 })   → { ok: true, points: <balance - 1> }
--   await supabase.rpc('care_pet',     { p_action: 'feed' }) → { ok: true, points, stats }
