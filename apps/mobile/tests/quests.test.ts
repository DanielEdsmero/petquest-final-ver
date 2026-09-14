/*
 * Phase 4A/4B — quest constants, period caps, draft validation, evolution maths,
 * and the parity of the copied constants against the web originals.
 *
 * The parity block is the important one. The mobile app duplicates constants by
 * design (no workspace, no shared package), so the only thing stopping silent
 * drift is a test that reads the web files and compares.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIFFICULTIES,
  DIFFICULTY_COLORS,
  EVIDENCE_TYPES,
  VALIDITY_META,
  CHECK_STEPS,
  CHECK_EXPLAINER,
  HARD_PERIOD_MS,
  MEDIUM_PERIOD_MS,
  checkPeriodCap,
  evidenceMeta,
  formatDuration,
  isQuestEligible,
  validateQuestDraft,
  type Difficulty,
} from '../src/data/quests.ts';
import {
  LEGENDARY_MIN,
  STAGES,
  evolutionProgress,
  levelFromPoints,
  petIdOf,
  stageForLevel,
  stageName,
} from '../src/data/petModel.ts';
import { summariseTasks, type Task } from '../src/data/taskModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe('1. parity with the web app — copied constants must not drift', () => {
  test('difficulty colours match src/data/difficulty.js', () => {
    const web = readWeb('src/data/difficulty.js');
    for (const [key, value] of Object.entries(DIFFICULTY_COLORS)) {
      const m = new RegExp(`${key}:\\s*'([^']+)'`).exec(web);
      assert.ok(m, `web difficulty.js has no ${key}`);
      assert.equal(value, m![1], `${key} colour drifted from the web app`);
    }
  });

  test('evidence type ids match src/data/questValidity.js', () => {
    const web = readWeb('src/data/questValidity.js');
    const webIds = [...web.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*emoji:/g)].map((m) => m[1]);
    assert.deepEqual(
      EVIDENCE_TYPES.map((e) => e.id),
      webIds,
      'evidence types drifted from the web app',
    );
  });

  test('evidence type ids also match the server enum', () => {
    const server = readWeb('api/_lib/quest-validity.js');
    const m = /export const EVIDENCE_TYPES = \[([^\]]+)\]/.exec(server);
    assert.ok(m, 'server EVIDENCE_TYPES not found');
    const serverIds = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    assert.deepEqual(EVIDENCE_TYPES.map((e) => e.id), serverIds);
  });

  test('validity status labels match the web app', () => {
    const web = readWeb('src/data/questValidity.js');
    for (const [status, meta] of Object.entries(VALIDITY_META)) {
      const m = new RegExp(`${status}:\\s*\\{[^}]*label:\\s*'([^']+)'`).exec(web);
      assert.ok(m, `web questValidity.js has no ${status}`);
      assert.equal(meta.label, m![1], `${status} label drifted`);
    }
  });

  test('the check explainer is word-for-word the web copy', () => {
    const web = readWeb('src/data/questValidity.js');
    const m = /export const CHECK_EXPLAINER =\s*\n?\s*'([^']+)'/.exec(web);
    assert.ok(m, 'web CHECK_EXPLAINER not found');
    assert.equal(CHECK_EXPLAINER, m![1]);
  });

  test('the check steps match the web copy', () => {
    const web = readWeb('src/data/questValidity.js');
    const block = /export const CHECK_STEPS = \[([\s\S]*?)\]/.exec(web);
    assert.ok(block, 'web CHECK_STEPS not found');
    const webSteps = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(CHECK_STEPS, webSteps);
  });

  test('evolution thresholds match the web app AND the server CASE expression', () => {
    const web = readWeb('src/data/progression.js');
    for (const stage of STAGES) {
      assert.ok(
        new RegExp(`level: ${stage.level},[^}]*min: ${stage.minPts}\\b`).test(web),
        `level ${stage.level} min ${stage.minPts} drifted from the web app`,
      );
    }
    assert.ok(new RegExp(`level: 5,[^}]*min: ${LEGENDARY_MIN}\\b`).test(web));

    // supabase-phase6 owns the authoritative pet_level CASE.
    const sql = readWeb('supabase/supabase-phase6-research-metrics.sql');
    for (const threshold of [100, 500, 1500, LEGENDARY_MIN]) {
      assert.ok(
        sql.includes(`v_total >= ${threshold}`),
        `server CASE has no threshold ${threshold}`,
      );
    }
  });

  test('the eligibility rule matches the web app', () => {
    const web = readWeb('src/data/questValidity.js');
    assert.match(web, /validity_status === 'accepted' \|\| t\.validity_status === 'exempt'/);
    assert.equal(isQuestEligible(null), true, 'pre-Phase-12 rows stay eligible');
    assert.equal(isQuestEligible({ validity_status: null }), true);
    assert.equal(isQuestEligible({ validity_status: 'accepted' }), true);
    assert.equal(isQuestEligible({ validity_status: 'exempt' }), true);
    assert.equal(isQuestEligible({ validity_status: 'pending_ai_review' }), false);
    assert.equal(isQuestEligible({ validity_status: 'needs_clarification' }), false);
    assert.equal(isQuestEligible({ validity_status: 'rejected' }), false);
  });

  test('the copied files say they are copies and point at the map', () => {
    for (const f of ['src/data/petModel.ts', 'src/data/quests.ts']) {
      const src = readMobile(f);
      assert.match(src, /COPIED ON PURPOSE/, `${f} should record why it is duplicated`);
      assert.match(src, /MOBILE_MIGRATION_MAP\.md/);
    }
  });
});

describe('2. period caps', () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const quest = (difficulty: Difficulty, msAgo: number) => ({
    difficulty,
    created_at: at(msAgo),
  });

  test('easy quests are never capped', () => {
    const r = checkPeriodCap('easy', [quest('easy', 0), quest('easy', HOUR)], at(HOUR), now);
    assert.equal(r.allowed, true);
    assert.equal(r.message, null);
  });

  test('hard is one per week', () => {
    const anchor = at(2 * DAY);
    assert.equal(checkPeriodCap('hard', [], anchor, now).allowed, true);
    const full = checkPeriodCap('hard', [quest('hard', DAY)], anchor, now);
    assert.equal(full.allowed, false);
    assert.equal(full.used, 1);
    assert.equal(full.limit, 1);
    assert.match(full.message!, /Hard quest limit reached/);
    assert.match(full.message!, /Resets in/);
  });

  test('medium is three per three days', () => {
    const anchor = at(DAY);
    const two = [quest('medium', HOUR), quest('medium', 2 * HOUR)];
    assert.equal(checkPeriodCap('medium', two, anchor, now).allowed, true);
    const three = [...two, quest('medium', 3 * HOUR)];
    const full = checkPeriodCap('medium', three, anchor, now);
    assert.equal(full.allowed, false);
    assert.equal(full.used, 3);
  });

  test('quests created before the anchor do not count', () => {
    const anchor = at(DAY);
    // Created two days ago — i.e. in the previous period.
    const r = checkPeriodCap('hard', [quest('hard', 2 * DAY)], anchor, now);
    assert.equal(r.allowed, true);
    assert.equal(r.used, 0);
  });

  test('an elapsed period resets the count', () => {
    const anchor = at(8 * DAY); // older than the 7-day hard window
    const r = checkPeriodCap('hard', [quest('hard', 8 * DAY)], anchor, now);
    assert.equal(r.allowed, true);
    assert.equal(r.used, 0);
    assert.equal(r.resetsInMs, null);
  });

  test('a missing anchor is treated as a fresh period, not a block', () => {
    assert.equal(checkPeriodCap('hard', [quest('hard', HOUR)], null, now).allowed, true);
    assert.equal(checkPeriodCap('medium', [], undefined, now).allowed, true);
  });

  test('the windows match the web app', () => {
    const web = readWeb('src/context/GameContext.jsx');
    assert.match(web, /HARD_PERIOD_MS\s*=\s*7 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(web, /MEDIUM_PERIOD_MS\s*=\s*3 \* 24 \* 60 \* 60 \* 1000/);
    assert.equal(HARD_PERIOD_MS, 7 * DAY);
    assert.equal(MEDIUM_PERIOD_MS, 3 * DAY);
  });

  test('durations read sensibly', () => {
    assert.equal(formatDuration(0), 'a moment');
    assert.equal(formatDuration(-5), 'a moment');
    assert.equal(formatDuration(90_000), '1m');
    assert.equal(formatDuration(3 * HOUR + 20 * 60_000), '3h 20m');
    assert.equal(formatDuration(2 * DAY + 4 * HOUR), '2d 4h');
  });
});

describe('3. draft validation mirrors the current web form', () => {
  const base = {
    text: 'Finish calculus problem set 4',
    difficulty: 'easy' as Difficulty,
    evidenceType: 'screenshot' as const,
    plannedDate: null as Date | null,
  };
  const future = () => new Date(Date.now() + DAY);

  test('a valid easy quest needs no planned date', () => {
    assert.equal(validateQuestDraft(base), null);
  });

  test('title rules match the server', () => {
    assert.equal(validateQuestDraft({ ...base, text: 'ab' })?.field, 'text');
    assert.equal(validateQuestDraft({ ...base, text: 'x'.repeat(81) })?.field, 'text');
    assert.equal(validateQuestDraft({ ...base, text: '!!! ???' })?.field, 'text');
    // The server's limits, for comparison.
    const server = readWeb('api/_lib/quest-validity.js');
    assert.match(server, /title:\s*\{\s*min:\s*3,\s*max:\s*80\s*\}/);
  });

  test('medium and hard require a planned finish date', () => {
    for (const difficulty of ['medium', 'hard'] as Difficulty[]) {
      assert.equal(
        validateQuestDraft({ ...base, difficulty })?.field,
        'planned_completion_date',
        `${difficulty} should require a date`,
      );
      assert.equal(validateQuestDraft({ ...base, difficulty, plannedDate: future() }), null);
    }
  });

  test('a planned date in the past is rejected', () => {
    const past = new Date(Date.now() - 2 * HOUR);
    assert.equal(validateQuestDraft({ ...base, plannedDate: past })?.field, 'planned_completion_date');
  });

  test('an unknown evidence type is rejected', () => {
    const bad = { ...base, evidenceType: 'selfie' as never };
    assert.equal(validateQuestDraft(bad)?.field, 'evidence_type');
  });

  test('goal and priority are NOT required — matching the current web form', () => {
    // They were removed from the web form in commit fdf694d and are optional
    // server-side; requiring them on mobile would split the study's data.
    const webForm = readWeb('src/components/TaskList.jsx');
    assert.doesNotMatch(webForm, /setGoal|setPriority|PRIORITIES/);
    assert.equal(validateQuestDraft(base), null);
  });
});

describe('4. evolution display maths', () => {
  test('levels come from lifetime points', () => {
    assert.equal(levelFromPoints(0), 1);
    assert.equal(levelFromPoints(99), 1);
    assert.equal(levelFromPoints(100), 2);
    assert.equal(levelFromPoints(499), 2);
    assert.equal(levelFromPoints(500), 3);
    assert.equal(levelFromPoints(1499), 3);
    assert.equal(levelFromPoints(1500), 4);
    assert.equal(levelFromPoints(4999), 4);
    assert.equal(levelFromPoints(5000), 5);
    assert.equal(levelFromPoints(null), 1);
    assert.equal(levelFromPoints(-50), 1);
  });

  test('level 5 reuses the elder artwork — there are only four stages', () => {
    assert.equal(STAGES.length, 4);
    assert.equal(stageForLevel(5), 'elder');
    assert.equal(stageForLevel(4), 'elder');
    assert.equal(stageForLevel(99), 'elder');
    assert.equal(stageForLevel(0), 'baby');
    assert.equal(stageName(5), 'Legendary');
    assert.equal(stageName(1), 'Baby');
  });

  test('progress toward the next stage', () => {
    const p = evolutionProgress(300);
    assert.equal(p.level, 2);
    assert.equal(p.nextAt, 500);
    assert.equal(p.remaining, 200);
    assert.ok(p.fraction > 0.49 && p.fraction < 0.51);

    const maxed = evolutionProgress(9000);
    assert.equal(maxed.level, 5);
    assert.equal(maxed.nextAt, null);
    assert.equal(maxed.remaining, null);
    assert.equal(maxed.fraction, 1);
  });

  test('pet ids accept either the app id or the asset type', () => {
    assert.equal(petIdOf('dragon'), 'dragon');
    assert.equal(petIdOf('arcane_dragon'), 'dragon');
    assert.equal(petIdOf('mystic_cat'), 'cat');
    assert.equal(petIdOf('spirit_wolf'), 'wolf');
    // Unknown returns null so the UI can show "no companion" rather than
    // silently defaulting to a dragon the participant does not own.
    assert.equal(petIdOf('phoenix'), null);
    assert.equal(petIdOf(null), null);
    assert.equal(petIdOf(''), null);
  });

  test('every sprite file the map references exists', () => {
    const src = readMobile('src/data/petSprites.ts');
    const files = [...src.matchAll(/require\('@\/assets\/(pets\/[^']+)'\)/g)].map((m) => m[1]);
    assert.equal(files.length, 12, 'expected 12 evolution sprites');
    for (const f of files) {
      assert.ok(existsSync(path.join(MOBILE, 'assets', f)), `missing asset: ${f}`);
    }
  });
});

describe('5. task summary', () => {
  const task = (over: Partial<Task>): Task =>
    ({
      id: Math.random().toString(36).slice(2),
      user_id: 'u1',
      text: 'quest',
      difficulty: 'easy',
      completed: false,
      created_at: new Date().toISOString(),
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
    }) as Task;

  test('counts active, completed and the two attention states', () => {
    const s = summariseTasks([
      task({}),
      task({ completed: true }),
      task({ validity_status: 'pending_ai_review' }),
      task({ validity_status: 'needs_clarification' }),
      task({ validity_status: 'rejected' }),
    ]);
    assert.equal(s.total, 5);
    assert.equal(s.active, 4);
    assert.equal(s.completed, 1);
    assert.equal(s.awaitingCheck, 1);
    assert.equal(s.needsAttention, 2);
  });

  test('null is treated as an empty log, not a crash', () => {
    const s = summariseTasks(null);
    assert.equal(s.total, 0);
    assert.equal(s.active, 0);
  });
});

describe('6. the client never decides acceptance or awards points', () => {
  test('quest creation goes through the server endpoint', () => {
    const api = readMobile('src/lib/questApi.ts');
    assert.match(api, /\/api\/validate-quest/);
    assert.match(api, /Authorization: `Bearer \$\{session\.access_token\}`/);
  });

  test('no mobile file inserts into tasks or writes a validity status', () => {
    for (const f of ['src/data/tasks.ts', 'src/data/taskModel.ts', 'src/lib/questApi.ts', 'src/app/quest/create.tsx']) {
      const src = readMobile(f);
      assert.doesNotMatch(src, /\.insert\(/, `${f} must not insert quests directly`);
      assert.doesNotMatch(src, /validity_status:\s*'accepted'/, `${f} must not set a validity status`);
    }
  });

  test('no mobile file writes points, streaks or completion flags', () => {
    for (const f of ['src/data/tasks.ts', 'src/auth/AuthProvider.tsx']) {
      const src = readMobile(f);
      assert.doesNotMatch(src, /\.update\(\s*\{[^}]*points/, `${f} must not write points`);
      assert.doesNotMatch(src, /\.update\(\s*\{[^}]*current_streak/, `${f} must not write streaks`);
      assert.doesNotMatch(src, /\.update\(\s*\{[^}]*completed/, `${f} must not write completion`);
    }
  });

  test('admin-only validity columns are never requested', () => {
    // Check the select string itself, not the file: the surrounding comment
    // names these columns precisely to explain why they are excluded.
    const src = readMobile('src/data/tasks.ts');
    const m = /const TASK_COLUMNS =([\s\S]*?);/.exec(src);
    assert.ok(m, 'TASK_COLUMNS not found');
    const columns = m![1];
    for (const col of ['validity_admin_reason', 'validity_risk_flags', 'validity_model_version']) {
      assert.ok(!columns.includes(col), `${col} must not be selected by a participant screen`);
    }
    // …and the participant-safe ones still are.
    for (const col of ['validity_status', 'validity_reason']) {
      assert.ok(columns.includes(col), `${col} should be selected`);
    }
  });

  test('an unloaded figure renders as a dash, never a zero', () => {
    const src = readMobile('src/app/(tabs)/index.tsx');
    // "0 points" and "not loaded yet" mean very different things in a study.
    assert.match(src, /typeof n === 'number' \? n\.toLocaleString\(\) : '—'/);
  });
});

describe('7. pet tab (Phase 4F) — real sprite, real stage, no client-side points writes', () => {
  test('the pet tab renders the actual sprite for the stored level', () => {
    const src = readMobile('src/app/(tabs)/pet.tsx');
    assert.match(src, /spriteFor\(profile\?\.selected_pet_id, level\)/);
    assert.match(src, /const level = profile\?\.pet_level \?\? progress\.level/);
  });

  test('care actions are absent: no client may debit points', () => {
    // The web writes profiles.points from the browser for feed/wash/play — a
    // documented hole. Mobile must not reproduce it.
    for (const f of ['src/app/(tabs)/pet.tsx', 'src/data/petStats.ts']) {
      const src = readMobile(f);
      assert.doesNotMatch(src, /\.from\('profiles'\)\.update/, `${f} writes the profile`);
      assert.doesNotMatch(src, /\.from\('pet_stats'\)\.(update|upsert|insert)/, `${f} writes pet_stats`);
      assert.doesNotMatch(src, /points\s*-\s*\d+|points:\s*next/, `${f} debits points locally`);
    }
    assert.match(readMobile('src/data/petStats.ts'), /READ-ONLY on mobile, deliberately/);
  });

  test('the web hole this avoids is the one the schema documents', () => {
    const schema = readWeb('supabase/supabase-schema.sql');
    assert.match(schema, /profiles\.points is deliberately still client-writable/);
    assert.match(schema, /spend_points\(\) RPC/);
  });

  test('a missing stats row is "no stats", not an error', () => {
    assert.match(readMobile('src/data/petStats.ts'), /\.maybeSingle\(\)/);
  });

  test('unloaded values render as a dash, never a fake zero', () => {
    const src = readMobile('src/app/(tabs)/pet.tsx');
    assert.match(src, /value == null \? '—' : `\$\{pct\}%`/);
    assert.match(src, /typeof n === 'number' \? n\.toLocaleString\(\) : '—'/);
  });
});
