-- =============================================================================
-- PetQuest — Phase 11: one-time collapse of duplicate quests
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Earlier rounds inserted starter quests without per-row dedupe, so some accounts
-- accumulated duplicate quest rows ("Practice flashcards" ×2, etc.). Round 6 fixed
-- the insert path; this cleans up the rows that already exist.
--
-- Strategy: within each user, for quests with the same normalized text
-- (lower-cased, trimmed), keep the OLDEST row and delete the newer duplicates —
-- but only ones that are NOT completed, so completed history is never touched.
-- =============================================================================

with ranked as (
  select id,
         row_number() over (
           partition by user_id, lower(btrim(text))
           order by created_at asc
         ) as rn
    from tasks
   where completed = false
)
delete from tasks
 where id in (select id from ranked where rn > 1);
