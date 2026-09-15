// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { Completion } from './completionModel.ts';
import { cooldownRemainingMs, isQuestEligible } from './quests.ts';
import type { Task } from './taskModel.ts';

/**
 * Home — "Today's Adventure" — the pure half.
 *
 * Decides which quest is next, what the one primary action is, and what each
 * row of Today's Path says. Every input is a server row (`tasks`,
 * `quest_completions`); nothing here infers approval, awards or starts
 * anything. A quest's status is read off the real completion pipeline
 * (see completionModel.ts), never off local state.
 */

/* ── Time helpers ── */

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today 5:00 PM", "Tomorrow", "Overdue", "Fri 12 Sep" — the planned time, compactly. */
export function plannedLabel(task: Pick<Task, 'planned_completion_date' | 'completed'>, now: Date = new Date()): string | null {
  if (!task.planned_completion_date) return null;
  const planned = new Date(task.planned_completion_date);
  if (Number.isNaN(planned.getTime())) return null;
  if (!task.completed && planned.getTime() < now.getTime()) return 'Overdue';
  const time = planned.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isSameLocalDay(planned, now)) return `Today ${time}`;
  const tomorrow = new Date(startOfDay(now).getTime() + 86_400_000);
  if (isSameLocalDay(planned, tomorrow)) return `Tomorrow ${time}`;
  return planned.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ── Status of one quest, from the real pipeline ── */

export type PathStatusKey =
  | 'completed'
  | 'submitted'
  | 'queued_for_review'
  | 'not_approved'
  | 'in_progress'
  | 'upcoming'
  | 'awaiting_check'
  | 'needs_changes';

export type PathStatus = { key: PathStatusKey; label: string; tone: 'good' | 'waiting' | 'bad' | 'neutral' | 'active' };

const STATUS: Record<PathStatusKey, PathStatus> = {
  completed: { key: 'completed', label: 'Completed', tone: 'good' },
  submitted: { key: 'submitted', label: 'Submitted', tone: 'waiting' },
  queued_for_review: { key: 'queued_for_review', label: 'Queued for review', tone: 'waiting' },
  not_approved: { key: 'not_approved', label: 'Not approved', tone: 'bad' },
  in_progress: { key: 'in_progress', label: 'In progress', tone: 'active' },
  upcoming: { key: 'upcoming', label: 'Upcoming', tone: 'neutral' },
  awaiting_check: { key: 'awaiting_check', label: 'Awaiting check', tone: 'waiting' },
  needs_changes: { key: 'needs_changes', label: 'Needs changes', tone: 'bad' },
};

/**
 * Where a quest stands. `completion` is the LATEST quest_completions row for
 * it, or null if it has never been submitted.
 *
 *   completed + verified                → Completed
 *   completed + AI still pending        → Submitted
 *   completed + AI error / awaiting admin → Queued for review
 *   completion reverted / rejected      → Not approved (the quest is open again)
 *   validity not accepted               → Awaiting check / Needs changes
 *   eligible, submitted before, open    → In progress (a retry is available)
 *   otherwise                           → Upcoming
 */
export function questStatus(task: Task, completion: Completion | null): PathStatus {
  if (task.completed) {
    if (!completion) return STATUS.completed; // pre-verification rows have no completion row
    if (completion.status === 'verified') return STATUS.completed;
    if (completion.status === 'reverted' || completion.status === 'rejected') return STATUS.not_approved;
    if (completion.ai_verdict === 'pending') return STATUS.submitted;
    return STATUS.queued_for_review; // pass awaiting admin confirmation, error, or fail awaiting admin
  }
  if (completion && (completion.status === 'reverted' || completion.status === 'rejected')) return STATUS.not_approved;
  if (task.validity_status === 'pending_ai_review') return STATUS.awaiting_check;
  if (task.validity_status === 'needs_clarification' || task.validity_status === 'rejected') return STATUS.needs_changes;
  if (completion) return STATUS.in_progress;
  return STATUS.upcoming;
}

/* ── Which quest is next ── */

export type CompletionMap = Record<string, Completion | null>;

/**
 * Ordering for "next": overdue first, then the soonest planned time, then the
 * oldest unplanned quest. Only quests the participant can actually act on —
 * open, validity-accepted, and not in cooldown.
 */
export function nextQuest(tasks: Task[] | null, completions: CompletionMap, now: Date = new Date()): Task | null {
  const nowMs = now.getTime();
  const actionable = (tasks ?? []).filter(
    (t) => !t.completed && isQuestEligible(t) && cooldownRemainingMs(t, nowMs) === 0,
  );
  if (actionable.length === 0) return null;
  const key = (t: Task) => {
    const planned = t.planned_completion_date ? new Date(t.planned_completion_date).getTime() : null;
    if (planned != null && planned < nowMs) return [0, planned] as const;
    if (planned != null) return [1, planned] as const;
    return [2, new Date(t.created_at).getTime()] as const;
  };
  return [...actionable].sort((a, b) => {
    const [ga, va] = key(a);
    const [gb, vb] = key(b);
    return ga - gb || va - vb;
  })[0];
}

export type NextAction = {
  label: 'Start quest' | 'Continue quest' | 'Submit evidence';
  /** Where the button goes. `verify` is the existing evidence flow; `detail` the quest screen. */
  route: 'detail' | 'verify';
};

