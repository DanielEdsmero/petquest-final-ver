import type { Difficulty, EvidenceTypeId } from '@/data/quests';

/**
 * The `tasks` row as the participant-facing screens use it, plus the derived
 * counts. Import-light on purpose (only types) so it can be unit-tested under
 * `node --test`; the Supabase queries live in tasks.ts.
 */

export type Task = {
  id: string;
  user_id: string;
  text: string;
  difficulty: Difficulty;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  planned_completion_date: string | null;
  goal: string | null;
  priority: string | null;
  evidence_type: EvidenceTypeId | null;
  validity_status: string | null;
  validity_score: number | null;
  validity_reason: string | null;
  is_procrastinated: boolean | null;
  completion_duration_minutes: number | null;
};

/** Counts the dashboard shows, derived locally so there is no second query. */
export function summariseTasks(tasks: Task[] | null) {
  const list = tasks ?? [];
  const active = list.filter((t) => !t.completed);
  return {
    total: list.length,
    active: active.length,
    completed: list.filter((t) => t.completed).length,
    awaitingCheck: list.filter((t) => t.validity_status === 'pending_ai_review').length,
    needsAttention: list.filter(
      (t) => t.validity_status === 'needs_clarification' || t.validity_status === 'rejected',
    ).length,
  };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  return message;
}
