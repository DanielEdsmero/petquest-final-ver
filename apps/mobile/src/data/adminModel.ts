// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { AiVerdict, AdminVerdict, CompletionStatus } from './completionModel.ts';

/**
 * Admin queue rules — the pure half of the Phase 7 admin screens.
 *
 * Mirrors what src/pages/AdminPage.jsx does on the web so an admin sees the
 * same buckets, counts and "stuck" rows on either client. Nothing here reads
 * or writes; the Supabase calls live in admin.ts.
 *
 * SECURITY NOTE: these types include admin-only fields (`admin_reason`,
 * `risk_flags`, `model_version`). They are safe to name here because the rows
 * come from `quest_validity_reviews` and `quest_completions` under RLS that
 * only returns them to `is_admin()`. A participant who reached this code would
 * receive empty lists, not data. See src/data/admin.ts.
 */

/* ── Validity queue ── */

export const UNRESOLVED_VALIDITY = ['pending_ai_review', 'needs_clarification', 'rejected'] as const;
export type UnresolvedStatus = (typeof UNRESOLVED_VALIDITY)[number];
export type ValidityFilter = UnresolvedStatus | 'all';

export const VALIDITY_FILTERS: { key: ValidityFilter; label: string }[] = [
  { key: 'pending_ai_review', label: 'Awaiting AI' },
  { key: 'needs_clarification', label: 'Needs changes' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export type ValidityQueueRow = {
  id: string;
  user_id: string;
  text: string;
  goal: string | null;
  priority: string | null;
  difficulty: string | null;
  evidence_type: string | null;
  planned_completion_date: string | null;
  validity_status: string | null;
  validity_score: number | null;
  validity_reason: string | null;
  validity_checked_at: string | null;
  validity_reviewed_at: string | null;
  created_at: string;
  profiles: { username: string | null } | null;
};

export type ValidityLogRow = {
  id: string;
  task_id: string | null;
  user_id: string;
  task_title: string;
  difficulty: string | null;
  evidence_type: string | null;
  decision: string;
  validity_score: number | null;
  reason: string | null;
  admin_reason: string | null;
  risk_flags: string[] | null;
  model_version: string | null;
  reviewed_by: string | null;
  created_at: string;
};

export function filterValidity<T extends { validity_status: string | null }>(rows: T[], filter: ValidityFilter): T[] {
  return filter === 'all' ? rows : rows.filter((r) => r.validity_status === filter);
}

export function countValidity<T extends { validity_status: string | null }>(rows: T[]): Record<ValidityFilter, number> {
  return {
    pending_ai_review: rows.filter((r) => r.validity_status === 'pending_ai_review').length,
    needs_clarification: rows.filter((r) => r.validity_status === 'needs_clarification').length,
    rejected: rows.filter((r) => r.validity_status === 'rejected').length,
    all: rows.length,
  };
}

/** Which admin actions make sense for a validity row. Mirrors the web buttons. */
export function validityActions(status: string | null): { runAi: boolean; accept: boolean; reject: boolean } {
  return {
    runAi: true,
    accept: true,
    // Rejecting an already-rejected quest is a no-op the web hides too.
    reject: status !== 'rejected',
  };
}

/* ── Verification queue ── */

export type VerificationFilter = 'all' | 'pending' | 'pass' | 'fail';

export const VERIFICATION_FILTERS: { key: VerificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'pass', label: 'Passed' },
  { key: 'fail', label: 'Failed' },
];

export type VerificationQueueRow = {
  id: string;
  user_id: string;
  quest_id: string | null;
  proof_photo_url: string | null;
  progress_log: string;
  difficulty: string | null;
  points_earned: number;
  ai_verdict: AiVerdict | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  admin_verdict: AdminVerdict;
  admin_reason: string | null;
  status: CompletionStatus;
  source: string | null;
  created_at: string;
  verification_started_at: string | null;
  ai_verdict_at: string | null;
  admin_reviewed_at: string | null;
  tasks: { text: string; planned_completion_date: string | null } | null;
  profiles: { username: string | null; selected_pet_id: string | null } | null;
};

/** A row whose AI verdict never landed — what "Re-run stuck" targets. */
export const isStuck = (r: { ai_verdict?: AiVerdict | null }) =>
  !r.ai_verdict || r.ai_verdict === 'pending' || r.ai_verdict === 'error';

export function filterVerification(rows: VerificationQueueRow[], filter: VerificationFilter): VerificationQueueRow[] {
  if (filter === 'all') return rows;
  if (filter === 'pending') return rows.filter((r) => r.status === 'pending');
  return rows.filter((r) => r.ai_verdict === filter);
}

export function countVerification(rows: VerificationQueueRow[]): Record<VerificationFilter, number> {
  return {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    pass: rows.filter((r) => r.ai_verdict === 'pass').length,
    fail: rows.filter((r) => r.ai_verdict === 'fail').length,
  };
}

/**
 * Active work time = verification opened → submitted. NOT the quest's age
 * since creation, which the web once showed and which produced absurd values.
 */
export function activeTimeMs(r: { created_at: string; verification_started_at: string | null }): number | null {
  if (!r.verification_started_at) return null;
  return Math.max(0, new Date(r.created_at).getTime() - new Date(r.verification_started_at).getTime());
}

export function formatActive(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export const STATUS_META: Record<CompletionStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#f5a31a' },
  verified: { label: 'Verified', color: '#4ade80' },
  rejected: { label: 'Rejected', color: '#fb7185' },
  reverted: { label: 'Reverted', color: '#fb7185' },
};

export const AI_COLOR: Record<string, string> = {
  pass: '#4ade80',
  fail: '#fb7185',
  error: '#22d3ee',
  pending: '#8080aa',
};

/** Batch re-run summary, worded like the web toast. */
export function summariseRerun(verdicted: number, manual: number): string {
  const total = verdicted + manual;
  return `${total} ${total === 1 ? 'entry' : 'entries'} re-checked: ${verdicted} re-verdicted, ${manual} queued for manual review.`;
}

/* ── Research analytics ── */

export type ResearchAnalytics = {
  ok: boolean;
  duration_by_difficulty?: Record<string, { avg_duration_minutes: number | null; completed_count: number }>;
  total_completed?: number;
  procrastinated_count?: number;
  procrastination_rate?: number;
  planned_completed?: number;
  on_time_count?: number;
  planning_accuracy?: number | null;
  error?: string;
};

/** Rows for the research card, in a fixed order, with dashes where n is 0. */
export function researchRows(a: ResearchAnalytics | null): { label: string; value: string; hint?: string }[] {
  if (!a || !a.ok) return [];
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
  const rows: { label: string; value: string; hint?: string }[] = [
    { label: 'Completed quests', value: String(a.total_completed ?? 0) },
    {
      label: 'Procrastination rate',
      value: pct(a.procrastination_rate),
      hint: `${a.procrastinated_count ?? 0} of ${a.total_completed ?? 0} completed >24h after creation or >2h past plan`,
    },
    {
      label: 'Planning accuracy',
      value: pct(a.planning_accuracy),
      hint:
        (a.planned_completed ?? 0) > 0
          ? `${a.on_time_count ?? 0} of ${a.planned_completed} planned quests finished on time`
          : 'No completed quests carried a planned date yet',
    },
  ];
  for (const d of ['easy', 'medium', 'hard', 'boss']) {
    const s = a.duration_by_difficulty?.[d];
    if (!s) continue;
    rows.push({
      label: `Avg. ${d} duration`,
      value: s.avg_duration_minutes == null ? '—' : `${Math.round(s.avg_duration_minutes)} min`,
      hint: `${s.completed_count} completed`,
    });
  }
  return rows;
}
