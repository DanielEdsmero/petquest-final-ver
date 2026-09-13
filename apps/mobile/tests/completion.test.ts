/*
 * Phase 4C — the verification pipeline as a participant sees it, plus the
 * completion cooldown.
 *
 * The stage machine is worth testing carefully: it is the only place the app
 * explains whether points are safe, and getting it wrong would either alarm a
 * participant whose quest is fine or reassure one whose award is about to be
 * reversed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pointsAreProvisional,
  verificationStages,
  verificationSummary,
  type Completion,
} from '../src/data/completionModel.ts';
import {
  DIFF_MIN_COMPLETE_MS,
  DIFF_POINTS,
  cooldownRemainingMs,
} from '../src/data/quests.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

const completion = (over: Partial<Completion> = {}): Completion => ({
  id: 'c1',
  quest_id: 'q1',
  status: 'pending',
  ai_verdict: 'pending',
  ai_reason: null,
  ai_confidence: null,
  admin_verdict: 'pending',
  points_earned: 10,
  progress_log: 'Did the thing, here is the evidence.',
  created_at: new Date().toISOString(),
  ai_verdict_at: null,
  admin_reviewed_at: null,
  source: 'camera',
  ...over,
});

const stageBy = (c: Completion, key: string) =>
  verificationStages(c).find((s) => s.key === key)!;

describe('1. the stage machine', () => {
  test('a quest with no submission has no stages', () => {
    assert.deepEqual(verificationStages(null), []);
    assert.equal(verificationSummary(null).label, 'Not submitted');
  });

  test('just submitted: AI is running, the outcome is unknown', () => {
    const c = completion();
    assert.equal(stageBy(c, 'submitted').state, 'done');
    assert.equal(stageBy(c, 'ai_check').state, 'active');
    assert.equal(stageBy(c, 'admin_review').state, 'pending');
    assert.equal(stageBy(c, 'outcome').state, 'pending');
    assert.equal(verificationSummary(c).label, 'Checking…');
  });

  test('AI passed: admin confirmation is still outstanding', () => {
    const c = completion({ ai_verdict: 'pass', ai_reason: 'The photo shows the finished work.' });
    assert.equal(stageBy(c, 'ai_check').state, 'done');
    assert.equal(stageBy(c, 'outcome').state, 'pending');
    assert.equal(verificationSummary(c).label, 'Awaiting confirmation');
    // The participant must not be told the points are safe yet.
    assert.equal(pointsAreProvisional(c), true);
    assert.match(stageBy(c, 'outcome').detail!, /provisional/i);
  });

  test('AI failed: the stage is a failure and the award is reversed', () => {
    // api/verify.js calls rollback_completion on a fail, so status becomes
    // 'reverted' — but the stage must read as failed even before that lands.
    const midway = completion({ ai_verdict: 'fail' });
    assert.equal(stageBy(midway, 'ai_check').state, 'failed');

    const settled = completion({ ai_verdict: 'fail', status: 'reverted' });
    assert.equal(stageBy(settled, 'outcome').state, 'failed');
    assert.equal(verificationSummary(settled).label, 'Not approved');
    assert.equal(verificationSummary(settled).tone, 'bad');
    assert.match(stageBy(settled, 'outcome').detail!, /reversed/i);
  });

  test('an AI error is not a failure — it routes to a human', () => {
    const c = completion({ ai_verdict: 'error', ai_reason: 'AI service busy — queued for manual review.' });
    assert.notEqual(stageBy(c, 'ai_check').state, 'failed');
    assert.equal(stageBy(c, 'admin_review').state, 'active');
    assert.equal(verificationSummary(c).label, 'Awaiting admin review');
    assert.match(stageBy(c, 'ai_check').detail!, /admin/i);
  });

  test('admin approved: everything is done and the points are confirmed', () => {
    const c = completion({ ai_verdict: 'pass', admin_verdict: 'approved', status: 'verified' });
    assert.equal(stageBy(c, 'admin_review').state, 'done');
    assert.equal(stageBy(c, 'outcome').state, 'done');
    assert.equal(verificationSummary(c).label, 'Approved');
    assert.equal(verificationSummary(c).tone, 'good');
    assert.equal(pointsAreProvisional(c), false);
    assert.match(stageBy(c, 'outcome').detail!, /confirmed/i);
  });

  test('admin rejected after an AI pass', () => {
    const c = completion({ ai_verdict: 'pass', admin_verdict: 'rejected', status: 'reverted' });
    assert.equal(stageBy(c, 'admin_review').state, 'failed');
    assert.equal(stageBy(c, 'outcome').state, 'failed');
    assert.equal(pointsAreProvisional(c), false);
  });

  test('flagged suspicious still reads as awaiting a human', () => {
    const c = completion({ ai_verdict: 'pass', admin_verdict: 'suspicious' });
    assert.equal(stageBy(c, 'admin_review').state, 'active');
  });

  test('there are always four stages, in order', () => {
    for (const c of [
      completion(),
      completion({ ai_verdict: 'pass' }),
      completion({ ai_verdict: 'fail', status: 'reverted' }),
      completion({ ai_verdict: 'pass', admin_verdict: 'approved', status: 'verified' }),
    ]) {
      assert.deepEqual(
        verificationStages(c).map((s) => s.key),
        ['submitted', 'ai_check', 'admin_review', 'outcome'],
      );
    }
  });

  test('the stage labels match the flow the brief describes', () => {
    const labels = verificationStages(completion()).map((s) => s.label);
    assert.deepEqual(labels.slice(0, 3), ['Submitted', 'AI check', 'Admin review']);
  });
});

describe('2. nothing internal leaks to the participant', () => {
  test('admin_reason is never selected', () => {
    const src = readMobile('src/data/completions.ts');
    const m = /const COMPLETION_COLUMNS =([\s\S]*?);/.exec(src);
    assert.ok(m, 'COMPLETION_COLUMNS not found');
    assert.ok(!m![1].includes('admin_reason'), 'admin_reason must not be read by a participant screen');
    // ai_reason is written in deliberately friendly language by api/verify.js.
    assert.ok(m![1].includes('ai_reason'));
  });

  test('the reason shown is the server-written participant-safe one', () => {
    const verify = readWeb('api/verify.js');
    // Proof that ai_reason is intended to be shown: the server never puts a
    // model name or HTTP code in it.
    assert.match(verify, /AI service busy — queued for manual review/);
    assert.match(verify, /NEVER surfaced to the queue UI/);
  });

  test('the detail screen has no write path to points or verdicts', () => {
    const src = readMobile('src/app/quest/[id].tsx');
    assert.doesNotMatch(src, /\.update\(/);
    assert.doesNotMatch(src, /\.insert\(/);
    assert.doesNotMatch(src, /ai_verdict:/);
    assert.doesNotMatch(src, /points_earned:/);
  });

  test('the completions table is client-read-only by migration', () => {
    const sql = readWeb('supabase/supabase-phase7-verification.sql');
    assert.match(sql, /revoke insert, update, delete on quest_completions\s+from authenticated, anon;/);
  });
});

describe('3. completion cooldown', () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);

  test('a quest that has never been completed has no cooldown', () => {
    assert.equal(cooldownRemainingMs({ difficulty: 'hard', completed_at: null }, now), 0);
  });

  test('the window is measured from the last completion, per difficulty', () => {
    for (const [difficulty, window] of Object.entries(DIFF_MIN_COMPLETE_MS)) {
      const justDone = new Date(now - 1000).toISOString();
      const remaining = cooldownRemainingMs({ difficulty, completed_at: justDone }, now);
      assert.ok(remaining > window - 2000 && remaining <= window, `${difficulty} window wrong`);
    }
  });

  test('an elapsed cooldown is zero, never negative', () => {
    const longAgo = new Date(now - 10 * 24 * 3600_000).toISOString();
    assert.equal(cooldownRemainingMs({ difficulty: 'hard', completed_at: longAgo }, now), 0);
  });

  test('an unknown difficulty falls back to the easy window', () => {
    const justDone = new Date(now - 1000).toISOString();
    const r = cooldownRemainingMs({ difficulty: 'boss', completed_at: justDone }, now);
    assert.ok(r > 0 && r <= DIFF_MIN_COMPLETE_MS.easy);
  });

  test('points and windows match the web app', () => {
    const web = readWeb('src/context/GameContext.jsx');
    assert.match(web, /DIFF_POINTS = \{ easy: 10, medium: 25, hard: 50 \}/);
    assert.match(web, /DIFF_MIN_COMPLETE_MS = \{ easy: 300000, medium: 1800000, hard: 7200000 \}/);
    assert.deepEqual(DIFF_POINTS, { easy: 10, medium: 25, hard: 50 });
    assert.deepEqual(DIFF_MIN_COMPLETE_MS, { easy: 300_000, medium: 1_800_000, hard: 7_200_000 });
  });

  test('the award amounts match the server, which is what actually pays out', () => {
    const sql = readWeb('supabase/supabase-phase10-cooldown-anchoring.sql');
    assert.match(sql, /when 'hard'\s+then 50/);
    assert.match(sql, /when 'medium' then 25/);
    assert.match(sql, /else 10/);
  });

  test('the cooldown is documented as presentation, not an enforced rule', () => {
    // supabase-phase10 removed the server-side time gate; claiming otherwise
    // would be telling a participant something untrue.
    const src = readMobile('src/data/quests.ts');
    assert.match(src, /presentation only/i);
    assert.match(readWeb('supabase/supabase-phase10-cooldown-anchoring.sql'), /time gate is intentionally\s+--\s+removed/);
  });
});

describe('4. completion requires evidence, so 4C cannot complete a quest alone', () => {
  test('submit_completion demands a photo path and a progress log', () => {
    const sql = readWeb('supabase/supabase-phase8-verification-fixes.sql');
    assert.match(sql, /p_photo_path\s+text/);
    assert.match(sql, /length\(trim\(p_log\)\) < 20/);
  });

  test('complete_task is revoked from clients, so there is no shortcut', () => {
    const sql = readWeb('supabase/supabase-phase8-verification-fixes.sql');
    assert.match(sql, /revoke execute on function complete_task\(uuid\) from authenticated, anon;/);
  });

  test('the mobile app calls neither RPC yet', () => {
    const src = readMobile('src/app/quest/[id].tsx');
    assert.doesNotMatch(src, /submit_completion/);
    assert.doesNotMatch(src, /complete_task/);
  });
});
