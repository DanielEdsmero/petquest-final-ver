/**
 * The verification pipeline, as a participant sees it.
 *
 * Pure and import-light so it can be unit-tested under `node --test`. The
 * Supabase read lives in completions.ts.
 *
 * The real flow, from supabase-phase7/8 and api/verify.js:
 *
 *   submit_completion()  → a quest_completions row, ai_verdict 'pending',
 *                          admin_verdict 'pending', status 'pending', and the
 *                          points awarded PROVISIONALLY
 *   /api/verify          → writes ai_verdict pass | fail | error
 *                          fail   → rollback_completion() reverses the award
 *                          error  → the award stands, queued for an admin
 *   admin_review_completion() → status 'verified' (approved) or 'reverted'
 *
 * So "approved" is not the same as "points awarded": points land provisionally
 * at submission and are reversed on a fail. The UI must not imply the award is
 * final before an admin has confirmed it.
 */

export type AiVerdict = 'pending' | 'pass' | 'fail' | 'error';
export type AdminVerdict = 'pending' | 'approved' | 'rejected' | 'suspicious';
export type CompletionStatus = 'pending' | 'verified' | 'rejected' | 'reverted';

export type Completion = {
  id: string;
  quest_id: string | null;
  status: CompletionStatus;
  ai_verdict: AiVerdict;
  /** Written by the server and already participant-safe — never a model name. */
  ai_reason: string | null;
  ai_confidence: number | null;
  admin_verdict: AdminVerdict;
  points_earned: number;
  progress_log: string | null;
  created_at: string;
  ai_verdict_at: string | null;
  admin_reviewed_at: string | null;
  source: string | null;
};

export type StageState = 'done' | 'active' | 'pending' | 'failed';

export type Stage = {
  key: 'submitted' | 'ai_check' | 'admin_review' | 'outcome';
  label: string;
  state: StageState;
  detail?: string;
};

/**
 * The four stages for one submission.
 *
 * `active` means "this is where it is now"; `pending` means not reached yet.
 * Only a genuine rejection is `failed` — an AI error is not a failure, it just
 * routes to a human.
 */
export function verificationStages(c: Completion | null): Stage[] {
  if (!c) return [];

  const reverted = c.status === 'reverted' || c.status === 'rejected';
  const verified = c.status === 'verified';
  const aiDone = c.ai_verdict !== 'pending';
  const aiFailed = c.ai_verdict === 'fail';
  const aiErrored = c.ai_verdict === 'error';
  const adminDecided = c.admin_verdict === 'approved' || c.admin_verdict === 'rejected';

  const submitted: Stage = { key: 'submitted', label: 'Submitted', state: 'done' };

  const aiCheck: Stage = {
    key: 'ai_check',
    label: 'AI check',
    state: !aiDone ? 'active' : aiFailed ? 'failed' : 'done',
    detail: !aiDone
      ? 'Your evidence is being checked.'
      : aiErrored
        ? 'Could not be checked automatically — a study admin will look at it.'
        : (c.ai_reason ?? undefined),
  };

  // A human is involved when the AI could not decide, when it rejected the
  // evidence, or whenever an admin has already weighed in.
  const adminNeeded = aiErrored || aiFailed || adminDecided || c.admin_verdict === 'suspicious';
  const adminReview: Stage = {
    key: 'admin_review',
    label: 'Admin review',
    state: adminDecided
      ? c.admin_verdict === 'approved'
        ? 'done'
        : 'failed'
      : adminNeeded
        ? 'active'
        : !aiDone
          ? 'pending'
          : 'pending',
    detail: adminNeeded && !adminDecided ? 'Waiting for a study admin.' : undefined,
  };

  const outcome: Stage = {
    key: 'outcome',
    label: verified ? 'Approved' : reverted ? 'Not approved' : 'Outcome',
    state: verified ? 'done' : reverted ? 'failed' : 'pending',
    detail: verified
      ? 'Your points are confirmed.'
      : reverted
        ? 'The points for this attempt were reversed.'
        : aiDone && !aiFailed
          ? 'Points are provisional until an admin confirms.'
          : undefined,
  };

  return [submitted, aiCheck, adminReview, outcome];
}

/** One line summarising where a submission stands. */
export function verificationSummary(c: Completion | null): {
  label: string;
  tone: 'neutral' | 'good' | 'bad' | 'waiting';
} {
  if (!c) return { label: 'Not submitted', tone: 'neutral' };
  if (c.status === 'verified') return { label: 'Approved', tone: 'good' };
  if (c.status === 'reverted' || c.status === 'rejected') {
    return { label: 'Not approved', tone: 'bad' };
  }
  if (c.ai_verdict === 'pending') return { label: 'Checking…', tone: 'waiting' };
  if (c.ai_verdict === 'error') return { label: 'Awaiting admin review', tone: 'waiting' };
  if (c.ai_verdict === 'fail') return { label: 'Evidence rejected', tone: 'bad' };
  return { label: 'Awaiting confirmation', tone: 'waiting' };
}

/**
 * Whether the points from this submission are still provisional.
 *
 * True from submission until an admin approves. Used so the detail screen never
 * tells a participant their points are safe when they can still be reversed.
 */
export const pointsAreProvisional = (c: Completion | null) =>
  !!c && c.status !== 'verified' && c.status !== 'reverted' && c.status !== 'rejected';
