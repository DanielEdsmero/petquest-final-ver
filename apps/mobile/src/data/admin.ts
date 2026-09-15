import {
  UNRESOLVED_VALIDITY,
  type ResearchAnalytics,
  type ValidityLogRow,
  type ValidityQueueRow,
  type VerificationQueueRow,
} from '@/data/adminModel';
import { Env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { requestVerification, type VerifyResult } from '@/lib/verifyApi';

/**
 * Admin reads and actions (Phase 7).
 *
 * IMPORT THIS ONLY FROM app/admin/*. A test enforces that. Not because
 * importing it elsewhere would leak anything — it would not — but because a
 * participant-facing screen has no business reaching for admin queries.
 *
 * WHAT ACTUALLY PROTECTS THIS DATA
 * Nothing in this file. Every read goes through RLS that admits admins only
 * (`tasks: admin read`, `qc: admin read`, `qvr: admin read`) and every action
 * is a SECURITY DEFINER RPC or a server endpoint that checks `is_admin()` /
 * the caller's role itself. A tampered client that called these as a
 * participant would get empty lists and `forbidden`. The route guard in
 * app/admin/_layout.tsx is UX; the database is the control.
 *
 * Nothing here moves a point directly. `admin_review_completion('rejected')`
 * calls `rollback_completion` server-side; `admin_resolve_quest_validity`
 * writes the validity columns the client is forbidden to touch.
 */

/* ── Validity queue ── */

const VALIDITY_COLUMNS =
  'id, user_id, text, goal, priority, difficulty, evidence_type, planned_completion_date, ' +
  'validity_status, validity_score, validity_reason, validity_checked_at, validity_reviewed_at, ' +
  'created_at, profiles(username)';

export async function fetchValidityQueue(): Promise<{ data: ValidityQueueRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(VALIDITY_COLUMNS)
    .in('validity_status', [...UNRESOLVED_VALIDITY])
    .eq('completed', false)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { data: null, error: friendly(error.message) };
  return { data: (data ?? []) as unknown as ValidityQueueRow[], error: null };
}

/**
 * The admin-only decision log. Includes `admin_reason`, `risk_flags` and
 * `model_version` — the columns deliberately stripped from every participant
 * response. RLS (`qvr: admin read`) is what makes selecting them here safe.
 */
export async function fetchValidityLog(limit = 100): Promise<{ data: ValidityLogRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quest_validity_reviews')
    .select(
      'id, task_id, user_id, task_title, difficulty, evidence_type, decision, validity_score, ' +
        'reason, admin_reason, risk_flags, model_version, reviewed_by, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: friendly(error.message) };
  return { data: (data ?? []) as unknown as ValidityLogRow[], error: null };
}

/** Accept or reject a quest's validity — the SECURITY DEFINER RPC does the write. */
export async function resolveValidity(
  taskId: string,
  status: 'accepted' | 'rejected',
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_resolve_quest_validity', {
    p_task_id: taskId,
    p_status: status,
    p_reason: null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = (data ?? {}) as { ok?: boolean; error?: string };
  return row.ok ? { ok: true, error: null } : { ok: false, error: row.error ?? 'unknown' };
}

/**
 * Re-run the AI validity check on a saved quest. Same endpoint and same
 * bearer-token contract the participant uses to create one; the server allows
 * a re-check by the owner or an admin.
 */
export async function recheckValidity(taskId: string): Promise<{ ok: boolean; decision?: string; error?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, error: 'unauthenticated' };
  try {
    const r = await fetch(`${Env.apiBaseUrl.replace(/\/+$/, '')}/api/validate-quest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ task_id: taskId }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body?.decision) return { ok: true, decision: body.decision };
    return { ok: false, error: body?.error ?? String(r.status) };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' };
  }
}

/* ── Verification queue ── */

const VERIFICATION_COLUMNS =
  'id, user_id, quest_id, proof_photo_url, progress_log, difficulty, points_earned, ' +
  'ai_verdict, ai_confidence, ai_reason, admin_verdict, admin_reason, status, source, ' +
  'created_at, verification_started_at, ai_verdict_at, admin_reviewed_at, ' +
  'tasks(text, planned_completion_date), profiles(username, selected_pet_id)';

export async function fetchVerificationQueue(): Promise<{ data: VerificationQueueRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select(VERIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: null, error: friendly(error.message) };
  return { data: (data ?? []) as unknown as VerificationQueueRow[], error: null };
}

/** Short-lived signed URL for a private proof photo. Never a public URL. */
export async function signProof(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('quest-proofs').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export type ReviewAction = 'approved' | 'rejected' | 'suspicious';

/** Approve / reject / flag — `rejected` rolls the award back server-side. */
export async function reviewCompletion(id: string, action: ReviewAction): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_review_completion', {
    p_completion_id: id,
    p_action: action,
    p_reason: null,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = (data ?? {}) as { ok?: boolean; error?: string };
  return row.ok ? { ok: true, error: null } : { ok: false, error: row.error ?? 'unknown' };
}

/** Re-run the AI verdict for one row — the same authenticated endpoint the participant uses. */
export const rerunVerification = (completionId: string): Promise<VerifyResult> => requestVerification(completionId);

/* ── Research ── */

/** Aggregate, anonymised study metrics. The RPC itself checks `is_admin()`. */
export async function fetchResearchAnalytics(): Promise<{ data: ResearchAnalytics | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_research_analytics');
  if (error) return { data: null, error: friendly(error.message) };
  const a = (data ?? { ok: false }) as ResearchAnalytics;
  if (!a.ok) return { data: null, error: a.error === 'forbidden' ? 'Admin access required.' : 'Could not load analytics.' };
  return { data: a, error: null };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  if (m.includes('permission') || m.includes('policy')) return 'Admin access required.';
  return message;
}
