// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { Task } from './taskModel.ts';

/**
 * Progress tab metrics — the participant's OWN quests only, computed from the
 * `tasks` rows RLS already scopes to them. Nothing here is a study-wide figure;
 * the cross-participant analytics stay behind `get_research_analytics()` and
 * the admin routes.
 *
 * Figures are `null` when there is nothing to compute from, and the screen
 * shows a dash: "0% on time" and "no planned quests yet" are different things.
 */

export type ProgressMetrics = {
  completed: number;
  /** Completed quests that carried a planned finish date. */
  planned: number;
  /** Of those, finished at or before the plan. */
  onTime: number;
  /** 0–100, or null when no completed quest had a plan. */
  onTimeRate: number | null;
  /** Server-flagged (`is_procrastinated`) completions. */
  late: number;
  /** Mean minutes past the plan across late-with-a-plan completions, or null. */
  avgDelayMinutes: number | null;
  /** Share (0–100) of all quests created with a planned date, or null with no quests. */
  planningRate: number | null;
  /** Share (0–100) of quests that were not Easy — a rough prioritisation signal. */
  stretchRate: number | null;
};

export function progressMetrics(tasks: Task[] | null): ProgressMetrics {
  const list = tasks ?? [];
  const done = list.filter((t) => t.completed);
  const planned = done.filter((t) => t.planned_completion_date && t.completed_at);
  const onTime = planned.filter(
    (t) => new Date(t.completed_at!).getTime() <= new Date(t.planned_completion_date!).getTime(),
  );
  const lateWithPlan = planned.filter((t) => !onTime.includes(t));
  const delays = lateWithPlan.map(
    (t) => (new Date(t.completed_at!).getTime() - new Date(t.planned_completion_date!).getTime()) / 60_000,
  );
  const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

  return {
    completed: done.length,
    planned: planned.length,
    onTime: onTime.length,
    onTimeRate: pct(onTime.length, planned.length),
    late: done.filter((t) => t.is_procrastinated === true).length,
    avgDelayMinutes: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    planningRate: pct(list.filter((t) => !!t.planned_completion_date).length, list.length),
    stretchRate: pct(list.filter((t) => t.difficulty === 'medium' || t.difficulty === 'hard').length, list.length),
  };
}

/** "—", "45 min", "3 h 20 min", "2 d 4 h". */
export function formatMinutes(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export const formatPct = (v: number | null) => (v == null ? '—' : `${v}%`);
