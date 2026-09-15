-- =============================================================================
-- PetQuest — Phase 13b: sign-up can never create an admin
-- Run by hand in the Supabase SQL editor, AFTER supabase-phase13-spend-points.sql.
-- Idempotent. Run WITHOUT RLS.
--
-- The hole: handle_new_user() copied raw_user_meta_data->>'role' into
-- profiles.role. Sign-up metadata is caller-supplied, so anyone holding the
-- public anon key could run
--   supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
-- and be created as an admin. The web only ever sends `username`.
--
-- What this does
--   §1 handle_new_user(): role is always the literal 'user'. Metadata is read
--      for the username only. Same trigger name, same firing point, so the
--      rest of the sign-up flow is unchanged.
--   §2 profiles_signup_role_guard: a BEFORE INSERT trigger on profiles that
--      forces role = 'user' when the insert comes straight from a client
--      (current_user anon/authenticated, not an admin). The `profiles: own
--      insert` RLS policy lets a user insert their own row; this makes sure
--      that row cannot arrive as an admin either.
--
-- What this does NOT do
--   It never updates an existing profiles row: current admin accounts keep
--   their role. Promote future admins by hand in the dashboard (Table editor →
--   profiles → role), or as an existing admin via the cheat panel.
--   It does not redefine complete_task, submit_completion, rollback_completion,
--   spend_points, care_pet or profiles_economy_guard, and it does not touch
--   points or any award.
--
-- Rollback (restores the phase-13 state; the sign-up hole would be open again):
--   drop trigger if exists profiles_signup_role_guard on public.profiles;
--   drop function if exists public.profiles_signup_role_guard();
--   -- then re-run section 4 of supabase-schema.sql to restore the old handle_new_user()
-- =============================================================================


-- ── 1. handle_new_user: role is never taken from sign-up metadata ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
    'user'   -- never new.raw_user_meta_data->>'role'
  )
  on conflict (id) do nothing;   -- a re-fired trigger must not error the sign-up
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. profiles_signup_role_guard: a client insert cannot carry a role ──
-- NOT security definer: it must run as the caller so current_user tells a
-- direct client insert apart from handle_new_user() (owner) and the service role.
create or replace function public.profiles_signup_role_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and not is_admin() then
    new.role := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_signup_role_guard on public.profiles;
create trigger profiles_signup_role_guard
  before insert on public.profiles
  for each row execute function public.profiles_signup_role_guard();


-- ── 3. Verify ──
-- select prosrc from pg_proc where proname = 'handle_new_user';
--   → contains "'user'   -- never new.raw_user_meta_data->>'role'" and no coalesce on role
-- select tgname from pg_trigger where tgname in ('on_auth_user_created', 'profiles_signup_role_guard');
--
-- Acceptance (from the browser console on the deployed site, signed out):
--   await supabase.auth.signUp({ email: 'probe+1@example.com', password: 'Probe-1234', options: { data: { username: 'probe', role: 'admin' } } })
--   then in Table editor → profiles → the new row has role = 'user'.
-- Existing admins: select id, username, role from profiles where role = 'admin';
--   → the same rows as before this migration (nothing here updates profiles).
