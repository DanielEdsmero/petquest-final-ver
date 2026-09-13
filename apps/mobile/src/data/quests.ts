/**
 * Quest constants — the mobile port of `src/data/questValidity.js` and
 * `src/data/difficulty.js` from the web app, plus the period-cap rules that
 * live inside `GameContext.addTask()`.
 *
 * COPIED ON PURPOSE (see MOBILE_MIGRATION_MAP.md §8). The authoritative copies
 * of the enums are server-side in `api/_lib/quest-validity.js`; the web already
 * has a test asserting its browser copy matches, and the Phase 8 parity test
 * must cover this one too.
 *
 * Nothing here decides whether a quest is accepted. The server does that, and
 * a database trigger forces any direct client insert to `pending_ai_review`.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type EvidenceTypeId = 'photo' | 'document' | 'screenshot' | 'timed_activity' | 'admin_review';
export type ValidityStatus =
  | 'accepted'
  | 'exempt'
  | 'pending_ai_review'
  | 'needs_clarification'
  | 'rejected';

export const DIFFICULTY_COLORS: Record<Difficulty | 'boss', string> = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
  boss: '#7c3aed',
};

export const DIFFICULTIES: {
  id: Difficulty;
  label: string;
  emoji: string;
  points: number;
  blurb: string;
}[] = [
  { id: 'easy', label: 'Easy', emoji: '🌱', points: 10, blurb: 'Unlimited · daily quests' },
  { id: 'medium', label: 'Medium', emoji: '⚡', points: 25, blurb: '3 quests per 3 days' },
  { id: 'hard', label: 'Hard', emoji: '🔥', points: 50, blurb: '1 quest per week' },
];

export const difficultyMeta = (id: Difficulty) =>
  DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0];

export const EVIDENCE_TYPES: { id: EvidenceTypeId; emoji: string; label: string; desc: string }[] = [
  { id: 'photo', emoji: '📷', label: 'Photo', desc: 'A live photo of the finished work or activity' },
  { id: 'document', emoji: '📄', label: 'Document or file', desc: 'Upload a file — essay, PDF, spreadsheet, code…' },
  { id: 'screenshot', emoji: '🖥️', label: 'Screenshot', desc: 'A screenshot of an app or site showing the result' },
  { id: 'timed_activity', emoji: '⏱️', label: 'Timed activity', desc: 'A timed session recorded while you work' },
  { id: 'admin_review', emoji: '🧑‍⚖️', label: 'Other (admin review)', desc: 'Other evidence, reviewed by a study admin' },
];

export const evidenceMeta = (id: string | null | undefined) =>
  EVIDENCE_TYPES.find((e) => e.id === id) ?? EVIDENCE_TYPES[0];

/** Row badges. `exempt` (starter quests) and `accepted` show nothing. */
export const VALIDITY_META: Record<string, { label: string; color: string; hint: string }> = {
  pending_ai_review: {
    label: 'Awaiting check',
    color: '#22d3ee',
    hint: 'Saved — the quality check will run shortly. You can complete it once it’s accepted.',
  },
  needs_clarification: {
    label: 'Needs changes',
    color: '#f5a31a',
    hint: 'The quality check asked for a clearer task. Revise it to continue.',
  },
  rejected: {
    label: 'Not accepted',
    color: '#fb7185',
    hint: 'This quest was not accepted. Revise it or delete it.',
  },
};

/**
 * A quest can be completed only once it has passed — or is exempt from — the
 * validity check. Rows created before Phase 12 carry no status and stay
 * eligible, which is why the null case is permissive.
 */
export const isQuestEligible = (t: { validity_status?: string | null } | null | undefined) =>
  !t?.validity_status || t.validity_status === 'accepted' || t.validity_status === 'exempt';

export const CHECK_STEPS = [
  'Checking quest quality',
  'Comparing the task with your goal',
  'Choosing the best evidence type',
  'Saving your quest',
];

export const CHECK_EXPLAINER =
  'PetQuest checks whether your quest is specific, meaningful, and possible to verify. This helps keep the study fair.';

/* ── Completion timing ──
   Points per difficulty and the client-side cooldown between completions of the
   same quest, both mirroring GameContext on the web.

   NOTE: since supabase-phase10 the server no longer enforces a time gate in
   `complete_task` — the burst rate-limit (3 completions in 60s → a 5-minute
   lock) is the real anti-farm control. This cooldown is presentation only: it
   stops a participant hammering a just-completed quest, and the server would
   allow it. Do not describe it to a participant as a rule the server enforces. */

export const DIFF_POINTS: Record<Difficulty, number> = { easy: 10, medium: 25, hard: 50 };

export const DIFF_MIN_COMPLETE_MS: Record<Difficulty, number> = {
  easy: 300_000,
  medium: 1_800_000,
  hard: 7_200_000,
};

