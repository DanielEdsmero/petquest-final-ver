import { supabase } from '@/lib/supabase';
import { type Task } from '@/data/taskModel';

/**
 * Reads over the `tasks` table.
 *
 * Every query is scoped by `user_id` for clarity, but that is not what makes it
 * safe: the `tasks: own all` RLS policy already restricts rows to
 * `auth.uid() = user_id`, so a tampered client cannot widen the result. The
 * filter is there so the intent is readable and the index is used.
 *
 * Writes are deliberately absent. Creating a quest goes through
 * `/api/validate-quest` (see src/lib/questApi.ts) and completing one goes
 * through the `submit_completion` RPC — the client never inserts an accepted
 * quest or awards a point.
 */

/** Columns the participant-facing screens need. */
const TASK_COLUMNS =
  'id, user_id, text, difficulty, completed, created_at, completed_at, started_at, ' +
  'planned_completion_date, goal, priority, evidence_type, validity_status, validity_score, ' +
  'validity_reason, is_procrastinated, completion_duration_minutes';

/**
 * Admin-only validity columns (`validity_admin_reason`, risk flags, model
 * version) are intentionally NOT selected. They live behind RLS anyway, but
 * asking for them would surface an error on every participant read.
 *
 * The `as unknown as` casts below are because this project has no generated
 * Supabase schema types (that needs the Supabase CLI, which is not part of the
 * toolchain here), so supabase-js cannot infer a row shape from the select
 * string and falls back to `GenericStringError`. The `Task` type above is
 * therefore a hand-maintained mirror of the columns requested — if a column is
 * renamed server-side, this is the file to update.
 */

export async function fetchTasks(userId: string): Promise<{ data: Task[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: friendly(error.message) };
  return { data: (data ?? []) as unknown as Task[], error: null };
}

export async function fetchTask(taskId: string): Promise<{ data: Task | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .single();

  if (error) return { data: null, error: friendly(error.message) };
  return { data: data as unknown as Task, error: null };
}

/**
 * Delete a quest the participant no longer wants.
 *
 * Allowed by the `tasks: own all` policy for their own rows. It cannot be used
 * to erase an awarded completion: `quest_completions` rows are separate, and
 * the economy RPCs are the only path that moves points.
 */
export async function deleteTask(taskId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  return { error: error ? friendly(error.message) : null };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  return message;
}
