-- =============================================================================
-- PetQuest — Phase 9: Pet evolution + egg-hatching onboarding
-- Run this in the Supabase SQL editor.
--
-- These columns are OPTIONAL research/UX metadata. The app is written to work
-- WITHOUT them (it falls back to localStorage for the evolution-seen marker and
-- gates the egg screen on selected_pet_id), so running this late is safe — it
-- just lights up cross-device de-duplication and records the hatch event.
-- =============================================================================

-- Phase 2 — highest evolution stage already celebrated for this user, so the
-- "Your companion evolved!" overlay fires exactly once per threshold (and once
-- retroactively for players who were already past a threshold when art shipped).
alter table public.profiles
  add column if not exists evolution_seen_level integer not null default 1;

-- Phase 3 — which egg the user hatched and when (the onboarding is otherwise
-- gated by selected_pet_id; these are for research/analytics).
alter table public.profiles
  add column if not exists hatched_pet_type text;

alter table public.profiles
  add column if not exists hatched_at timestamptz;

-- Phase 1 (Round 4) — explicit onboarding-finished flag. Once true, the route
-- guard sends the user straight to the dashboard forever, independent of any
-- single field. The app also treats an existing pet+mode as "done" so players
-- who onboarded before this column existed are never sent back.
alter table public.profiles
  add column if not exists onboarding_complete boolean not null default false;

-- Backfill: anyone who already has a pet AND a game mode has finished onboarding.
update public.profiles
   set onboarding_complete = true
 where onboarding_complete = false
   and selected_pet_id is not null
   and game_mode is not null;

-- NOTE: intentionally NO backfill of evolution_seen_level. Leaving existing
-- players at the default (1) is what lets them see the evolution celebration
-- ONCE retroactively for their current stage (per the approved spec). After that
-- first celebration the app writes their true stage back to this column.
