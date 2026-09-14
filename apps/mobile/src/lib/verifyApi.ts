import { Env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/**
 * The proof-verification endpoint — `POST {API_BASE}/api/verify`.
 *
 * Added in Phase 5 so Phase 4D has an authenticated path to call. It is not
 * used by any screen yet; evidence capture is 4D.
 *
 * Auth: the participant's Supabase access token. Since Phase 13 the server
 * verifies that token and checks the caller owns the completion (or is an
 * admin) before writing a verdict — previously it accepted a bare
 * `{ completion_id }` from anyone, which let a stranger force a `fail` and
 * reverse someone else's points.
 *
 * Contract:
 *   200 → { verdict: 'pass' | 'fail' | 'error', confidence, reason, reused? }
 *   400 → { error: 'missing_completion_id' }
 *   401 → { error: 'unauthenticated' }
 *   403 → { error: 'forbidden' }        not your completion
 *   404 → { error: 'completion_not_found' }
 *   429 → { error: 'rate_limited', message, retry_in_ms }
 *
 * A `verdict` of 'error' is NOT a rejection: the check could not run, the
 * provisional award stands, and a study admin decides. Treating it as a failure
 * would tell a participant their evidence was refused when it was not.
 *
 * React Native's fetch is not CORS-constrained, so no server CORS change was
 * needed for native callers.
 */

export type Verdict = 'pass' | 'fail' | 'error';

export type VerifyResult =
  | { ok: true; verdict: Verdict; confidence: number | null; reason: string; reused: boolean }
  | { ok: false; reason: string; retryInMs?: number };

/** Gemini plus its retry chain can be slow; the web client allows about this. */
const TIMEOUT_MS = 45_000;

export async function requestVerification(completionId: string): Promise<VerifyResult> {
  if (!Env.apiBaseUrl) {
    return { ok: false, reason: 'Verification is not configured on this device.' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, reason: 'Your session expired — please sign in again.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${Env.apiBaseUrl.replace(/\/+$/, '')}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ completion_id: completionId }),
      signal: controller.signal,
    });

    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    const body = isJson ? await response.json().catch(() => null) : null;

    if (response.status === 200 && body?.verdict) {
      return {
        ok: true,
        verdict: body.verdict as Verdict,
        confidence: typeof body.confidence === 'number' ? body.confidence : null,
        reason: body.reason ?? '',
        reused: body.reused === true,
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        reason: body?.message ?? 'Please wait a moment before checking again.',
        retryInMs: typeof body?.retry_in_ms === 'number' ? body.retry_in_ms : undefined,
      };
    }
    if (response.status === 401) {
      return { ok: false, reason: 'Your session expired — please sign in again.' };
    }
    if (response.status === 403 || response.status === 404) {
      return { ok: false, reason: 'That submission could not be found.' };
    }
    return { ok: false, reason: 'The check could not run — it has been queued for review.' };
  } catch (e: unknown) {
    // Either way the submission is already recorded server-side, so the
    // honest message is that the CHECK did not run, not that it failed.
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      reason: aborted
        ? 'The check is taking longer than expected — it has been queued for review.'
        : 'Cannot reach the check right now — it has been queued for review.',
    };
  } finally {
    clearTimeout(timer);
  }
}
