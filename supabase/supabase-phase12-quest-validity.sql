-- =============================================================================
-- PetQuest — Phase 12: AI quest validity check at creation
-- Run this in the Supabase SQL editor AFTER Phase 11. Safe to re-run — every
-- statement is idempotent (add column if not exists / create or replace /
-- on conflict do nothing).
--
-- NOT economy-critical. This file does NOT define complete_task,
-- submit_completion, rollback_completion, admin_review_completion or
-- break_streak — the award/rollback path is untouched. The only interaction
-- with completion is an additive BEFORE UPDATE trigger on tasks that refuses to
-- flip `completed` to true while a quest has not passed its validity check
-- (see §4 for why a trigger and not an edit to complete_task).
--
-- What it adds
--   §1 tasks: the research construct fields (goal, priority) the AI check needs,
--      the participant's chosen evidence_type, and the PARTICIPANT-SAFE validity
--      fields (status / score / reason / timestamps).
--   §2 preset_quest_catalog: the starter-quest texts from src/data/presetQuests.js.
--      Starter quests are hand-written by the study team, so they are exempt from
--      the AI check; the catalogue is how the database tells a starter quest from
--      a custom one when the browser inserts it.
--   §3 quest_validity_reviews: ADMIN-ONLY log of every AI decision (detailed
--      admin_reason, risk_flags, model_version, normalized summary). Kept in a
--      separate table — not as tasks columns — so participants can keep using
--      `select *` on tasks while never being able to read the internal reasoning
--      (RLS: admin read only; no client writes at all).
--   §4 tasks_validity_guard trigger: the browser can never set or change a
--      validity status, and a quest that is not accepted/exempt cannot be
--      completed.
--   §5 admin_resolve_quest_validity(): the admin path to accept/reject a quest
--      stuck in pending_ai_review (or one the AI sent back).
--
-- Validity statuses
--   exempt              starter quest from the catalogue, or a row that predates
--                       this phase — completable, never AI-checked
--   accepted            AI (or an admin) accepted the custom quest — completable
--   pending_ai_review   saved while the AI check was unavailable — NOT completable
--                       until the check is re-run or an admin resolves it
--   needs_clarification AI sent it back for edits — NOT completable
--   rejected            AI or admin rejected it — NOT completable
--
-- Why a trigger and not `revoke update (col) on tasks`: Postgres column-level
-- REVOKE has no effect while the role still holds the table-level privilege
-- (Supabase grants ALL on public tables to anon/authenticated), so a column
-- revoke would silently do nothing. The trigger keys off current_user, which is
-- 'authenticated'/'anon' for a direct PostgREST write from the browser but the
-- function OWNER inside our SECURITY DEFINER RPCs and 'service_role' for the
-- Vercel function — so exactly the trusted paths keep working.
-- =============================================================================


-- ── 1. tasks: research fields + evidence type + participant-safe validity ──
alter table public.tasks
  add column if not exists goal                 text,
  add column if not exists priority             text        not null default 'P2',
  add column if not exists evidence_type        text        not null default 'photo',
  add column if not exists validity_status      text        not null default 'exempt',
  add column if not exists validity_score       integer,
  add column if not exists validity_reason      text,
  add column if not exists validity_checked_at  timestamptz,
  add column if not exists validity_reviewed_at timestamptz;

