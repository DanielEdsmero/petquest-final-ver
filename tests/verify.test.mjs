/*
 * Phase 13 / mobile Phase 5 — POST /api/verify, hardened.
 *
 * This endpoint had no authentication at all: it accepted `{ completion_id }`
 * from anyone. Because a `fail` verdict calls rollback_completion(), that meant
 * any caller who learned a completion id could reverse another participant's
 * points. These tests pin the fix and, just as importantly, pin the failure
 * posture that must NOT change: an AI outage never auto-approves and never
 * auto-rejects.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createVerifyHandler,
  authorizeVerify,
  shouldReuseVerdict,
  checkCooldown,
  _resetCooldowns,
  MIN_PROOF_BYTES,
  RETRYABLE_VERDICTS,
  RATE,
} from '../api/_lib/verify.js'
import { createFakeSupabase, makeRes, proofAndGeminiFetch } from './helpers/fakeSupabase.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const OWNER = 'user-1'
const OTHER = 'user-2'
const ADMIN = 'admin-1'
const TOKENS = { 'tok-owner': OWNER, 'tok-other': OTHER, 'tok-admin': ADMIN }
const SIGNED = 'https://storage.example/signed/proof.jpg'
const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
  GEMINI_API_KEY: 'AIza-SECRET-TEST-KEY',
  GEMINI_MODEL: 'gemini-test',
}

const completionRow = (over = {}) => ({
  id: 'c1',
  user_id: OWNER,
  quest_id: 'q1',
  proof_photo_url: `${OWNER}/q1-123.jpg`,
  progress_log: 'Finished the problem set and photographed the worked pages.',
  ai_verdict: 'pending',
  ai_confidence: null,
  ai_reason: null,
  ...over,
})

function setup({ fetchImpl, completions = [completionRow()], env = ENV, signedUrls } = {}) {
  const fake = createFakeSupabase({
    users: TOKENS,
    profiles: { [OWNER]: { role: 'user' }, [OTHER]: { role: 'user' }, [ADMIN]: { role: 'admin' } },
    tasks: [{ id: 'q1', user_id: OWNER, text: 'Finish problem set 4', goal: 'All 12 solved' }],
    completions,
    signedUrls: signedUrls ?? { [`${OWNER}/q1-123.jpg`]: SIGNED },
  })
  const handler = createVerifyHandler({
    createClient: fake.createClient,
    fetchImpl,
    env,
    now: () => Date.now(),
    sleep: async () => {},   // skip the real retry backoff
  })
  const call = async (body, token = 'tok-owner') => {
    const res = makeRes()
    const headers = token ? { authorization: `Bearer ${token}` } : {}
    await handler({ method: 'POST', headers, body }, res)
    return res
  }
  return { ...fake, call }
}

const verdictUpdate = (writes) =>
  writes.find((w) => w.table === 'quest_completions' && w.op === 'update')?.patch
const rollbacks = (writes) => writes.filter((w) => w.op === 'rpc' && w.name === 'rollback_completion')

beforeEach(() => _resetCooldowns())

describe('1. authentication is now required', () => {
  test('no Authorization header → 401, and no AI call', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, null)
    assert.equal(res.statusCode, 401)
    assert.equal(res.body.error, 'unauthenticated')
    assert.equal(fetchImpl.geminiCalls().length, 0)
    assert.equal(writes.length, 0, 'nothing may be written for an unauthenticated call')
  })

  test('an invalid token → 401', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, 'tok-garbage')
    assert.equal(res.statusCode, 401)
    assert.equal(fetchImpl.geminiCalls().length, 0)
  })

  test('a valid token with no completion_id → 400', async () => {
    const { call } = setup({ fetchImpl: proofAndGeminiFetch({ signedUrl: SIGNED }) })
    const res = await call({})
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error, 'missing_completion_id')
  })

  test('a non-POST method is refused', async () => {
    const fake = createFakeSupabase({ users: TOKENS, profiles: {} })
    const handler = createVerifyHandler({ createClient: fake.createClient, env: ENV, sleep: async () => {} })
    const res = makeRes()
    await handler({ method: 'GET', headers: {}, body: {} }, res)
    assert.equal(res.statusCode, 405)
  })
})

describe('2. ownership — the hole this phase closes', () => {
  test("a participant cannot verify someone else's completion", async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, 'tok-other')

    assert.equal(res.statusCode, 403)
    assert.equal(res.body.error, 'forbidden')
    // The whole point: no verdict written, no rollback, no Gemini spend.
    assert.equal(verdictUpdate(writes), undefined)
    assert.deepEqual(rollbacks(writes), []);
    assert.equal(fetchImpl.geminiCalls().length, 0)
  })

  test("a participant cannot force a FAIL on someone else's completion", async () => {
    // The attack the missing auth allowed: a forced fail reverses real points.
    const fetchImpl = proofAndGeminiFetch({
      signedUrl: SIGNED,
      geminiResult: { verdict: 'fail', confidence: 0.1, reason: 'nope' },
    })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, 'tok-other')
    assert.equal(res.statusCode, 403)
    assert.deepEqual(rollbacks(writes), [], 'rollback_completion must never fire for a stranger')
  })

  test('the owner may verify their own completion', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, 'tok-owner')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.verdict, 'pass')
  })

  test('an admin may verify any completion', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' }, 'tok-admin')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.verdict, 'pass')
  })

  test('an unknown completion id → 404', async () => {
    const { call } = setup({ fetchImpl: proofAndGeminiFetch({ signedUrl: SIGNED }) })
    const res = await call({ completion_id: 'does-not-exist' })
    assert.equal(res.statusCode, 404)
    assert.equal(res.body.error, 'completion_not_found')
  })

  test('the authorisation rule, in isolation', () => {
    assert.equal(authorizeVerify({ completion: null, uid: OWNER, isAdmin: false }).status, 404)
    assert.equal(
      authorizeVerify({ completion: completionRow(), uid: OTHER, isAdmin: false }).status,
      403,
    )
    assert.equal(authorizeVerify({ completion: completionRow(), uid: OWNER, isAdmin: false }).ok, true)
    assert.equal(authorizeVerify({ completion: completionRow(), uid: OTHER, isAdmin: true }).ok, true)
  })
})

describe('3. a pass leaves the provisional award alone', () => {
  test('pass is recorded with its confidence and reason, and no rollback', async () => {
    const fetchImpl = proofAndGeminiFetch({
      signedUrl: SIGNED,
      geminiResult: { verdict: 'pass', confidence: 0.82, reason: 'The worked pages are visible.' },
    })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'pass')
    assert.equal(res.body.confidence, 0.82)
    const patch = verdictUpdate(writes)
    assert.equal(patch.ai_verdict, 'pass')
    assert.equal(patch.ai_confidence, 0.82)
    assert.ok(patch.ai_verdict_at, 'the verdict must be timestamped')
    assert.deepEqual(rollbacks(writes), [])
  })

  test('the photo is signed for a short window, not made public', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({ fetchImpl })
    await call({ completion_id: 'c1' })
    const signing = writes.find((w) => w.op === 'signedUrl')
    assert.equal(signing.bucket, 'quest-proofs')
    assert.ok(signing.expiresIn <= 300, `signed URL TTL ${signing.expiresIn}s is too long`)
  })
})

describe('4. a rejection reverses the award', () => {
  test('fail writes the verdict and calls rollback_completion', async () => {
    const fetchImpl = proofAndGeminiFetch({
      signedUrl: SIGNED,
      geminiResult: { verdict: 'fail', confidence: 0.2, reason: 'The photo does not show the task.' },
    })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'fail')
    assert.equal(verdictUpdate(writes).ai_verdict, 'fail')
    const [rollback] = rollbacks(writes)
    assert.ok(rollback, 'rollback_completion must fire on a fail')
    assert.equal(rollback.args.p_completion_id, 'c1')
    assert.equal(rollback.args.p_reason, 'ai_rejected')
  })

  test('a blank or tiny image is a fail, without asking the model', async () => {
    // The web client checks this in a canvas; a native client cannot, so this
    // server-side guard is the only one that covers every client.
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED, bytes: MIN_PROOF_BYTES - 1 })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'fail')
    assert.match(res.body.reason, /blank|too small/i)
    assert.equal(fetchImpl.geminiCalls().length, 0)
    assert.equal(rollbacks(writes).length, 1)
  })
})

describe('5. an AI outage never awards and never rejects', () => {
  test('Gemini 503 → error verdict, award untouched', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED, geminiStatus: 503 })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'error')
    assert.match(res.body.reason, /manual review/i)
    assert.equal(verdictUpdate(writes).ai_verdict, 'error')
    assert.deepEqual(rollbacks(writes), [], 'an outage must not be treated as fraud')
  })

  test('no Gemini key configured → error verdict, no AI call', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({ fetchImpl, env: { ...ENV, GEMINI_API_KEY: undefined } })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'error')
    assert.match(res.body.reason, /not configured/i)
    assert.equal(fetchImpl.geminiCalls().length, 0)
    assert.deepEqual(rollbacks(writes), [])
  })

  test('an unreachable proof photo → error verdict, not a fail', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({ fetchImpl, signedUrls: {} })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.body.verdict, 'error')
    assert.match(res.body.reason, /unavailable/i)
    assert.deepEqual(rollbacks(writes), [], 'a missing file is not the participant cheating')
  })

  test('an unparseable model response → error verdict', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED, geminiResult: 'not json at all' })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })
    assert.equal(res.body.verdict, 'error')
    assert.deepEqual(rollbacks(writes), [])
  })

  test('a verdict outside pass/fail → error verdict', async () => {
    const fetchImpl = proofAndGeminiFetch({
      signedUrl: SIGNED,
      geminiResult: { verdict: 'maybe', reason: 'unsure' },
    })
    const { call } = setup({ fetchImpl })
    assert.equal((await call({ completion_id: 'c1' })).body.verdict, 'error')
  })

  test('no internal detail reaches the client', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED, geminiStatus: 500 })
    const { call } = setup({ fetchImpl })
    const res = await call({ completion_id: 'c1' })
    const body = JSON.stringify(res.body)
    // Only genuine secrets and internals — "AI service busy" is the intended
    // participant-facing wording, so the bare word "service" is not a leak.
    for (const leak of ['AIza', 'generativelanguage', 'gemini', 'service_role', 'flash']) {
      assert.ok(!body.toLowerCase().includes(leak.toLowerCase()), `response leaks "${leak}": ${body}`)
    }
  })
})

describe('6. idempotency — a final verdict is not re-rolled', () => {
  test('a participant re-checking a passed completion gets the stored verdict', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call, writes } = setup({
      fetchImpl,
      completions: [completionRow({ ai_verdict: 'pass', ai_confidence: 0.9, ai_reason: 'Looks done.' })],
    })
    const res = await call({ completion_id: 'c1' })

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.verdict, 'pass')
    assert.equal(res.body.reused, true)
    assert.equal(fetchImpl.geminiCalls().length, 0, 'must not spend a Gemini call')
    assert.equal(verdictUpdate(writes), undefined, 'must not rewrite the verdict')
  })

  test('a participant cannot re-roll a failed completion into a pass', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED, geminiResult: { verdict: 'pass', reason: 'ok' } })
    const { call } = setup({ fetchImpl, completions: [completionRow({ ai_verdict: 'fail', ai_reason: 'No.' })] })
    const res = await call({ completion_id: 'c1' })
    assert.equal(res.body.verdict, 'fail')
    assert.equal(fetchImpl.geminiCalls().length, 0)
  })

  test('pending and error stay retryable — the admin re-run button needs it', async () => {
    assert.deepEqual(RETRYABLE_VERDICTS, ['pending', 'error'])
    for (const verdict of RETRYABLE_VERDICTS) {
      _resetCooldowns()
      const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
      const { call } = setup({ fetchImpl, completions: [completionRow({ ai_verdict: verdict })] })
      const res = await call({ completion_id: 'c1' })
      assert.equal(res.body.verdict, 'pass', `${verdict} should be re-checkable`)
      assert.equal(fetchImpl.geminiCalls().length, 1)
    }
  })

  test('an admin may force a fresh run on any verdict', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({ fetchImpl, completions: [completionRow({ ai_verdict: 'fail' })] })
    const res = await call({ completion_id: 'c1' }, 'tok-admin')
    assert.equal(res.body.verdict, 'pass')
    assert.equal(fetchImpl.geminiCalls().length, 1)
  })

  test('the reuse rule, in isolation', () => {
    assert.equal(shouldReuseVerdict({ completion: { ai_verdict: 'pass' }, isAdmin: false }), true)
    assert.equal(shouldReuseVerdict({ completion: { ai_verdict: 'fail' }, isAdmin: false }), true)
    assert.equal(shouldReuseVerdict({ completion: { ai_verdict: 'pending' }, isAdmin: false }), false)
    assert.equal(shouldReuseVerdict({ completion: { ai_verdict: 'error' }, isAdmin: false }), false)
    assert.equal(shouldReuseVerdict({ completion: {}, isAdmin: false }), false, 'missing → pending')
    assert.equal(shouldReuseVerdict({ completion: { ai_verdict: 'pass' }, isAdmin: true }), false)
  })
})

describe('7. rate limiting', () => {
  test('a rapid second request from the same participant is refused', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({ fetchImpl, completions: [completionRow(), completionRow({ id: 'c2' })] })

    assert.equal((await call({ completion_id: 'c1' })).statusCode, 200)
    const second = await call({ completion_id: 'c2' })
    assert.equal(second.statusCode, 429)
    assert.equal(second.body.error, 'rate_limited')
    assert.ok(second.body.retry_in_ms > 0)
    assert.equal(fetchImpl.geminiCalls().length, 1, 'the refused call must not reach Gemini')
  })

  test('admins are not rate limited — they run the whole queue', async () => {
    const fetchImpl = proofAndGeminiFetch({ signedUrl: SIGNED })
    const { call } = setup({
      fetchImpl,
      completions: [completionRow(), completionRow({ id: 'c2' }), completionRow({ id: 'c3' })],
    })
    for (const id of ['c1', 'c2', 'c3']) {
      assert.equal((await call({ completion_id: id }, 'tok-admin')).statusCode, 200, `${id} refused`)
    }
    assert.equal(fetchImpl.geminiCalls().length, 3)
  })

  test('the cooldown is per user, not global', async () => {
    const store = new Map()
    const t = 1_000_000
    assert.equal(checkCooldown('a', t, store).ok, true)
    assert.equal(checkCooldown('b', t, store).ok, true, 'a different user must not be blocked')
    assert.equal(checkCooldown('a', t + 100, store).ok, false)
    assert.equal(checkCooldown('a', t + RATE.cooldownMs + 1, store).ok, true)
  })

  test('the cooldown map is pruned so a warm instance cannot grow unbounded', () => {
    const store = new Map()
    for (let i = 0; i < 600; i++) checkCooldown(`u${i}`, 1000 + i, store)
    // Far in the future, everything is stale and prunable.
    checkCooldown('fresh', 1000 + 600 + RATE.cooldownMs * 20, store)
    assert.ok(store.size < 600, `map still holds ${store.size} entries`)
  })
})

describe('8. every client sends the token', () => {
  test('one shared helper builds the header', () => {
    const helper = read('src/lib/authHeaders.js')
    assert.match(helper, /Authorization: `Bearer \$\{session\.access_token\}`/)
    assert.match(helper, /export async function jsonPost/)
  })

  test('the web verification modal and both admin re-runs use it', () => {
    for (const f of ['src/components/VerificationModal.jsx', 'src/pages/AdminPage.jsx']) {
      const src = read(f)
      assert.match(src, /from '\.\.\/lib\/authHeaders'/, `${f} should import the helper`)
      // No un-authenticated POST to /api/verify may remain.
      assert.doesNotMatch(
        src,
        /fetch\('\/api\/verify',\s*\{\s*\n?\s*method: 'POST', headers: \{ 'Content-Type': 'application\/json' \},/,
        `${f} still has a bare /api/verify call`,
      )
    }
  })

  test('the mobile client sends it too', (t) => {
    // The mobile client lives on its own branch; on a web-only checkout there
    // is nothing to assert against, and that is fine.
    const mobile = path.join(ROOT, 'apps/mobile/src/lib/verifyApi.ts')
    if (!existsSync(mobile)) return t.skip('mobile client not present on this branch')
    const src = readFileSync(mobile, 'utf8')
    assert.match(src, /Authorization: `Bearer \$\{session\.access_token\}`/)
    assert.match(src, /\/api\/verify/)
  })

  test('the endpoint file is thin wiring over the testable lib', () => {
    const src = read('api/verify.js')
    assert.match(src, /createVerifyHandler\(\{ createClient \}\)/)
    // The logic must not have been left duplicated in the endpoint.
    assert.ok(src.split('\n').length < 30, 'api/verify.js should be wiring only')
  })

  test('no private key is named in any client file', () => {
    const files = [
      'src/lib/authHeaders.js',
      'src/components/VerificationModal.jsx',
      'src/pages/AdminPage.jsx',
      'apps/mobile/src/lib/verifyApi.ts',   // only when the mobile tree is present
    ].filter((f) => existsSync(path.join(ROOT, f)))
    assert.ok(files.length >= 3, 'the three web client files must always be present')
    for (const f of files) {
      assert.doesNotMatch(read(f), /SERVICE_ROLE|GEMINI_API_KEY/i, `${f} names a server secret`)
    }
  })
})
