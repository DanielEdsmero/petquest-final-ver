-- =============================================================================
-- PetQuest — Phase 12: research construct fields on quests
-- Run this in the Supabase SQL editor. Safe to re-run. NOT economy-critical
-- (adds columns only; does not touch complete_task / award math).
--
-- Operationalizes the paper's independent variables on each quest:
--   goal      — the "what does done look like?" goal statement (goal setting)
--   priority  — P1 / P2 / P3 (prioritization)
-- Planning/scheduling already uses tasks.planned_completion_date; time-management
-- (on-time rate) is derived from planned_completion_date vs completed_at.
-- =============================================================================

alter table public.tasks
  add column if not exists goal text;

alter table public.tasks
  add column if not exists priority text not null default 'P2';

-- Keep priority to the three valid levels.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'tasks' and constraint_name = 'tasks_priority_check'
  ) then
    alter table public.tasks
      add constraint tasks_priority_check check (priority in ('P1','P2','P3'));
  end if;
end $$;
