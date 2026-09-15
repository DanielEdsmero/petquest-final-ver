import { supabase } from '@/lib/supabase';
import { type Completion } from '@/data/completionModel';

/**
 * Reads over `quest_completions`.
 *
 * The `qc: own read` RLS policy restricts rows to the participant's own
 * submissions (and everything to admins). Writes are impossible from any
 * client — phase 7 revoked insert/update/delete on this table — so the only
 * way a row appears is `submit_completion()`, and the only way a verdict
 * changes is the serverless function or `admin_review_completion()`.
 *
 * `admin_reason` is deliberately NOT selected. A participant technically owns
 * the row and RLS would return it, but it holds internal reviewer notes; the
 * participant-facing text is `ai_reason`, which api/verify.js writes in
 * deliberately friendly language.
 */

const COMPLETION_COLUMNS =
  'id, quest_id, status, ai_verdict, ai_reason, ai_confidence, admin_verdict, ' +
  'points_earned, progress_log, created_at, ai_verdict_at, admin_reviewed_at, source';

/** The most recent submission for a quest, or null if it has never been submitted. */
export async function fetchLatestCompletion(
  questId: string,
): Promise<{ data: Completion | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select(COMPLETION_COLUMNS)
    .eq('quest_id', questId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) return { data: null, error: friendly(error.message) };
  const rows = (data ?? []) as unknown as Completion[];
  return { data: rows[0] ?? null, error: null };
}

/**
 * The participant's recent submissions, newest first, so Home can read the
 * real status of every quest on Today's Path with one query. RLS (`qc: own
 * read`) scopes this to the caller; the `user_id` filter is for the index.
 */
export async function fetchRecentCompletions(
  userId: string,
  limit = 200,
): Promise<{ data: Completion[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select(COMPLETION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: friendly(error.message) };
  return { data: (data ?? []) as unknown as Completion[], error: null };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  return message;
}
