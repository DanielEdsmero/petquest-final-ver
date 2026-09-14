/*
 * Phase 4D/4E — evidence rules, the submission state machine, and the
 * outcome mapping.
 *
 * The one rule that matters most is in block 3: a verify reply of 'error' or
 * a network failure is NOT a rejection. The submission already exists
 * server-side and the provisional award stands; telling a participant their
 * evidence was refused would be false.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPRESS,
  MIN_LOG_CHARS,
  MIN_PROOF_BYTES,
  SUBMIT_STEPS,
  outcomeFromVerdict,
  proofPath,
  submitErrorMessage,
  submitProgress,
  validateEvidence,
} from '../src/data/evidenceModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

const good = { uri: 'file:///tmp/a.jpg', bytes: 250_000, source: 'camera' as const, log: 'Finished all twelve problems and checked them.' };

describe('1. evidence rules mirror the server', () => {
  test('a photo is required', () => {
    assert.equal(validateEvidence({ ...good, uri: null })?.field, 'photo');
  });

  test('a tiny/blank photo is refused before upload, at the server threshold', () => {
    assert.equal(validateEvidence({ ...good, bytes: MIN_PROOF_BYTES - 1 })?.field, 'photo');
    assert.equal(validateEvidence({ ...good, bytes: MIN_PROOF_BYTES }), null);
  });

  test('an unknown size is allowed through — the server still checks', () => {
    assert.equal(validateEvidence({ ...good, bytes: null }), null);
  });

  test('the log needs 20 characters after trimming, like submit_completion', () => {
    assert.equal(validateEvidence({ ...good, log: 'too short' })?.field, 'log');
    assert.equal(validateEvidence({ ...good, log: '   ' + 'x'.repeat(19) + '   ' })?.field, 'log');
    assert.equal(validateEvidence({ ...good, log: 'x'.repeat(20) }), null);
    assert.match(validateEvidence({ ...good, log: 'short' })!.message, /5\/20/);
  });

  test('the thresholds are the server thresholds', () => {
    const sql = readWeb('supabase/supabase-phase8-verification-fixes.sql');
    assert.match(sql, new RegExp(`length\\(trim\\(p_log\\)\\) < ${MIN_LOG_CHARS}`));
    const verify = readWeb('api/_lib/verify.js');
    assert.match(verify, new RegExp(`MIN_PROOF_BYTES = ${MIN_PROOF_BYTES}`));
  });

  test('the storage path puts the file under the caller uid, as the bucket policy requires', () => {
    const p = proofPath('user-abc', 'quest-xyz', 1700000000000);
    assert.equal(p, 'user-abc/quest-xyz-1700000000000.jpg');
    assert.ok(p.startsWith('user-abc/'), 'first segment must be the uid');
    const policy = readWeb('supabase/supabase-phase7-verification.sql');
    assert.match(policy, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });

  test('the path convention matches the web client', () => {
    const web = readWeb('src/components/VerificationModal.jsx');
    assert.match(web, /`\$\{profile\.id\}\/\$\{task\.id\}-\$\{Date\.now\(\)\}\.\$\{ext\}`/);
  });

  test('compression keeps handwriting legible', () => {
    assert.ok(COMPRESS.longEdge >= 1200, 'too small to read a page of work');
    assert.ok(COMPRESS.quality >= 0.7);
  });
});

describe('2. RPC error codes read the same as on the web', () => {
  test('each known code has a participant message', () => {
    for (const code of ['locked', 'too_soon', 'log_too_short', 'invalid', 'unauthenticated']) {
      const m = submitErrorMessage(code);
      assert.ok(m.length > 10, `${code} has no message`);
      assert.ok(!m.includes(`(${code})`), `${code} leaked as a raw code`);
    }
  });

  test('the wording matches the web client for the codes it handles', () => {
    const web = readWeb('src/context/GameContext.jsx');
    assert.ok(web.includes(submitErrorMessage('locked')));
    assert.ok(web.includes(submitErrorMessage('too_soon')));
    assert.ok(web.includes(submitErrorMessage('log_too_short')));
  });

  test('an unknown code still produces something useful', () => {
    assert.match(submitErrorMessage('weird_thing'), /try again/i);
    assert.match(submitErrorMessage(null), /try again/i);
  });
});

describe('3. the outcome mapping — error is NOT rejection', () => {
  test('pass carries the awarded points', () => {
    const o = outcomeFromVerdict({ ok: true, verdict: 'pass', reason: 'Looks done.' }, 25);
    assert.equal(o.kind, 'pass');
    if (o.kind === 'pass') assert.equal(o.points, 25);
  });

  test('fail is a rejection', () => {
    assert.equal(outcomeFromVerdict({ ok: true, verdict: 'fail', reason: 'No.' }, 10).kind, 'fail');
  });

  test("an 'error' verdict is queued for review, never 'fail'", () => {
    const o = outcomeFromVerdict({ ok: true, verdict: 'error', reason: 'AI service busy — queued for manual review.' }, 10);
    assert.equal(o.kind, 'review');
  });

  test('a failed request (network, 429, timeout) is also review — the submission already exists', () => {
    assert.equal(outcomeFromVerdict({ ok: false, reason: 'Cannot reach the check right now.' }, 10).kind, 'review');
  });

  test('the screen explains review as provisional, not refused', () => {
    const src = readMobile('src/app/quest/verify.tsx');
    assert.match(src, /queued for review/i);
    assert.match(src, /provisional until a study admin confirms/i);
  });
});

describe('4. live progress is driven by real events', () => {
  test('three steps, in order', () => {
    assert.deepEqual(SUBMIT_STEPS.map((s) => s.key), ['uploading', 'submitting', 'checking']);
  });

  test('progress is monotonic through the flow', () => {
    const seq = ['idle', 'uploading', 'submitting', 'checking', 'done'] as const;
    let last = -1;
    for (const s of seq) {
      const p = submitProgress(s);
      assert.ok(p >= last, `${s} went backwards`);
      last = p;
    }
    assert.equal(submitProgress('done'), 1);
    assert.equal(submitProgress('failed'), 1);
  });

  test('no step is advanced by a timer', () => {
    const src = readMobile('src/app/quest/verify.tsx');
    // Each setStep must be immediately preceded by, or gated on, an await.
    assert.doesNotMatch(src, /setTimeout\([^)]*setStep/);
    assert.match(src, /setStep\('uploading'\);\s*\n\s*const up = await uploadEvidence/);
    assert.match(src, /setStep\('submitting'\);\s*\n\s*const sub = await submitCompletion/);
  });
});

describe('5. server authority holds through the whole flow', () => {
  test('completion goes through submit_completion only', () => {
    const src = readMobile('src/lib/evidence.ts');
    assert.match(src, /supabase\.rpc\('submit_completion'/);
    assert.doesNotMatch(src, /rpc\('complete_task'/, 'must never call the revoked RPC directly');
  });

  test('the RPC is called with the six phase-8 arguments', () => {
    const src = readMobile('src/lib/evidence.ts');
    for (const arg of ['p_task_id', 'p_photo_path', 'p_log', 'p_time_started', 'p_verification_started_at', 'p_source']) {
      assert.match(src, new RegExp(arg), `missing ${arg}`);
    }
  });

  test('no file writes points, completion flags or verdicts', () => {
    for (const f of ['src/lib/evidence.ts', 'src/app/quest/verify.tsx']) {
      const src = readMobile(f);
      assert.doesNotMatch(src, /\.from\('tasks'\)\.update/, `${f} writes tasks`);
      assert.doesNotMatch(src, /\.from\('quest_completions'\)/, `${f} touches completions directly`);
      assert.doesNotMatch(src, /\.from\('profiles'\)\.update/, `${f} writes the profile`);
      assert.doesNotMatch(src, /points\s*\+=|setPoints/, `${f} totals points locally`);
    }
  });

  test('the verdict is requested even if the participant leaves the screen', () => {
    // The web client's QA bug: bailing early orphaned rows at 'pending'.
    const src = readMobile('src/app/quest/verify.tsx');
    const from = src.indexOf("setStep('submitting')");
    const to = src.indexOf('requestVerification(');
    const between = src.slice(from, to);
    assert.doesNotMatch(between, /if \(!alive\.current\) return/, 'must not bail between submit and verify');
  });

  test('the verification request carries the bearer token', () => {
    assert.match(readMobile('src/lib/verifyApi.ts'), /Authorization: `Bearer \$\{session\.access_token\}`/);
  });

  test('the upload targets the private bucket and never marks it public', () => {
    const src = readMobile('src/lib/evidence.ts');
    assert.match(src, /\.from\('quest-proofs'\)/);
    assert.match(src, /upsert: false/);
    assert.doesNotMatch(src, /getPublicUrl/);
  });

  test('upload uses an ArrayBuffer, not a RN Blob', () => {
    // RN Blobs can reach Supabase as zero bytes; ArrayBuffer is the reliable body.
    const src = readMobile('src/lib/evidence.ts');
    assert.match(src, /res\.arrayBuffer\(\)/);
    assert.doesNotMatch(src, /\.blob\(\)/);
  });

  test('the profile is refreshed after submission, not patched locally', () => {
    assert.match(readMobile('src/app/quest/verify.tsx'), /void refreshProfile\(\)/);
  });
});

describe('6. permissions and privacy', () => {
  test('the iOS permission strings say why', () => {
    const app = JSON.parse(readMobile('app.json'));
    const picker = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-image-picker');
    assert.ok(picker, 'expo-image-picker plugin missing');
    assert.match(picker[1].cameraPermission, /evidence/i);
    assert.match(picker[1].photosPermission, /evidence/i);
  });

  test('EXIF is stripped from picked images', () => {
    assert.match(readMobile('src/lib/evidence.ts'), /exif: false/);
  });

  test('a chosen photo is recorded as an upload for the reviewer', () => {
    const src = readMobile('src/lib/evidence.ts');
    assert.match(src, /p_source: args\.source/);
    assert.match(readMobile('src/app/quest/verify.tsx'), /flagged as an upload/i);
  });
});
