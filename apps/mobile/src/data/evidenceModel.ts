/**
 * Evidence submission rules and the submission state machine.
 *
 * Pure and import-free so it can be unit-tested under `node --test`. The
 * native capture, upload and RPC live in src/lib/evidence.ts.
 *
 * What the server actually requires (supabase-phase8 `submit_completion`):
 *   • a photo path in the `quest-proofs` bucket, under the caller's own uid;
 *   • a progress log of at least 20 characters (after trim).
 * And what api/_lib/verify.js enforces on the photo:
 *   • at least MIN_PROOF_BYTES, or it is a `fail` with a rollback.
 *
 * The client-side checks below are the same rules, applied before the round
 * trip so a participant is told in the form rather than after an upload. The
 * server is still the authority.
 */

/** Mirrors `length(trim(p_log)) < 20` in submit_completion(). */
export const MIN_LOG_CHARS = 20;

/** Mirrors MIN_PROOF_BYTES in api/_lib/verify.js. */
export const MIN_PROOF_BYTES = 3000;

/**
 * Compression target. Long edge in px and JPEG quality. 1600px keeps a page of
 * handwriting legible for the model while cutting a 12 MP photo to ~300 KB; the
 * server only needs "plausibly shows the task", not archival quality.
 */
export const COMPRESS = { longEdge: 1600, quality: 0.8 } as const;

export type EvidenceSource = 'camera' | 'upload';

export type EvidenceDraft = {
  /** Local URI of the (already compressed) image, or null before capture. */
  uri: string | null;
  bytes: number | null;
  source: EvidenceSource | null;
  log: string;
};

/** The first thing wrong with a draft, or null when it can be submitted. */
export function validateEvidence(draft: EvidenceDraft): { field: 'photo' | 'log'; message: string } | null {
  if (!draft.uri) return { field: 'photo', message: 'Take or choose a photo of your evidence.' };
  if (draft.bytes != null && draft.bytes < MIN_PROOF_BYTES) {
    return { field: 'photo', message: 'That photo looks empty — please retake it.' };
  }
  const log = draft.log.trim();
  if (log.length < MIN_LOG_CHARS) {
    return {
      field: 'log',
      message: `Describe what you did — at least ${MIN_LOG_CHARS} characters (${log.length}/${MIN_LOG_CHARS}).`,
    };
  }
  return null;
}

/**
 * Storage path for a proof photo. The `quest-proofs` bucket policy only allows
 * an INSERT whose first folder segment equals the caller's uid, so this shape
 * is not a convention — it is what makes the upload succeed. Matches the web
 * client's `${profile.id}/${task.id}-${Date.now()}.jpg`.
 */
export function proofPath(userId: string, taskId: string, now: number = Date.now()): string {
  return `${userId}/${taskId}-${now}.jpg`;
}

/**
 * How the RPC's failure codes read to a participant. Same wording the web
 * client uses, so the two clients explain the same thing the same way.
 */
export function submitErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'locked':
      return 'Suspicious activity detected. Completion locked for 5 minutes.';
    case 'too_soon':
      return 'This quest isn’t ready yet.';
    case 'log_too_short':
      return `Your progress log needs at least ${MIN_LOG_CHARS} characters.`;
    case 'invalid':
      return 'This quest cannot be completed right now — it may already be done or not yet accepted.';
    case 'unauthenticated':
      return 'Your session expired — please sign in again.';
    case 'quest_not_eligible':
      return 'This quest has not passed the quality check yet.';
    default:
      return `Could not submit your evidence${code ? ` (${code})` : ''}. Please try again.`;
  }
}

/* ── Live progress (Phase 4E) ──
   The web client's "Gilded Waypoints": three real events, never a fake timer.
   Each step advances only when the corresponding request actually returns. */

export type SubmitStep = 'idle' | 'uploading' | 'submitting' | 'checking' | 'done' | 'failed';

export const SUBMIT_STEPS: { key: SubmitStep; label: string }[] = [
  { key: 'uploading', label: 'Uploading' },
  { key: 'submitting', label: 'Submitting' },
  { key: 'checking', label: 'AI checking' },
];

/** 0..1 for a progress bar, driven by real steps only. */
export function submitProgress(step: SubmitStep): number {
  switch (step) {
    case 'uploading':
      return 0.1;
    case 'submitting':
      return 0.45;
    case 'checking':
      return 0.7;
    case 'done':
    case 'failed':
      return 1;
    default:
      return 0;
  }
}

export type VerdictOutcome =
  | { kind: 'pass'; points: number; reason: string }
  | { kind: 'fail'; reason: string }
  | { kind: 'review'; reason: string };

/**
 * Turn the verify endpoint's reply into what the participant should be told.
 *
 * `error` is NOT a rejection. The check could not run; the provisional award
 * stands and a study admin decides. It must never read as "your evidence was
 * refused". A non-ok reply (network, 429, timeout) is the same case: the
 * submission already exists server-side, only the check is outstanding.
 */
export function outcomeFromVerdict(
  reply: { ok: true; verdict: 'pass' | 'fail' | 'error'; reason: string } | { ok: false; reason: string },
  awardedPoints: number,
): VerdictOutcome {
  if (!reply.ok) return { kind: 'review', reason: reply.reason };
  if (reply.verdict === 'pass') return { kind: 'pass', points: awardedPoints, reason: reply.reason };
  if (reply.verdict === 'fail') return { kind: 'fail', reason: reply.reason };
  return { kind: 'review', reason: reply.reason };
}
