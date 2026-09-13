import type { Difficulty, EvidenceTypeId } from '@/data/quests';
import { Env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/**
 * The quest-validity endpoint — `POST {API_BASE}/api/validate-quest`.
 *
 * This is the ONLY way the mobile app creates a quest. The server validates the
 * fields, asks Gemini for a verdict, and writes the row with the service role;
 * the phone never decides that a quest is accepted. A direct client insert
 * would be forced to `pending_ai_review` by the `tasks_validity_guard` trigger
 * anyway (supabase-phase12), so there is no shortcut worth taking.
 *
 * Auth: the caller's Supabase access token goes in `Authorization: Bearer`, and
 * the server derives the user id from that token — never from the body.
 *
 * Contract (MOBILE_MIGRATION_MAP.md §6):
 *   200 → { decision, validity_score, reason, recommended_evidence_type, task? }
 *   400 → { error:'validation', field, message }
 *   401 → { error:'unauthenticated' }
 *   429 → { error, message }          rate limited
 *   503 → { error:'ai_unavailable', message }
 *
 * React Native's fetch is not subject to CORS, so no server change is needed
 * for native requests.
 */

export type ValidityDecision = 'accept' | 'clarify' | 'reject' | 'pending';

export type QuestDraft = {
  text: string;
  difficulty: Difficulty;
  evidence_type: EvidenceTypeId;
  planned_completion_date: string | null;
  /** Optional; the current web form does not collect these. */
  goal?: string | null;
  priority?: string | null;
};

export type ValidateResult = {
  ok: boolean;
  decision: ValidityDecision | 'invalid' | 'rate_limited' | 'unauthenticated' | 'unavailable' | 'timeout';
  reason: string;
  score: number | null;
  recommendedEvidenceType: EvidenceTypeId | null;
  field?: string;
  /** The saved row, when the server created one. */
  task: unknown | null;
};

/** The server can take a while: Gemini plus retries. The web client uses 45s. */
const TIMEOUT_MS = 45_000;

export function apiUrl(path: string): string {
  const base = Env.apiBaseUrl.replace(/\/+$/, '');
  return `${base}${path}`;
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function validateQuest(draft: QuestDraft): Promise<ValidateResult> {
  if (!Env.apiBaseUrl) {
    return fail(
      'unavailable',
      'The quest check is not configured on this device. Set EXPO_PUBLIC_API_BASE_URL and restart.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl('/api/validate-quest'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(draft),
      signal: controller.signal,
    });

    // A misconfigured base URL returns the site's HTML, not JSON — treat that
    // as "unavailable" rather than crashing on a parse error.
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    const body = isJson ? await response.json().catch(() => null) : null;

    if (response.status === 200 && body?.decision) {
      const decision = body.decision as ValidityDecision;
      return {
        // `pending` counts as ok: the quest IS saved, just not yet completable.
        ok: decision === 'accept' || decision === 'pending',
        decision,
        reason: body.reason ?? '',
        score: typeof body.validity_score === 'number' ? body.validity_score : null,
        recommendedEvidenceType: body.recommended_evidence_type ?? null,
        task: body.task ?? null,
      };
    }

    if (response.status === 400) {
      return fail('invalid', body?.message ?? 'Please check the quest details.', body?.field);
    }
    if (response.status === 401) {
      return fail('unauthenticated', 'Your session expired — please sign in again.');
    }
    if (response.status === 429) {
      return fail('rate_limited', body?.message ?? 'Please wait a moment before checking another quest.');
    }
    return fail(
      'unavailable',
      body?.message ?? 'The quest check is unavailable right now. Please try again in a moment.',
    );
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return fail(
      aborted ? 'timeout' : 'unavailable',
      aborted
        ? 'The quest check is taking longer than expected. Check your quest log in a moment before trying again.'
        : 'Cannot reach the quest check. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function fail(decision: ValidateResult['decision'], reason: string, field?: string): ValidateResult {
  return { ok: false, decision, reason, score: null, recommendedEvidenceType: null, field, task: null };
}
