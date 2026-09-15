/*
 * "Today's Adventure" — Home, Quests, Progress and the shared UI.
 *
 * Block 1 tests the pure home model against real-shaped rows. Blocks 2–5 are
 * static guards on the screens for the things that matter in the study: real
 * data only, the primary action only routes, statuses come from the server,
 * no admin material on a participant screen, and nothing is mutated locally.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Completion } from '../src/data/completionModel.ts';
import { latestByQuest } from '../src/data/completionModel.ts';
import {
  QUEST_FILTERS,
  bucketQuests,
  greeting,
  heroMessage,
  nextQuest,
  nextQuestAction,
  plannedLabel,
  questFilterOf,
  questStatus,
  todaySummary,
  todaysPath,
} from '../src/data/homeModel.ts';
import { formatMinutes, formatPct, progressMetrics } from '../src/data/progressModel.ts';
import type { Task } from '../src/data/taskModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');
const APP = path.join(MOBILE, 'src', 'app');
const app = (p: string) => read(path.join('src', 'app', p));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const NOW = new Date(2026, 8, 15, 10, 0, 0); // a Tuesday, 10:00 local
const iso = (d: Date) => d.toISOString();
const at = (h: number, dayOffset = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, h, 0, 0);

let n = 0;
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  user_id: 'u1',
  text: 'Write the lab report',
  difficulty: 'easy',
  completed: false,
  created_at: iso(at(8, -1)),
  completed_at: null,
  started_at: null,
  planned_completion_date: null,
  goal: null,
  priority: null,
  evidence_type: 'photo',
  validity_status: 'accepted',
  validity_score: null,
  validity_reason: null,
  is_procrastinated: null,
  completion_duration_minutes: null,
  ...over,
});

const completion = (over: Partial<Completion> = {}): Completion => ({
  id: `c${++n}`,
  quest_id: 't1',
  status: 'pending',
  ai_verdict: 'pending',
  ai_reason: null,
  ai_confidence: null,
  admin_verdict: 'pending',
  points_earned: 10,
  progress_log: 'done',
  created_at: iso(at(9)),
  ai_verdict_at: null,
  admin_reviewed_at: null,
  source: 'camera',
  ...over,
});

describe('1. the home model', () => {
  test('greeting follows the clock', () => {
    assert.equal(greeting(new Date(2026, 0, 1, 7)), 'Good morning');
    assert.equal(greeting(new Date(2026, 0, 1, 13)), 'Good afternoon');
    assert.equal(greeting(new Date(2026, 0, 1, 19)), 'Good evening');
    assert.equal(greeting(new Date(2026, 0, 1, 2)), 'Good night');
  });

  test('planned labels: today, tomorrow, overdue, a date', () => {
    assert.match(plannedLabel(task({ planned_completion_date: iso(at(17)) }), NOW)!, /^Today /);
    assert.match(plannedLabel(task({ planned_completion_date: iso(at(9, 1)) }), NOW)!, /^Tomorrow /);
    assert.equal(plannedLabel(task({ planned_completion_date: iso(at(9)) }), NOW), 'Overdue');
    assert.equal(plannedLabel(task({ planned_completion_date: iso(at(9)), completed: true }), NOW)!.startsWith('Today'), true, 'a completed quest is never overdue');
    assert.equal(plannedLabel(task(), NOW), null);
  });

  test('status comes from the real pipeline, never from a local flag', () => {
    const open = task();
    assert.equal(questStatus(open, null).label, 'Upcoming');
    assert.equal(questStatus(task({ validity_status: 'pending_ai_review' }), null).label, 'Awaiting check');
    assert.equal(questStatus(task({ validity_status: 'needs_clarification' }), null).label, 'Needs changes');
    const done = task({ completed: true, completed_at: iso(at(9)) });
    assert.equal(questStatus(done, completion({ ai_verdict: 'pending' })).label, 'Submitted');
    assert.equal(questStatus(done, completion({ ai_verdict: 'pass' })).label, 'Queued for review', 'a pass is still provisional until an admin confirms');
    assert.equal(questStatus(done, completion({ ai_verdict: 'error' })).label, 'Queued for review');
    assert.equal(questStatus(done, completion({ status: 'verified', ai_verdict: 'pass', admin_verdict: 'approved' })).label, 'Completed');
    assert.equal(questStatus(open, completion({ status: 'reverted', ai_verdict: 'fail' })).label, 'Not approved');
    assert.equal(questStatus(done, completion({ status: 'reverted', ai_verdict: 'fail' })).label, 'Not approved');
  });

  test('next quest: overdue first, then soonest planned, then oldest unplanned; only actionable ones', () => {
    const overdue = task({ id: 'overdue', planned_completion_date: iso(at(8)) });
    const later = task({ id: 'later', planned_completion_date: iso(at(15)) });
    const unplannedOld = task({ id: 'old', created_at: iso(at(8, -3)) });
    const unplannedNew = task({ id: 'new', created_at: iso(at(8, -1)) });
    const notEligible = task({ id: 'pending', validity_status: 'pending_ai_review', planned_completion_date: iso(at(7)) });
    const done = task({ id: 'done', completed: true });
    const cooling = task({ id: 'cool', completed_at: iso(new Date(NOW.getTime() - 60_000)) });

    assert.equal(nextQuest([unplannedNew, later, done, notEligible, overdue, unplannedOld, cooling], {}, NOW)!.id, 'overdue');
    assert.equal(nextQuest([unplannedNew, later, unplannedOld], {}, NOW)!.id, 'later');
    assert.equal(nextQuest([unplannedNew, unplannedOld], {}, NOW)!.id, 'old');
    assert.equal(nextQuest([notEligible, done, cooling], {}, NOW), null);
    assert.equal(nextQuest(null, {}, NOW), null);
  });

  test('the primary action only routes, and its label follows the real state', () => {
    const t = task();
    assert.deepEqual(nextQuestAction(t, null), { label: 'Start quest', route: 'detail' });
    assert.deepEqual(nextQuestAction(t, completion({ status: 'reverted', ai_verdict: 'fail' })), { label: 'Submit evidence', route: 'verify' });
    assert.deepEqual(nextQuestAction(t, completion()), { label: 'Continue quest', route: 'detail' });
  });

  test("today's path: today's quests only, live first, done last, capped with a flag", () => {
    const doneToday = task({ id: 'doneToday', completed: true, completed_at: iso(at(9)) });
    const doneYesterday = task({ id: 'doneYesterday', completed: true, completed_at: iso(at(9, -1)) });
    const plannedToday = task({ id: 'plannedToday', planned_completion_date: iso(at(16)) });
    const plannedNextWeek = task({ id: 'nextWeek', planned_completion_date: iso(at(9, 7)) });
    const overdue = task({ id: 'overdue', planned_completion_date: iso(at(9, -2)) });
    const unplanned = task({ id: 'unplanned' });
    const submitted = task({ id: 'submitted', completed: true, completed_at: iso(at(9, 0)) });
    const byQuest = { submitted: completion({ quest_id: 'submitted' }) };

    const { rows, truncated } = todaysPath([doneToday, doneYesterday, plannedToday, plannedNextWeek, overdue, unplanned, submitted], byQuest, NOW, 10);
    const ids = rows.map((r) => r.task.id);
    assert.ok(!ids.includes('doneYesterday'), 'yesterday is not today');
    assert.ok(!ids.includes('nextWeek'), 'next week is not today');
    assert.equal(ids[0], 'submitted', 'what is happening now goes first');
    assert.equal(ids[ids.length - 1], 'doneToday', 'what is finished goes last');
    assert.equal(truncated, false);

    const many = Array.from({ length: 8 }, (_, i) => task({ id: `m${i}` }));
    const capped = todaysPath(many, {}, NOW, 5);
    assert.equal(capped.rows.length, 5);
    assert.equal(capped.truncated, true);
  });

  test('the summary and hero message never claim points', () => {
    const s = todaySummary([task({ completed: true, completed_at: iso(at(9)) }), task()], NOW);
    assert.deepEqual(s, { completedToday: 1, openToday: 1 });
    for (const m of [heroMessage(task(), s), heroMessage(null, { completedToday: 2, openToday: 0 }), heroMessage(null, { completedToday: 0, openToday: 0 })]) {
      assert.doesNotMatch(m, /point|\+\d/i);
    }
    assert.equal(heroMessage(task(), s), 'Ready for your next quest?');
  });

  test('latestByQuest keeps the newest row per quest', () => {
    const older = completion({ quest_id: 'q', id: 'older', status: 'reverted' });
    const newer = completion({ quest_id: 'q', id: 'newer' });
    assert.equal(latestByQuest([newer, older]).q!.id, 'newer');
    assert.equal(latestByQuest([completion({ quest_id: null })]).q, undefined);
  });

  test('quest list buckets are disjoint and add up', () => {
    const list = [
      task({ id: 'a' }),
      task({ id: 'b', planned_completion_date: iso(at(9, 3)) }),
      task({ id: 'c', completed: true, completed_at: iso(at(9)) }),
      task({ id: 'd', validity_status: 'rejected' }),
      task({ id: 'e', completed: true, completed_at: iso(at(9)) }),
    ];
    const byQuest = { e: completion({ quest_id: 'e', status: 'reverted', ai_verdict: 'fail' }) };
    const b = bucketQuests(list, byQuest, NOW);
    assert.deepEqual(QUEST_FILTERS.map((f) => f.key), ['today', 'upcoming', 'completed', 'needs_review']);
    assert.deepEqual(b.today.map((t) => t.id), ['a']);
    assert.deepEqual(b.upcoming.map((t) => t.id), ['b']);
    assert.deepEqual(b.completed.map((t) => t.id), ['c']);
    assert.deepEqual(b.needs_review.map((t) => t.id).sort(), ['d', 'e']);
    assert.equal(Object.values(b).reduce((s, arr) => s + arr.length, 0), list.length);
    assert.equal(questFilterOf(task({ planned_completion_date: iso(at(9, -1)) }), null, NOW), 'today', 'overdue is today');
  });
});

describe('2. progress metrics are own-data aggregates with honest blanks', () => {
  test('on-time rate, late count, average delay, planning rate', () => {
    const list = [
      task({ completed: true, planned_completion_date: iso(at(12)), completed_at: iso(at(11)) }),
      task({ completed: true, planned_completion_date: iso(at(12)), completed_at: iso(at(14)), is_procrastinated: true }),
      task({ completed: true, completed_at: iso(at(9)) }),
      task(),
    ];
    const m = progressMetrics(list);
    assert.equal(m.completed, 3);
    assert.equal(m.planned, 2);
    assert.equal(m.onTime, 1);
    assert.equal(m.onTimeRate, 50);
    assert.equal(m.late, 1);
    assert.equal(m.avgDelayMinutes, 120);
    assert.equal(m.planningRate, 50);
  });

  test('nothing to compute from is null, and renders as a dash', () => {
    const m = progressMetrics([]);
    assert.equal(m.onTimeRate, null);
    assert.equal(m.avgDelayMinutes, null);
    assert.equal(m.planningRate, null);
    assert.equal(formatPct(null), '—');
    assert.equal(formatMinutes(null), '—');
    assert.equal(formatMinutes(45), '45 min');
    assert.equal(formatMinutes(200), '3 h 20 min');
    assert.equal(formatMinutes(3000), '2 d 2 h');
  });

  test('the Progress screen shows own metrics only and never the admin RPC', () => {
    const src = app('(tabs)/pet.tsx');
    assert.match(src, /progressMetrics\(tasks\.data\)/);
    assert.doesNotMatch(src, /get_research_analytics|@\/data\/admin/);
  });
});

describe('3. Home renders real data and only routes', () => {
  const home = app('(tabs)/index.tsx');

  test('the pet hero uses the real sprite for the stored level', () => {
    assert.match(home, /<PetHero/);
    assert.match(home, /spriteFor\(profile\?\.selected_pet_id, level\)/);
    assert.match(home, /const level = profile\?\.pet_level \?\? progress\.level/);
    assert.match(read('src/components/ui.tsx'), /allowDownscaling=\{false\}/);
    assert.match(read('src/components/ui.tsx'), /contentFit="contain"/);
  });

  test('the next quest and the path come from fetched tasks and completions', () => {
    assert.match(home, /fetchTasks\(userId\)/);
    assert.match(home, /fetchRecentCompletions\(userId\)/);
    assert.match(home, /nextQuest\(tasks\.data, byQuest\)/);
    assert.match(home, /todaysPath\(tasks\.data, byQuest\)/);
    assert.match(home, /questStatus|todaysPath/);
  });

  test('no demo content: no hardcoded quest titles or fake numbers', () => {
    assert.doesNotMatch(home, /text: '[^']+'/, 'a literal task object');
    assert.doesNotMatch(home, /points: \d|streak: \d|\bcompleted: (true|false)\b/);
    assert.doesNotMatch(home, /Sample|Demo|Lorem|placeholder quest/i);
  });

  test('Start quest opens the quest screen; Submit evidence opens the evidence flow', () => {
    assert.match(home, /pathname: '\/quest\/\[id\]', params: \{ id: task\.id \}/);
    assert.match(home, /pathname: '\/quest\/verify', params: \{ questId: task\.id \}/);
    assert.match(home, /onPress=\{action\.route === 'verify' \? onEvidence : onOpen\}/);
  });

  test('Home never writes: no rpc, no insert/update/upsert, no local award', () => {
    assert.doesNotMatch(home, /supabase\./);
    assert.doesNotMatch(home, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
    assert.doesNotMatch(home, /points\s*[+-]=|setPoints|completed:\s*true/);
    assert.doesNotMatch(read('src/data/homeModel.ts'), /supabase|fetch\(|rpc/);
  });

  test('Home shows one section label per block and one primary button per state', () => {
    assert.match(home, /<SectionLabel>Next quest<\/SectionLabel>/);
    assert.match(home, /<SectionLabel style=\{styles\.sectionGap\}>Today's path<\/SectionLabel>/);
    // The card and the empty state each carry exactly one PrimaryButton.
    assert.equal((home.match(/<PrimaryButton/g) || []).length, 2);
    assert.match(home, /label="View all quests"/);
  });

  test('a queued submission is labelled honestly', () => {
    const model = read('src/data/homeModel.ts');
    assert.match(model, /label: 'Queued for review'/);
    assert.match(model, /label: 'Submitted'/);
    assert.match(model, /label: 'Not approved'/);
    assert.doesNotMatch(model, /label: 'Approved'/, 'the participant sees "Completed", never a claim about points being safe');
  });
});

describe('4. participant screens carry nothing admin-only', () => {
  const participant = ['(tabs)/index.tsx', '(tabs)/quests.tsx', '(tabs)/pet.tsx', '(tabs)/profile.tsx', '(tabs)/_layout.tsx'];

  test('no admin data, no admin tab, admin link only behind isAdmin', () => {
    for (const p of participant) {
      const src = app(p);
      assert.doesNotMatch(src, /@\/data\/admin|admin_reason|risk_flags|model_version|get_research_analytics/, `${p} touches admin data`);
    }
    assert.doesNotMatch(app('(tabs)/_layout.tsx'), /name="admin"/);
    const profile = app('(tabs)/profile.tsx');
    assert.match(profile, /\{isAdmin && \([\s\S]*?router\.push\('\/admin'\)/);
    assert.match(app('admin/_layout.tsx'), /if \(!isAdmin\) return <Redirect href="\/" \/>/);
  });

  test('Home links to profile, quests and the quest flow — nowhere else', () => {
    const home = app('(tabs)/index.tsx');
    const targets = [...home.matchAll(/router\.push\((?:\{ pathname: )?'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual([...new Set(targets)], ['/profile', '/quest/[id]', '/quest/create', '/quest/verify', '/quests']);
  });
});

describe('5. economy and verification state are never mutated locally', () => {
  test('across src/, the only writers are the known modules', () => {
    const allowed = new Set(['src/lib/evidence.ts', 'src/data/care.ts', 'src/data/admin.ts', 'src/data/tasks.ts', 'src/lib/questApi.ts', 'src/lib/verifyApi.ts', 'src/auth/AuthProvider.tsx', 'src/lib/supabase.ts']);
    const offenders: string[] = [];
    for (const f of walk(path.join(MOBILE, 'src'))) {
      const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
      if (allowed.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      if (/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|storage\.from/.test(src)) offenders.push(rel);
    }
    assert.deepEqual(offenders, []);
  });

  test('care still goes through care_pet only', () => {
    assert.match(read('src/data/care.ts'), /supabase\.rpc\('care_pet', \{ p_action: action \}\)/);
    assert.doesNotMatch(read('src/data/care.ts'), /\.from\(/);
    assert.match(app('(tabs)/pet.tsx'), /const r = await carePet\(action\)/);
  });

  test('no screen infers approval: "Completed"/"Approved" text is gated by server status', () => {
    for (const p of ['(tabs)/index.tsx', '(tabs)/quests.tsx']) {
      assert.doesNotMatch(app(p), /'Approved'|"Approved"/, `${p} hardcodes approval`);
    }
  });
});

describe('6. small-screen and accessibility guards for the new screens', () => {
  const screens = ['(tabs)/index.tsx', '(tabs)/quests.tsx', '(tabs)/pet.tsx', '(tabs)/profile.tsx'];

  test('no fixed width over 288pt, no minWidth, no horizontal ScrollView', () => {
    for (const s of screens.concat(['../components/ui.tsx'])) {
      const src = app(s);
      for (const m of src.matchAll(/\bwidth:\s*(\d+)\b/g)) assert.ok(Number(m[1]) <= 288, `${s}: width ${m[1]}`);
      assert.doesNotMatch(src, /\bminWidth:/, `${s} sets a minWidth`);
      assert.doesNotMatch(src, /horizontal(=\{true\})?\s/, `${s} scrolls sideways`);
    }
  });

  test('long titles wrap: every quest title has numberOfLines or an unconstrained lineHeight', () => {
    assert.match(app('(tabs)/index.tsx'), /<Text style=\{styles\.nextTitle\}>\{task\.text\}<\/Text>/);
    assert.match(app('(tabs)/index.tsx'), /nextTitle: \{[^}]*lineHeight/);
    assert.match(app('(tabs)/index.tsx'), /numberOfLines=\{2\}>\s*\{row\.task\.text\}/);
    assert.match(app('(tabs)/quests.tsx'), /numberOfLines=\{2\}>\s*\{task\.text\}/);
  });

  test('tap targets are at least 48pt where a participant acts', () => {
    const theme = read('src/theme.ts');
    assert.match(theme, /export const TapTarget = 48;/);
    const ui = read('src/components/ui.tsx');
    assert.match(ui, /primary: \{\s*minHeight: TapTarget/);
    assert.match(ui, /secondary: \{\s*minHeight: TapTarget/);
    assert.match(app('(tabs)/index.tsx'), /headerButton: \{ width: TapTarget, height: TapTarget/);
    assert.match(app('(tabs)/quests.tsx'), /addButton: \{ width: TapTarget, height: TapTarget/);
  });

  test('status is text + icon, never colour alone', () => {
    const ui = read('src/components/ui.tsx');
    assert.match(ui, /export function StatusPill/);
    assert.match(ui, /<Text style=\{\[styles\.pillText, \{ color: c\.fg \}\]\}/);
    assert.match(app('(tabs)/index.tsx'), /<Ionicons name=\{ICONS\[tone\]\}/);
    assert.match(app('(tabs)/index.tsx'), /accessibilityLabel=\{`\$\{row\.task\.text\}, \$\{row\.status\.label\}`\}/);
  });

  test('motion is gated on Reduce Motion and never delays a task', () => {
    const ui = read('src/components/ui.tsx');
    assert.match(ui, /useReducedMotion\(\)/);
    assert.match(ui, /if \(reduced \|\| !idle\)/);
    assert.match(ui, /Animated\.loop\(/);
    assert.doesNotMatch(ui, /setTimeout|delay:/);
  });

  test('loading uses skeletons, not the old spinner ring, on Home', () => {
    assert.match(app('(tabs)/index.tsx'), /<Skeleton/);
    assert.doesNotMatch(app('(tabs)/index.tsx'), /ActivityIndicator/);
  });

  test('the theme is the ivory / ink / teal direction and the tab bar uses it', () => {
    const theme = read('src/theme.ts');
    assert.match(theme, /background: palette\.ivory/);
    assert.match(theme, /ivory: '#FAF8F0'/);
    assert.match(theme, /ink: '#102A43'/);
    assert.match(theme, /teal: '#3F8580'/);
    assert.match(app('(tabs)/_layout.tsx'), /tabBarActiveTintColor: Colors\.primary/);
    assert.match(app('(tabs)/_layout.tsx'), /title: 'Progress'/);
    assert.match(app('_layout.tsx'), /<StatusBar style="dark" \/>/);
    assert.match(read('app.json'), /"userInterfaceStyle": "light"/);
  });

  test('no screen still uses a literal dark-theme colour', () => {
    for (const f of walk(APP).concat(walk(path.join(MOBILE, 'src', 'components')))) {
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /'#1a0d00'|'#fb7185'|'#06061a'|rgba\(245,163,26|rgba\(244,63,94|rgba\(124,58,237/, `${path.relative(MOBILE, f)} has a leftover dark-theme colour`);
    }
  });
});