/**
 * The one primary action for the next quest. It only ever ROUTES — the quest
 * detail and evidence screens own every write.
 *
 *   never submitted                     → Start quest    (quest detail)
 *   submitted before, reverted/rejected → Submit evidence (evidence flow, directly)
 *   submitted before, still open        → Continue quest (quest detail)
 */
export function nextQuestAction(task: Task, completion: Completion | null): NextAction {
  if (!completion) return { label: 'Start quest', route: 'detail' };
  if (completion.status === 'reverted' || completion.status === 'rejected') {
    return { label: 'Submit evidence', route: 'verify' };
  }
  return { label: 'Continue quest', route: 'detail' };
}

/* ── Today's Path ── */

export type PathRow = { task: Task; status: PathStatus; planned: string | null };

const TONE_ORDER: Record<PathStatus['tone'], number> = { active: 0, waiting: 1, neutral: 2, bad: 3, good: 4 };

/**
 * The quests that matter today, at most `limit` of them:
 *   • anything completed or submitted today
 *   • anything planned for today or overdue
 *   • open, eligible quests with no plan (they are always "today")
 * Sorted so what is happening now is on top and what is done is at the bottom.
 * `truncated` tells the screen to offer "View all quests".
 */
export function todaysPath(
  tasks: Task[] | null,
  completions: CompletionMap,
  now: Date = new Date(),
  limit = 5,
): { rows: PathRow[]; truncated: boolean } {
  const nowMs = now.getTime();
  const relevant = (tasks ?? []).filter((t) => {
    const planned = t.planned_completion_date ? new Date(t.planned_completion_date) : null;
    if (t.completed) {
      const when = t.completed_at ? new Date(t.completed_at) : null;
      return !!when && isSameLocalDay(when, now);
    }
    if (planned) return planned.getTime() < nowMs || isSameLocalDay(planned, now);
    return true;
  });

  const rows: PathRow[] = relevant.map((task) => ({
    task,
    status: questStatus(task, completions[task.id] ?? null),
    planned: plannedLabel(task, now),
  }));

  rows.sort((a, b) => {
    const t = TONE_ORDER[a.status.tone] - TONE_ORDER[b.status.tone];
    if (t !== 0) return t;
    const pa = a.task.planned_completion_date ? new Date(a.task.planned_completion_date).getTime() : Infinity;
    const pb = b.task.planned_completion_date ? new Date(b.task.planned_completion_date).getTime() : Infinity;
    if (pa !== pb) return pa - pb;
    return new Date(a.task.created_at).getTime() - new Date(b.task.created_at).getTime();
  });

  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** The compact figures at the bottom of Home. */
export function todaySummary(tasks: Task[] | null, now: Date = new Date()): { completedToday: number; openToday: number } {
  const list = tasks ?? [];
  const completedToday = list.filter(
    (t) => t.completed && t.completed_at && isSameLocalDay(new Date(t.completed_at), now),
  ).length;
  const openToday = list.filter((t) => !t.completed && isQuestEligible(t)).length;
  return { completedToday, openToday };
}

/** The line under the pet. Short, and never a claim about points. */
export function heroMessage(next: Task | null, summary: { completedToday: number; openToday: number }): string {
  if (next) return 'Ready for your next quest?';
  if (summary.completedToday > 0 && summary.openToday === 0) return 'All done for today. Nice work.';
  if (summary.openToday > 0) return 'Your quests are waiting on a check.';
  return 'Add a quest to get started.';
}

/* ── Quest list filters ── */

export type QuestFilter = 'today' | 'upcoming' | 'completed' | 'needs_review';

export const QUEST_FILTERS: { key: QuestFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'needs_review', label: 'Needs review' },
];

/**
 * Which bucket a quest belongs to. Buckets are disjoint so the counts add up:
 *   needs_review — validity not accepted, or the last submission was not approved
 *   completed    — completed and not in review
 *   today        — open, actionable, planned today / overdue / unplanned
 *   upcoming     — open, actionable, planned for a later day
 */
export function questFilterOf(task: Task, completion: Completion | null, now: Date = new Date()): QuestFilter {
  const status = questStatus(task, completion);
  if (status.key === 'needs_changes' || status.key === 'awaiting_check' || status.key === 'not_approved') return 'needs_review';
  if (task.completed) return 'completed';
  if (!task.planned_completion_date) return 'today';
  const planned = new Date(task.planned_completion_date);
  return planned.getTime() < now.getTime() || isSameLocalDay(planned, now) ? 'today' : 'upcoming';
}

export function bucketQuests(tasks: Task[] | null, completions: CompletionMap, now: Date = new Date()): Record<QuestFilter, Task[]> {
  const out: Record<QuestFilter, Task[]> = { today: [], upcoming: [], completed: [], needs_review: [] };
  for (const t of tasks ?? []) out[questFilterOf(t, completions[t.id] ?? null, now)].push(t);
  const plannedMs = (t: Task) => (t.planned_completion_date ? new Date(t.planned_completion_date).getTime() : Infinity);
  out.today.sort((a, b) => plannedMs(a) - plannedMs(b) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  out.upcoming.sort((a, b) => plannedMs(a) - plannedMs(b));
  out.completed.sort((a, b) => new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime());
  return out;
}