-- Existing rows (starter quests and pre-Phase-12 custom quests) stay completable.
update public.tasks set validity_status = 'exempt' where validity_status is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks
      add constraint tasks_priority_check check (priority in ('P1', 'P2', 'P3'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_evidence_type_check') then
    alter table public.tasks
      add constraint tasks_evidence_type_check
      check (evidence_type in ('photo', 'document', 'screenshot', 'timed_activity', 'admin_review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_validity_status_check') then
    alter table public.tasks
      add constraint tasks_validity_status_check
      check (validity_status in ('exempt', 'accepted', 'pending_ai_review', 'needs_clarification', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_validity_score_check') then
    alter table public.tasks
      add constraint tasks_validity_score_check
      check (validity_score is null or (validity_score between 0 and 100));
  end if;
end $$;

-- The admin "pending" queue filters on this; a partial index keeps it tiny.
create index if not exists tasks_validity_pending_idx
  on public.tasks (created_at desc)
  where validity_status = 'pending_ai_review';


-- ── 2. preset_quest_catalog: starter quests are exempt from the AI check ──
-- Mirrors src/data/presetQuests.js (tests/quest-validity.test.mjs asserts the
-- two stay in sync). Matching is on the normalised text only, so the same text
-- under a different mode/difficulty still counts as a starter quest.
create table if not exists public.preset_quest_catalog (
  norm_text  text primary key,          -- lower(btrim(text))
  text       text not null,
  mode       text not null,
  difficulty text not null,
  added_at   timestamptz not null default now()
);

alter table public.preset_quest_catalog enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'preset_quest_catalog' and policyname = 'pqc: read all') then
    execute $p$ create policy "pqc: read all" on public.preset_quest_catalog for select using ( true ) $p$;
  end if;
end $$;
-- Read-only for clients (the trigger below reads it as the client role).
grant select on public.preset_quest_catalog to anon, authenticated;
revoke insert, update, delete on public.preset_quest_catalog from anon, authenticated;

insert into public.preset_quest_catalog (norm_text, text, mode, difficulty)
select lower(btrim(v.text)), v.text, v.mode, v.difficulty
from (values
  ('Do 100 push-ups — Saitama''s daily count (split into sets if you must)', 'saitama', 'easy'),
  ('Do 100 sit-ups like the Caped Baldy', 'saitama', 'easy'),
  ('Do 100 squats — no excuses, hero training', 'saitama', 'easy'),
  ('Run 10km — Saitama''s legendary daily run', 'saitama', 'easy'),
  ('Do the mini hero set: 25 push-ups, 25 sit-ups, 25 squats', 'saitama', 'easy'),
  ('Do 50 push-ups and 50 squats back-to-back', 'saitama', 'easy'),
  ('Run 5km at a steady pace — half of Saitama''s run', 'saitama', 'easy'),
  ('Do 3 sets of 20 push-ups (60 total)', 'saitama', 'easy'),
  ('Do 100 sit-ups split into 5 sets of 20', 'saitama', 'easy'),
  ('Do 40 squats and hold the last rep for 30 seconds', 'saitama', 'easy'),
  ('Train today with NO air conditioning — strengthen your mind, Saitama-style', 'saitama', 'easy'),
  ('Train today with NO heater on — forge mental toughness', 'saitama', 'easy'),
  ('Eat 3 solid meals today (a banana in the morning, like Saitama)', 'saitama', 'easy'),
  ('Take the stairs everywhere today — every step builds a hero', 'saitama', 'easy'),
  ('Warm up, then run for 30 minutes without stopping', 'saitama', 'easy'),
  ('Hold a plank for 2 minutes — build the core of a hero', 'saitama', 'easy'),
  ('Do 100 jumping jacks to warm up for hero training', 'saitama', 'easy'),
  ('Stretch for 10 minutes before your daily routine', 'saitama', 'easy'),
  ('Do a full 15-minute bodyweight circuit — become the hero for fun', 'saitama', 'easy'),
  ('Wake up early and knock out your workout before breakfast', 'saitama', 'easy'),
  ('Complete Saitama''s FULL routine once this period: 100 push-ups, 100 sit-ups, 100 squats, 10km run', 'saitama', 'medium'),
  ('Do 100 push-ups every single day for all 3 days', 'saitama', 'medium'),
  ('Do 100 sit-ups every single day for all 3 days', 'saitama', 'medium'),
  ('Do 100 squats every single day for all 3 days', 'saitama', 'medium'),
  ('Run 10km each day — 30km total across the period', 'saitama', 'medium'),
  ('Train with no AC/heater every day this period (strengthen the spirit)', 'saitama', 'medium'),
  ('Do 300 push-ups split across the 3 days', 'saitama', 'medium'),
  ('Eat 3 clean meals a day, every day — the hero diet, no junk', 'saitama', 'medium'),
  ('Complete the full 100-100-100 bodyweight set on two of the three days', 'saitama', 'medium'),
  ('Run a combined 20km and do 200 squats across the period', 'saitama', 'medium'),
  ('THE ONE PUNCH MAN CHALLENGE: 100 push-ups, 100 sit-ups, 100 squats, and a 10km run EVERY SINGLE DAY for 7 days', 'saitama', 'hard'),
  ('Do 700 push-ups this week — 100 a day, log every session', 'saitama', 'hard'),
  ('Do 700 sit-ups this week — 100 a day, log every session', 'saitama', 'hard'),
  ('Do 700 squats this week — 100 a day, log every session', 'saitama', 'hard'),
  ('Run 70km total this week — 10km a day like Saitama', 'saitama', 'hard'),
  ('Complete the full daily routine on at least 5 of the 7 days', 'saitama', 'hard'),
  ('Train with no air conditioning or heater all 7 days — forge an unbreakable mind', 'saitama', 'hard'),
  ('Eat 3 clean meals a day for the entire week — no shortcuts', 'saitama', 'hard'),
  ('Complete Saitama''s ENTIRE routine in one session, no breaks between exercises', 'saitama', 'hard'),
  ('One full week of hero training: 100-100-100 + 10km, every day — become the Caped Baldy', 'saitama', 'hard'),
  ('Do 20 push-ups', 'fitness', 'easy'),
  ('Do 30 squats', 'fitness', 'easy'),
  ('Do 20 sit-ups', 'fitness', 'easy'),
  ('Do 10 burpees', 'fitness', 'easy'),
  ('Hold a plank for 1 minute', 'fitness', 'easy'),
  ('Do 20 lunges (10 each leg)', 'fitness', 'easy'),
  ('Do 50 jumping jacks', 'fitness', 'easy'),
  ('Do 30 calf raises', 'fitness', 'easy'),
  ('Do 25 glute bridges', 'fitness', 'easy'),
  ('Do 15 tricep dips using a chair', 'fitness', 'easy'),
  ('Complete 100 mountain climbers', 'fitness', 'easy'),
  ('Do a 10-minute ab workout', 'fitness', 'easy'),
  ('Jog in place for 10 minutes', 'fitness', 'easy'),
  ('Complete a 7-minute full-body workout', 'fitness', 'easy'),
  ('Do 3 sets of wall sits (30 sec each)', 'fitness', 'easy'),
  ('Complete 3 sets of 12 dumbbell curls', 'fitness', 'easy'),
  ('Do 3 sets of 10 bench press reps', 'fitness', 'easy'),
  ('Complete 3 sets of lat pulldowns', 'fitness', 'easy'),
  ('Do 3 sets of 15 cable rows', 'fitness', 'easy'),
  ('Complete 3 sets of 12 shoulder press reps', 'fitness', 'easy'),
  ('Walk for 15 minutes', 'fitness', 'easy'),
  ('Walk 5,000 steps today', 'fitness', 'easy'),
  ('Take the stairs instead of the elevator all day', 'fitness', 'easy'),
  ('Stretch for 10 minutes after waking up', 'fitness', 'easy'),
  ('Do a 15-minute yoga flow', 'fitness', 'easy'),
  ('Drink 8 glasses of water today', 'fitness', 'easy'),
  ('Complete a 10-minute jump rope session', 'fitness', 'easy'),
  ('Go for a 20-minute bike ride or walk', 'fitness', 'easy'),
  ('Do 3 sets of box steps or step-ups', 'fitness', 'easy'),
  ('Foam roll or stretch for 10 minutes', 'fitness', 'easy'),
  ('Complete 3 workout sessions this period (30 min each)', 'fitness', 'medium'),
  ('Log every meal you eat for all 3 days', 'fitness', 'medium'),
  ('Hit 10,000 steps every single day this period', 'fitness', 'medium'),
  ('Complete 3 HIIT sessions (20 min each) this period', 'fitness', 'medium'),
  ('Do 200 push-ups split across the 3 days', 'fitness', 'medium'),
  ('Run at least 5km total across the period', 'fitness', 'medium'),
  ('Complete a full-body circuit workout all 3 days', 'fitness', 'medium'),
  ('Hit your daily protein goal for 3 consecutive days', 'fitness', 'medium'),
  ('Do 50 pull-ups or assisted pull-ups split across the period', 'fitness', 'medium'),
  ('Complete two 30-minute swim or cycling sessions', 'fitness', 'medium'),
  ('Follow a beginner 3-day strength program', 'fitness', 'medium'),
  ('Attend 2 fitness classes or group sessions this period', 'fitness', 'medium'),
  ('Do a 20-minute morning workout every day this period', 'fitness', 'medium'),
  ('Complete 150 squats split across the 3 days', 'fitness', 'medium'),
  ('Run a total of 15km across this week — log each session', 'fitness', 'hard'),
  ('Complete 5 full workout sessions this week (45 min each)', 'fitness', 'hard'),
  ('Follow a strict clean meal plan all 7 days of the week', 'fitness', 'hard'),
  ('Do 100 push-ups every single day for the entire week', 'fitness', 'hard'),
  ('Hit 10,000 steps every single day this week without exception', 'fitness', 'hard'),
  ('Complete a 5K run at any point this week', 'fitness', 'hard'),
  ('Do a 1-hour workout session at least 5 days this week', 'fitness', 'hard'),
  ('Complete a 7-day yoga or full-body mobility challenge', 'fitness', 'hard'),
  ('Bike, swim, or run a combined 30km total this week', 'fitness', 'hard'),
  ('Complete 500 squats and 500 push-ups split across the week', 'fitness', 'hard'),
  ('Review yesterday''s class notes for 15 minutes', 'academic', 'easy'),
  ('Practice flashcards or active recall for 20 minutes', 'academic', 'easy'),
  ('Do 15 minutes of active recall without looking at notes', 'academic', 'easy'),
  ('Rewrite your notes in a cleaner, organized format', 'academic', 'easy'),
  ('Write down 3 key concepts you learned today', 'academic', 'easy'),
  ('Read your textbook or course material for 30 minutes', 'academic', 'easy'),
  ('Read one article or paper related to your coursework', 'academic', 'easy'),
  ('Read and annotate one chapter or assigned reading', 'academic', 'easy'),
  ('Read one chapter of any non-fiction or educational book', 'academic', 'easy'),
  ('Listen to a subject-related podcast or audio lecture', 'academic', 'easy'),
  ('Complete all assigned homework due today', 'academic', 'easy'),
  ('Solve 5 math or logic problems from your coursework', 'academic', 'easy'),
  ('Write a short 1-paragraph summary of today''s material', 'academic', 'easy'),
  ('Complete a grammar, writing, or language exercise', 'academic', 'easy'),
  ('Complete one online quiz, practice test, or self-test', 'academic', 'easy'),
  ('Write down your study goals and schedule for the day', 'academic', 'easy'),
  ('Clean and organize your study space before sitting down', 'academic', 'easy'),
  ('Watch one educational video or recorded lecture today', 'academic', 'easy'),
  ('Create a mind map or diagram for a topic you''re studying', 'academic', 'easy'),
  ('Teach a concept you learned out loud or to someone else', 'academic', 'easy'),
  ('Make a list of all topics you still need to review', 'academic', 'easy'),
  ('Complete a typing speed or keyboard practice session', 'academic', 'easy'),
  ('Do a daily vocabulary practice session (any language)', 'academic', 'easy'),
  ('Organize your digital files and notes for one subject', 'academic', 'easy'),
  ('Set up a Pomodoro session and complete 4 rounds', 'academic', 'easy'),
  ('Study for a total of 12 hours split across the next 3 days', 'academic', 'medium'),
  ('Read a full chapter and write a one-page summary', 'academic', 'medium'),
  ('Complete one major assignment, essay, or full problem set', 'academic', 'medium'),
  ('Outline and write the introduction section of an essay', 'academic', 'medium'),
  ('Complete and self-grade 3 past exam or practice papers', 'academic', 'medium'),
  ('Build a study schedule for the period and follow it strictly', 'academic', 'medium'),
  ('Memorize 30 new vocabulary terms, formulas, or concepts', 'academic', 'medium'),
  ('Complete a coding assignment or solve 3 algorithm problems', 'academic', 'medium'),
  ('Write and revise a 500-word academic response or reflection', 'academic', 'medium'),
  ('Create a comprehensive set of study cards for one full topic', 'academic', 'medium'),
  ('Attend all classes this period and take detailed notes each time', 'academic', 'medium'),
  ('Complete a full chapter''s worth of practice exercises', 'academic', 'medium'),
  ('Research and write a structured outline for a presentation topic', 'academic', 'medium'),
  ('Read two papers or articles and compare their key arguments', 'academic', 'medium'),
  ('Study for 40 hours total this week — log your daily sessions', 'academic', 'hard'),
  ('Write and fully complete an essay, report, or research paper', 'academic', 'hard'),
  ('Master all material for an upcoming exam this week', 'academic', 'hard'),
  ('Complete an entire online course module or unit this week', 'academic', 'hard'),
  ('Read and write summaries for 3 full chapters this week', 'academic', 'hard'),
  ('Solve 50 practice problems across at least 3 different topics', 'academic', 'hard'),
  ('Build and document a complete project or portfolio piece', 'academic', 'hard'),
  ('Attend every scheduled class and produce detailed notes all 7 days', 'academic', 'hard'),
  ('Study 6+ hours every single day without missing a day', 'academic', 'hard'),
  ('Complete a mock exam under timed conditions and review every answer', 'academic', 'hard')
) as v(text, mode, difficulty)
on conflict (norm_text) do nothing;


-- ── 3. quest_validity_reviews: admin-only decision log ──
-- One row per AI (or admin) decision, INCLUDING clarify/reject attempts that
-- never became a task row (task_id null). Doubles as the per-user rate-limit
-- log for the serverless endpoint.
create table if not exists public.quest_validity_reviews (
  id                        uuid        primary key default uuid_generate_v4(),
  task_id                   uuid        references public.tasks(id) on delete set null,
  user_id                   uuid        references public.profiles(id) on delete cascade not null,
  task_title                text        not null,
  task_goal                 text,
  difficulty                text,
  evidence_type             text,
  decision                  text        not null,   -- accept | clarify | reject | pending | admin_accept | admin_reject
  validity_score            integer,
  reason                    text,                   -- participant-safe (what the participant was shown)
  admin_reason              text,                   -- internal — never sent to the browser for non-admins
  risk_flags                jsonb       not null default '[]'::jsonb,
  recommended_evidence_type text,
  normalized_task_summary   text,
  model_version             text,
  reviewed_by               uuid,                   -- admin uid for admin_* decisions
  created_at                timestamptz not null default now()
);

create index if not exists quest_validity_reviews_user_created_idx
  on public.quest_validity_reviews (user_id, created_at desc);
create index if not exists quest_validity_reviews_task_idx
  on public.quest_validity_reviews (task_id);

alter table public.quest_validity_reviews enable row level security;
do $$
begin
  -- Admin read ONLY. There is deliberately no "own read" policy: the row holds
  -- the internal reasoning and anti-cheat flags. Participants get the
  -- participant-safe `reason` through the API response / tasks.validity_reason.
  if not exists (select 1 from pg_policies where tablename = 'quest_validity_reviews' and policyname = 'qvr: admin read') then
    execute $p$ create policy "qvr: admin read" on public.quest_validity_reviews for select using ( is_admin() ) $p$;
  end if;
end $$;
-- No client writes — only the service role (Vercel) and the admin RPC below.
revoke insert, update, delete on public.quest_validity_reviews from anon, authenticated;


-- ── 4. tasks_validity_guard: browser cannot self-certify; ineligible ≠ completable ──
-- NOT security definer on purpose: it must run as the caller so current_user
-- tells a browser write apart from our RPCs / the service role.
create or replace function public.tasks_validity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if v_client then
      -- A browser insert can never arrive as accepted. Catalogue starter quests
      -- are exempt; anything else waits for the AI check (re-run from the quest
      -- log or resolved by an admin) — this is also the fallback when the
      -- serverless endpoint is unreachable.
      if exists (select 1 from preset_quest_catalog c where c.norm_text = lower(btrim(new.text))) then
        new.validity_status := 'exempt';
      else
        new.validity_status := 'pending_ai_review';
      end if;
      new.validity_score       := null;
      new.validity_reason      := null;
      new.validity_checked_at  := null;
      new.validity_reviewed_at := null;
    end if;
    return new;
  end if;

  -- UPDATE: validity fields + the chosen evidence type are read-only from the browser.
  if v_client and (
       new.validity_status      is distinct from old.validity_status
    or new.validity_score       is distinct from old.validity_score
    or new.validity_reason      is distinct from old.validity_reason
    or new.validity_checked_at  is distinct from old.validity_checked_at
    or new.validity_reviewed_at is distinct from old.validity_reviewed_at
    or new.evidence_type        is distinct from old.evidence_type
  ) then
    raise exception 'validity fields are read-only' using errcode = 'insufficient_privilege';
  end if;

  -- Completion eligibility. Fires inside complete_task() too (it runs as the
  -- function owner, so v_client is false but this check still applies): the
  -- whole submit_completion transaction aborts, so nothing is awarded.
  if new.completed and not coalesce(old.completed, false)
     and new.validity_status not in ('accepted', 'exempt') then
    raise exception 'quest_not_eligible: this quest has not passed its validity check yet'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_validity_guard on public.tasks;
create trigger tasks_validity_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_validity_guard();


-- ── 5. admin_resolve_quest_validity(): admin accept / reject ──
-- The admin path for quests stuck in pending_ai_review (endpoint was down) or
-- sent back by the AI. Accept makes the quest completable; reject leaves it in
-- the participant's log as "not accepted" with the reason (they can delete or
-- revise it).
create or replace function public.admin_resolve_quest_validity(
  p_task_id uuid,
  p_status  text,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task   tasks%rowtype;
  v_reason text;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_status not in ('accepted', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;

  select * into v_task from tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_reason := coalesce(
    nullif(btrim(p_reason), ''),
    case when p_status = 'accepted'
         then 'Reviewed and accepted by the study team.'
         else 'Reviewed by the study team — please make the task more specific or choose evidence that can demonstrate completion.'
    end);

  update tasks
     set validity_status      = p_status,
         validity_reason      = v_reason,
         validity_reviewed_at = now()
   where id = p_task_id;

  insert into quest_validity_reviews (
    task_id, user_id, task_title, task_goal, difficulty, evidence_type,
    decision, validity_score, reason, admin_reason, model_version, reviewed_by
  ) values (
    v_task.id, v_task.user_id, v_task.text, v_task.goal, v_task.difficulty, v_task.evidence_type,
    'admin_' || case when p_status = 'accepted' then 'accept' else 'reject' end,
    v_task.validity_score, v_reason, p_reason, 'admin', auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

grant execute on function public.admin_resolve_quest_validity(uuid, text, text) to authenticated;


-- =============================================================================
-- Verify (optional):
--   select validity_status, count(*) from tasks group by 1;
--   select tgname from pg_trigger where tgname = 'tasks_validity_guard';
--   select count(*) from preset_quest_catalog;   -- 143 with the current catalogue
-- =============================================================================
