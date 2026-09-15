/*
 * Phase 7 — admin queues and the research view.
 *
 * Block 1 tests the pure queue logic. Blocks 2–4 are the ones that matter for
 * the study: admin data is separated from the participant UI, every action is
 * server-side, and the protection is RLS + RPC checks in the database — not
 * the route guard.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UNRESOLVED_VALIDITY,
  activeTimeMs,
  countValidity,
  countVerification,
  filterValidity,
  filterVerification,
  formatActive,
  isStuck,
  researchRows,
  summariseRerun,
  validityActions,
  type VerificationQueueRow,
} from '../src/data/adminModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const completion = (over: Partial<VerificationQueueRow> = {}): VerificationQueueRow => ({
  id: 'c1', user_id: 'u1', quest_id: 'q1', proof_photo_url: 'u1/q1.jpg', progress_log: 'did it',
  difficulty: 'easy', points_earned: 10, ai_verdict: 'pending', ai_confidence: null, ai_reason: null,
  admin_verdict: 'pending', admin_reason: null, status: 'pending', source: 'camera',
  created_at: '2026-01-01T10:00:00Z', verification_started_at: null, ai_verdict_at: null,
  admin_reviewed_at: null, tasks: { text: 'q', planned_completion_date: null }, profiles: { username: 'a', selected_pet_id: null },
  ...over,
});

describe('1. queue logic matches the web admin', () => {
  test('the unresolved validity statuses are the web set', () => {
    assert.match(readWeb('src/pages/AdminPage.jsx'), /const UNRESOLVED = \['pending_ai_review', 'needs_clarification', 'rejected'\]/);
    assert.deepEqual([...UNRESOLVED_VALIDITY], ['pending_ai_review', 'needs_clarification', 'rejected']);
  });

  test('validity filters and counts', () => {
    const rows = [
      { validity_status: 'pending_ai_review' },
      { validity_status: 'pending_ai_review' },
      { validity_status: 'needs_clarification' },
      { validity_status: 'rejected' },
    ];
    assert.deepEqual(countValidity(rows), { pending_ai_review: 2, needs_clarification: 1, rejected: 1, all: 4 });
    assert.equal(filterValidity(rows, 'rejected').length, 1);
    assert.equal(filterValidity(rows, 'all').length, 4);
  });

  test('a rejected quest cannot be rejected again, like the web', () => {
    assert.equal(validityActions('rejected').reject, false);
    assert.equal(validityActions('pending_ai_review').reject, true);
    assert.equal(validityActions('rejected').accept, true, 'an admin may still accept a rejected quest');
  });

  test('"stuck" means the verdict never landed — the web definition', () => {
    assert.match(readWeb('src/pages/AdminPage.jsx'), /!r\.ai_verdict \|\| r\.ai_verdict === 'pending' \|\| r\.ai_verdict === 'error'/);
    assert.equal(isStuck({ ai_verdict: null }), true);
    assert.equal(isStuck({ ai_verdict: 'pending' }), true);
    assert.equal(isStuck({ ai_verdict: 'error' }), true);
    assert.equal(isStuck({ ai_verdict: 'pass' }), false);
    assert.equal(isStuck({ ai_verdict: 'fail' }), false);
  });

  test('verification filters: pending is by status, pass/fail by AI verdict', () => {
    const rows = [
      completion({ id: 'a', status: 'pending', ai_verdict: 'pass' }),
      completion({ id: 'b', status: 'verified', ai_verdict: 'pass' }),
      completion({ id: 'c', status: 'reverted', ai_verdict: 'fail' }),
      completion({ id: 'd', status: 'pending', ai_verdict: 'error' }),
    ];
    assert.deepEqual(countVerification(rows), { all: 4, pending: 2, pass: 2, fail: 1 });
    assert.deepEqual(filterVerification(rows, 'pending').map((r) => r.id), ['a', 'd']);
    assert.deepEqual(filterVerification(rows, 'fail').map((r) => r.id), ['c']);
  });

  test('active time is verify-opened → submitted, never quest age', () => {
    // The web once showed quest age here and produced values like "34523m".
    const r = completion({ created_at: '2026-01-01T10:05:00Z', verification_started_at: '2026-01-01T10:00:00Z' });
    assert.equal(activeTimeMs(r), 5 * 60_000);
    assert.equal(activeTimeMs(completion({ verification_started_at: null })), null);
    assert.equal(formatActive(null), '—');
    assert.equal(formatActive(45_000), '45s');
    assert.equal(formatActive(5 * 60_000 + 7_000), '5m 7s');
  });

  test('the batch summary reads like the web toast', () => {
    assert.equal(summariseRerun(2, 1), '3 entries re-checked: 2 re-verdicted, 1 queued for manual review.');
    assert.equal(summariseRerun(1, 0), '1 entry re-checked: 1 re-verdicted, 0 queued for manual review.');
  });

  test('research rows are aggregates, with dashes for empty denominators', () => {
    assert.deepEqual(researchRows(null), []);
    assert.deepEqual(researchRows({ ok: false }), []);
    const rows = researchRows({
      ok: true,
      total_completed: 10, procrastinated_count: 3, procrastination_rate: 30,
      planned_completed: 0, on_time_count: 0, planning_accuracy: null,
      duration_by_difficulty: { easy: { avg_duration_minutes: 12.4, completed_count: 8 } },
    });
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    assert.equal(by['Completed quests'].value, '10');
    assert.equal(by['Procrastination rate'].value, '30%');
    assert.equal(by['Planning accuracy'].value, '—');
    assert.match(by['Planning accuracy'].hint!, /No completed quests carried a planned date/);
    assert.equal(by['Avg. easy duration'].value, '12 min');
    // Nothing per-person can appear: the RPC returns aggregates only.
    for (const r of rows) assert.doesNotMatch(r.label + r.value + (r.hint ?? ''), /username|user_id|email/i);
  });
});

describe('2. admin records are not mixed into the participant UI', () => {
  test('the admin data module is imported only from app/admin', () => {
    const offenders: string[] = [];
    for (const f of walk(path.join(MOBILE, 'src'))) {
      const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
      if (rel.startsWith('src/app/admin/') || rel === 'src/data/admin.ts' || rel === 'src/data/adminModel.ts') continue;
      const src = readFileSync(f, 'utf8');
      if (/from '@\/data\/admin'|from '\.\/admin(\.ts)?'/.test(src)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], 'participant screens must not import admin queries');
  });

  test('admin_reason is read ONLY by the admin data module', () => {
    const readers: string[] = [];
    for (const f of walk(path.join(MOBILE, 'src'))) {
      const rel = path.relative(MOBILE, f).replace(/\\/g, '/');
      const src = readFileSync(f, 'utf8');
      // A select string that requests the column.
      if (/select\([^)]*admin_reason/s.test(src)) readers.push(rel);
    }
    assert.deepEqual(readers, ['src/data/admin.ts']);
  });

  test('the participant completion reader still excludes admin_reason', () => {
    const m = /const COMPLETION_COLUMNS =([\s\S]*?);/.exec(readMobile('src/data/completions.ts'));
    assert.ok(!m![1].includes('admin_reason'));
  });

  test('admin is reachable only via the role-gated group', () => {
    assert.match(readMobile('src/app/admin/_layout.tsx'), /if \(!isAdmin\) return <Redirect href="\/" \/>/);
    assert.doesNotMatch(readMobile('src/app/(tabs)/_layout.tsx'), /name="admin"/);
    // Every admin screen is registered in the gated Stack.
    const layout = readMobile('src/app/admin/_layout.tsx');
    for (const s of ['index', 'validity', 'verification', 'research']) {
      assert.match(layout, new RegExp(`name="${s}"`), `${s} not in the admin stack`);
    }
  });
});

describe('3. every admin action is server-side', () => {
  const admin = readMobile('src/data/admin.ts');

  test('validity is resolved by the SECURITY DEFINER RPC, never a direct update', () => {
    assert.match(admin, /supabase\.rpc\('admin_resolve_quest_validity'/);
    assert.doesNotMatch(admin, /\.from\('tasks'\)\.update/);
    assert.doesNotMatch(admin, /validity_status:\s*'/);
  });

  test('completions are reviewed by the RPC; rollback happens inside it', () => {
    assert.match(admin, /supabase\.rpc\('admin_review_completion'/);
    assert.doesNotMatch(admin, /\.from\('quest_completions'\)\.update/);
    assert.doesNotMatch(admin, /rpc\('rollback_completion'/, 'the client must not call rollback itself');
    assert.match(readWeb('supabase/supabase-phase8-verification-fixes.sql'), /perform rollback_completion\(p_completion_id, 'admin_rejected'\)/);
  });

  test('AI re-runs go through the authenticated endpoints', () => {
    assert.match(admin, /Authorization: `Bearer \$\{session\.access_token\}`/);
    assert.match(admin, /\/api\/validate-quest/);
    assert.match(admin, /requestVerification\(completionId\)/);
  });

  test('proof photos are signed short-lived, never made public', () => {
    assert.match(admin, /createSignedUrl\(path, 300\)/);
    assert.doesNotMatch(admin, /getPublicUrl/);
  });

  test('research comes from the admin-gated RPC only', () => {
    assert.match(admin, /supabase\.rpc\('get_research_analytics'\)/);
    assert.match(readWeb('supabase/supabase-phase6-research-metrics.sql'), /create or replace function get_research_analytics\(\)[\s\S]*?if not is_admin\(\) then/);
  });

  test('no admin file writes points', () => {
    for (const f of ['src/data/admin.ts', 'src/app/admin/validity.tsx', 'src/app/admin/verification.tsx', 'src/app/admin/research.tsx']) {
      assert.doesNotMatch(readMobile(f), /\.from\('profiles'\)\.update|points\s*[+-]=/, `${f} touches points`);
    }
  });
});

describe('4. the database is the control, not the screen', () => {
  test('every table the admin module reads is admin-gated by RLS', () => {
    const schema = readWeb('supabase/supabase-schema.sql');
    const p7 = readWeb('supabase/supabase-phase7-verification.sql');
    const p12 = readWeb('supabase/supabase-phase12-quest-validity.sql');
    assert.match(schema, /create policy "tasks: admin read"[\s\S]*?using \( is_admin\(\) \)/);
    assert.match(p7, /"qc: admin read" on quest_completions for select using \( is_admin\(\) \)/);
    assert.match(p12, /"qvr: admin read" on public\.quest_validity_reviews for select using \( is_admin\(\) \)/);
  });

  test('a participant cannot alter validity fields even with a raw client', () => {
    const p12 = readWeb('supabase/supabase-phase12-quest-validity.sql');
    assert.match(p12, /create or replace function public\.tasks_validity_guard\(\)/);
    assert.match(p12, /tgname = 'tasks_validity_guard'/);
  });

  test('the review RPCs check the role themselves', () => {
    const p7 = readWeb('supabase/supabase-phase7-verification.sql');
    assert.match(p7, /function admin_review_completion\([\s\S]*?if not is_admin\(\) then/);
    const p12 = readWeb('supabase/supabase-phase12-quest-validity.sql');
    assert.match(p12, /function public\.admin_resolve_quest_validity\([\s\S]*?is_admin\(\)/);
  });

  test('the admin module says so, in its own words', () => {
    assert.match(readMobile('src/data/admin.ts'), /The route guard in\s+\* app\/admin\/_layout\.tsx is UX; the database is the control/);
  });
});