/**
 * How long until this quest may be completed again, anchored to its LAST
 * completion. A quest that has never been completed has no cooldown — that is
 * what makes a freshly created quest immediately actionable.
 */
export function cooldownRemainingMs(
  task: { difficulty?: string | null; completed_at?: string | null },
  now: number = Date.now(),
): number {
  if (!task.completed_at) return 0;
  const difficulty = (task.difficulty ?? 'easy') as Difficulty;
  const window = DIFF_MIN_COMPLETE_MS[difficulty] ?? DIFF_MIN_COMPLETE_MS.easy;
  return Math.max(0, new Date(task.completed_at).getTime() + window - now);
}

/* ── Period caps ──
   Mirrors GameContext.addTask() on the web: Hard is 1 per week and Medium is
   3 per 3 days, counted from the anchor stored on the profile. This is a
   client-side courtesy check so the participant is told before a round trip;
   the server re-validates. */

export const HARD_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const MEDIUM_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;
export const HARD_PER_PERIOD = 1;
export const MEDIUM_PER_PERIOD = 3;

export type PeriodCheck = {
  /** False when the participant is already at the cap for this difficulty. */
  allowed: boolean;
  used: number;
  limit: number;
  /** ms until the period rolls over, or null when it already has. */
  resetsInMs: number | null;
  message: string | null;
};

/**
 * Whether another quest of this difficulty may be created right now.
 *
 * `anchorIso` is `profiles.hard_period_start` / `medium_period_start`. Once the
 * period has elapsed the count restarts, which is why quests created before the
 * anchor are not counted.
 */
export function checkPeriodCap(
  difficulty: Difficulty,
  tasks: { difficulty?: string | null; created_at?: string | null }[],
  anchorIso: string | null | undefined,
  now: number = Date.now(),
): PeriodCheck {
  if (difficulty === 'easy') {
    return { allowed: true, used: 0, limit: Infinity, resetsInMs: null, message: null };
  }

  const periodMs = difficulty === 'hard' ? HARD_PERIOD_MS : MEDIUM_PERIOD_MS;
  const limit = difficulty === 'hard' ? HARD_PER_PERIOD : MEDIUM_PER_PERIOD;
  const anchor = anchorIso ? new Date(anchorIso).getTime() : 0;
  const elapsed = now - anchor;

  // The period has rolled over (or was never anchored) — the count restarts.
  if (!anchor || elapsed >= periodMs) {
    return { allowed: true, used: 0, limit, resetsInMs: null, message: null };
  }

  const used = tasks.filter(
    (t) =>
      t.difficulty === difficulty &&
      t.created_at != null &&
      new Date(t.created_at).getTime() >= anchor,
  ).length;

  const resetsInMs = periodMs - elapsed;
  if (used >= limit) {
    const label = difficulty === 'hard' ? 'Hard' : 'Medium';
    const window = difficulty === 'hard' ? 'week' : '3 days';
    return {
      allowed: false,
      used,
      limit,
      resetsInMs,
      message: `${label} quest limit reached — ${limit} per ${window}. Resets in ${formatDuration(resetsInMs)}.`,
    };
  }

  return { allowed: true, used, limit, resetsInMs, message: null };
}

/** "2d 4h" / "3h 20m" / "12m" — compact enough for a one-line cap message. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'a moment';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * Client-side required fields, mirroring the current web form.
 *
 * NOTE — the web form no longer collects a goal statement or a P1/P2/P3
 * priority: both were removed deliberately (commit fdf694d, "Remove goal
 * statement + priority inputs from the quest form") and are optional
 * server-side. The mobile form matches today's web form so the two clients
 * collect the same fields for the study. See the Phase 4 report.
 */
export function validateQuestDraft(draft: {
  text: string;
  difficulty: Difficulty;
  evidenceType: EvidenceTypeId;
  plannedDate: Date | null;
}): { field: string; message: string } | null {
  const text = draft.text.trim();
  if (text.length < 3) return { field: 'text', message: 'Give your quest a title (at least 3 characters).' };
  if (text.length > 80) return { field: 'text', message: 'Keep the title under 80 characters.' };
  if (!/[a-z]/i.test(text)) return { field: 'text', message: 'The title needs some words, not just symbols.' };

  if (!EVIDENCE_TYPES.some((e) => e.id === draft.evidenceType)) {
    return { field: 'evidence_type', message: 'Choose how you will show this quest is done.' };
  }

  if (draft.difficulty !== 'easy' && !draft.plannedDate) {
    const label = draft.difficulty === 'hard' ? 'Hard' : 'Medium';
    return { field: 'planned_completion_date', message: `${label} quests need a planned finish date.` };
  }
  if (draft.plannedDate && draft.plannedDate.getTime() < Date.now() - 10 * 60 * 1000) {
    return { field: 'planned_completion_date', message: 'The planned finish date must be in the future.' };
  }

  return null;
}
