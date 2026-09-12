/*
 * Phase 12 — AI quest validity check. Run with `npm test` (Node ≥ 20, no extra
 * dependencies). Exercises the serverless handler against an in-memory
 * Supabase stand-in and a stubbed Gemini, plus static guards on the migration
 * and the client code for the properties that can only be enforced in the DB.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createQuestValidityHandler, validateQuestInput, validateAiResult, applyDecisionRules,
  checkRateLimit, EVIDENCE_TYPES, RISK_FLAGS, RATE, ACCEPT_MIN_SCORE,
} from '../api/_lib/quest-validity.js'
import { createFakeSupabase, makeRes, geminiFetch } from './helpers/fakeSupabase.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const MIGRATION = read('supabase/supabase-phase12-quest-validity.sql')

const FAKE_KEY = 'AIza-SECRET-TEST-KEY-9f8e7d'
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: 'gemini-test' }
const UID = 'user-1'
const TOKEN = 'tok-user-1'
const tomorrow = () => new Date(Date.now() + 86400_000).toISOString()

function setup({ fetchImpl, tasks = [], reviews = [], env = ENV, role = 'user' } = {}) {
  const fake = createFakeSupabase({ users: { [TOKEN]: UID, 'tok-admin': 'admin-1', 'tok-other': 'user-2' },
    profiles: { [UID]: { role }, 'admin-1': { role: 'admin' }, 'user-2': { role: 'user' } }, tasks, reviews })
  const handler = createQuestValidityHandler({ createClient: fake.createClient, fetchImpl, env })
  const call = async (body, token = TOKEN) => {
    const res = makeRes()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res)
    return res
  }
  return { ...fake, handler, call }
}

const VALID = {
  text: 'Finish calculus problem set 4',
  goal: 'All 12 problems solved, checked against the answer key',
  priority: 'P1', difficulty: 'easy', evidence_type: 'screenshot', planned_completion_date: null,
}
const AI_ACCEPT = {
  decision: 'accept', validity_score: 88, reason: 'Clear and checkable — good luck!',
  admin_reason: 'Specific academic task; screenshot of the completed set suffices.',
  risk_flags: [], recommended_evidence_type: 'screenshot', normalized_task_summary: 'Complete a calculus problem set.',
}

describe('1. a valid academic task is accepted and saved', () => {
  test('accept → task row with validity_status accepted, participant-safe response', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call, writes } = setup({ fetchImpl })
    const res = await call(VALID)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.decision, 'accept')
    assert.equal(res.body.validity_score, 88)
    const ins = writes.find(w => w.table === 'tasks' && w.op === 'insert')
    assert.ok(ins, 'task inserted')
    assert.equal(ins.row.validity_status, 'accepted')
    assert.equal(ins.row.user_id, UID)
    assert.equal(ins.row.goal, VALID.goal)
    assert.equal(ins.row.priority, 'P1')
    assert.ok(ins.row.validity_checked_at)
    const log = writes.find(w => w.table === 'quest_validity_reviews')
    assert.equal(log.row.decision, 'accept')
    assert.equal(log.row.model_version, 'google/gemini-test')
    assert.equal(log.row.task_id, ins.row.id)
  })
})

describe('2. a vague task requests clarification (nothing saved)', () => {
  test('clarify → no task insert, draft stays with the participant', async () => {
    const fetchImpl = geminiFetch({ ...AI_ACCEPT, decision: 'clarify', validity_score: 35, reason: 'Say which chapter and how many pages.', risk_flags: ['vague'] })
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ ...VALID, text: 'Study a bit', goal: 'Study some stuff for a while' })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.decision, 'clarify')
    assert.match(res.body.reason, /chapter/)
    assert.ok(!writes.some(w => w.table === 'tasks'), 'no task row written')
    assert.equal(writes.find(w => w.table === 'quest_validity_reviews').row.task_id, null)
  })
  test('server rule: a weak "accept" (score below threshold) becomes clarify', () => {
    const r = applyDecisionRules({ decision: 'accept', validity_score: ACCEPT_MIN_SCORE - 1, risk_flags: [] })
    assert.equal(r.decision, 'clarify')
  })
})

describe('3. duplicate and point-farming tasks are flagged', () => {
  test('exact duplicate of an active quest is rejected without calling the AI', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call, writes } = setup({ fetchImpl, tasks: [{ id: 't1', user_id: UID, text: 'finish calculus problem set 4!', difficulty: 'easy', completed: false, created_at: new Date().toISOString() }] })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'reject')
    assert.equal(fetchImpl.calls.length, 0, 'AI not called')
    const log = writes.find(w => w.table === 'quest_validity_reviews').row
    assert.deepEqual(log.risk_flags, ['duplicate'])
    assert.ok(!writes.some(w => w.table === 'tasks'))
  })
  test('a completed daily quest may be repeated (not a duplicate)', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call } = setup({ fetchImpl, tasks: [{ id: 't1', user_id: UID, text: VALID.text, difficulty: 'easy', completed: true, created_at: new Date().toISOString() }] })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'accept')
    assert.equal(fetchImpl.calls.length, 1)
  })
  test('AI "accept" carrying a point_farming flag is downgraded and the flag is logged', async () => {
    const fetchImpl = geminiFetch({ ...AI_ACCEPT, risk_flags: ['point_farming'] })
    const { call, writes } = setup({ fetchImpl })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'clarify')
    assert.deepEqual(writes.find(w => w.table === 'quest_validity_reviews').row.risk_flags, ['point_farming'])
    assert.ok(!writes.some(w => w.table === 'tasks'))
  })
  test('recent quests are passed to the model for duplicate/repetition context', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call } = setup({ fetchImpl, tasks: [{ id: 'z', user_id: UID, text: 'Read one page', difficulty: 'easy', completed: true, created_at: new Date().toISOString() }] })
    await call(VALID)
    const prompt = JSON.parse(fetchImpl.calls[0].init.body).contents[0].parts[0].text
    assert.match(prompt, /Read one page/)
    assert.match(prompt, /created in the last 24 hours: 1/)
  })
})

describe('4. normal validation still blocks a missing goal', () => {
  test('server: 400 on missing goal, AI never called', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call, writes } = setup({ fetchImpl })
    const res = await call({ ...VALID, goal: '' })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error, 'validation')
    assert.equal(res.body.field, 'goal')
    assert.equal(fetchImpl.calls.length, 0)
    assert.equal(writes.length, 0)
  })
  test('pure validator: title / goal / priority / evidence rules', () => {
    assert.equal(validateQuestInput({ ...VALID, text: 'ab' }).field, 'text')
    assert.equal(validateQuestInput({ ...VALID, goal: 'too short' }).field, 'goal')
    assert.equal(validateQuestInput({ ...VALID, priority: 'P9' }).field, 'priority')
    assert.equal(validateQuestInput({ ...VALID, evidence_type: 'selfie' }).field, 'evidence_type')
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'boss' }).field, 'difficulty')
    assert.equal(validateQuestInput(VALID).ok, true)
  })
  test('client keeps the same gate (goal ≥ 10 chars, planned date on Medium/Hard)', () => {
    const src = read('src/components/TaskList.jsx')
    assert.match(src, /const goalOk = goal\.trim\(\)\.length >= 10/)
    assert.match(src, /const needsPlan = activeDiff !== 'easy'/)
    assert.match(src, /const planOk = !needsPlan \|\| !!plannedDate/)
  })
})

describe('5. Medium / Hard planned-date rules', () => {
  test('medium without a date → 400; with a future date → ok', () => {
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'medium' }).field, 'planned_completion_date')
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'hard' }).field, 'planned_completion_date')
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'medium', planned_completion_date: tomorrow() }).ok, true)
  })
  test('easy keeps the date optional; a clearly past date is refused', () => {
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'easy' }).ok, true)
    const past = new Date(Date.now() - 3600_000).toISOString()
    assert.equal(validateQuestInput({ ...VALID, difficulty: 'easy', planned_completion_date: past }).field, 'planned_completion_date')
    assert.equal(validateQuestInput({ ...VALID, planned_completion_date: 'not a date' }).field, 'planned_completion_date')
  })
  test('the handler stores the planned date on the accepted row', async () => {
    const plan = tomorrow()
    const { call, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
    await call({ ...VALID, difficulty: 'hard', planned_completion_date: plan })
    assert.equal(writes.find(w => w.table === 'tasks').row.planned_completion_date, plan)
  })
})

describe('6. the selected evidence type is stored', () => {
  for (const ev of EVIDENCE_TYPES) {
    test(`evidence_type=${ev} round-trips onto the task row`, async () => {
      const { call, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
      await call({ ...VALID, evidence_type: ev })
      assert.equal(writes.find(w => w.table === 'tasks').row.evidence_type, ev)
    })
  }
  test('client and server evidence-type lists match', async () => {
    const client = await import('../src/data/questValidity.js')
    assert.deepEqual(client.EVIDENCE_TYPES.map(e => e.id), EVIDENCE_TYPES)
    assert.deepEqual(client.PRIORITIES.map(p => p.id), ['P1', 'P2', 'P3'])
  })
  test('migration constrains evidence_type to the same enum', () => {
    for (const ev of EVIDENCE_TYPES) assert.match(MIGRATION, new RegExp(`'${ev}'`))
    assert.match(MIGRATION, /tasks_evidence_type_check/)
  })
})

describe('7. AI failure never exposes credentials or silently accepts', () => {
  const leaks = (res) => {
    const s = JSON.stringify(res.body)
    return s.includes(FAKE_KEY) || s.includes('service-secret') || /gemini/i.test(s)
  }
  test('Gemini network failure → saved as pending_ai_review, no completion eligibility', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch(null, { throwNetwork: true }) })
    const res = await call(VALID)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.decision, 'pending')
    assert.equal(writes.find(w => w.table === 'tasks').row.validity_status, 'pending_ai_review')
    assert.ok(!leaks(res), 'no credentials / model names in the response')
  })
  test('Gemini 503 on every model → pending, not accepted', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch(null, { status: 503 }) })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'pending')
    assert.equal(writes.find(w => w.table === 'tasks').row.validity_status, 'pending_ai_review')
    assert.ok(!leaks(res))
  })
  test('unparseable / out-of-enum model output → pending', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch('{"decision":"yes please","validity_score":"high"}') })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'pending')
    assert.equal(writes.find(w => w.table === 'tasks').row.validity_status, 'pending_ai_review')
  })
  test('no GEMINI_API_KEY configured → pending, not accepted', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call, writes } = setup({ fetchImpl, env: { ...ENV, GEMINI_API_KEY: '' } })
    const res = await call(VALID)
    assert.equal(res.body.decision, 'pending')
    assert.equal(fetchImpl.calls.length, 0)
    assert.equal(writes.find(w => w.table === 'tasks').row.validity_status, 'pending_ai_review')
  })
  test('missing Supabase config → generic 500 without secrets', async () => {
    const { handler } = setup({ fetchImpl: geminiFetch(AI_ACCEPT), env: { GEMINI_API_KEY: FAKE_KEY } })
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, body: VALID }, res)
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { error: 'server_not_configured' })
  })
  test('browser bundle never references the server-side keys', () => {
    for (const f of ['src/context/GameContext.jsx', 'src/components/TaskList.jsx', 'src/pages/AdminPage.jsx', 'src/data/questValidity.js']) {
      assert.doesNotMatch(read(f), /GEMINI_API_KEY|SERVICE_ROLE|generativelanguage\.googleapis/, f)
    }
  })
})

describe('8. a participant cannot alter an accepted validity status from the browser', () => {
  test('migration: guard trigger raises on client-side validity changes and forces browser inserts to pending/exempt', () => {
    assert.match(MIGRATION, /create trigger tasks_validity_guard\s+before insert or update on public\.tasks/)
    assert.match(MIGRATION, /current_user in \('anon', 'authenticated'\)/)
    assert.match(MIGRATION, /raise exception 'validity fields are read-only'/)
    assert.match(MIGRATION, /new\.validity_status\s+is distinct from old\.validity_status/)
    assert.match(MIGRATION, /new\.validity_status := 'pending_ai_review'/)
    assert.doesNotMatch(MIGRATION, /new\.validity_status := 'accepted'/, 'no browser path can produce accepted')
    // completion gate for anything not accepted/exempt
    assert.match(MIGRATION, /new\.validity_status not in \('accepted', 'exempt'\)/)
    assert.match(MIGRATION, /quest_not_eligible/)
  })
  test('server: the user id comes from the verified token, never the body', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
    await call({ ...VALID, user_id: 'someone-else', validity_status: 'accepted' })
    assert.equal(writes.find(w => w.table === 'tasks').row.user_id, UID)
  })
  test('server: no token → 401, nothing written', async () => {
    const { handler, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, body: VALID }, res)
    assert.equal(res.statusCode, 401)
    assert.equal(writes.length, 0)
  })
  test('server: only the owner or an admin may re-check a row', async () => {
    const row = { id: 'p1', user_id: UID, text: 'x', goal: 'goal statement here', priority: 'P2', difficulty: 'easy', evidence_type: 'photo', validity_status: 'pending_ai_review', completed: false, created_at: new Date().toISOString() }
    const { call } = setup({ fetchImpl: geminiFetch(AI_ACCEPT), tasks: [row] })
    assert.equal((await call({ task_id: 'p1' }, 'tok-other')).statusCode, 403)
    assert.equal((await call({ task_id: 'p1' }, 'tok-admin')).body.decision, 'accept')
  })
  test('client code never writes validity columns to tasks', () => {
    for (const f of ['src/context/GameContext.jsx', 'src/components/TaskList.jsx']) {
      const src = read(f)
      const updates = src.match(/from\('tasks'\)\s*\.update\([^)]*\)/g) || []
      assert.equal(updates.length, 0, `${f} must not update tasks directly`)
      assert.doesNotMatch(src, /insert\(\{[^}]*validity_status/, `${f} must not insert a validity_status`)
    }
  })
})

describe('9. a non-admin cannot see internal admin reasoning', () => {
  test('participant response carries no admin_reason / risk_flags / model_version', async () => {
    const { call } = setup({ fetchImpl: geminiFetch({ ...AI_ACCEPT, decision: 'clarify', validity_score: 40, admin_reason: 'SECRET internal note', risk_flags: ['vague'] }) })
    const res = await call(VALID)
    const keys = Object.keys(res.body)
    for (const k of ['admin_reason', 'risk_flags', 'model_version', 'normalized_task_summary']) assert.ok(!keys.includes(k), k)
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET internal note/)
  })
  test('accepted task row itself holds no admin reasoning (it lives in the admin-only table)', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
    const res = await call(VALID)
    const row = writes.find(w => w.table === 'tasks').row
    assert.ok(!('admin_reason' in row) && !('risk_flags' in row) && !('model_version' in row))
    assert.ok(!('admin_reason' in (res.body.task || {})))
  })
  test('migration: quest_validity_reviews is RLS admin-read-only with no client writes; tasks has no admin column', () => {
    assert.match(MIGRATION, /alter table public\.quest_validity_reviews enable row level security/)
    assert.match(MIGRATION, /create policy "qvr: admin read" on public\.quest_validity_reviews for select using \( is_admin\(\) \)/)
    assert.doesNotMatch(MIGRATION, /policy "qvr: own read"/)
    assert.match(MIGRATION, /revoke insert, update, delete on public\.quest_validity_reviews from anon, authenticated/)
    assert.doesNotMatch(MIGRATION, /add column if not exists validity_admin_reason/)
    assert.doesNotMatch(MIGRATION, /add column if not exists validity_risk_flags/)
  })
  test('only the admin page reads quest_validity_reviews', () => {
    for (const f of ['src/context/GameContext.jsx', 'src/components/TaskList.jsx', 'src/pages/DashboardPage.jsx'])
      assert.doesNotMatch(read(f), /quest_validity_reviews/, f)
    assert.match(read('src/pages/AdminPage.jsx'), /quest_validity_reviews/)
  })
})

describe('10. completion / points / streak / rollback path is untouched', () => {
  test('migration defines none of the economy-critical functions', () => {
    for (const fn of ['complete_task', 'submit_completion', 'rollback_completion', 'admin_review_completion', 'break_streak']) {
      assert.doesNotMatch(MIGRATION, new RegExp(`create or replace function (public\\.)?${fn}\\b`), fn)
      assert.doesNotMatch(MIGRATION, new RegExp(`drop function[^;]*${fn}`), fn)
    }
    assert.doesNotMatch(MIGRATION, /grant execute on function complete_task/)
    assert.doesNotMatch(MIGRATION, /profiles\s+set\s+points/i)
  })
  test('the validity endpoint never awards, completes or rolls back', async () => {
    const { call, writes } = setup({ fetchImpl: geminiFetch(AI_ACCEPT) })
    await call(VALID)
    assert.ok(!writes.some(w => w.op === 'rpc'))
    assert.ok(!writes.some(w => w.table === 'profiles'))
    const row = writes.find(w => w.table === 'tasks').row
    assert.equal(row.completed, undefined)
    assert.equal(row.points, undefined)
  })
  test('api/verify.js (proof verification) is untouched by Phase 12', () => {
    const src = read('api/verify.js')
    assert.doesNotMatch(src, /validate-quest|quest-validity|validity_status/)
    assert.match(src, /rollback_completion/)
  })
  test('client completion flow still goes through submit_completion → complete_task only', () => {
    const src = read('src/context/GameContext.jsx')
    assert.match(src, /supabase\.rpc\('submit_completion'/)
    assert.doesNotMatch(src, /rpc\('admin_resolve_quest_validity'/)
  })
})

describe('rate limiting / structured-result validation', () => {
  test('a check inside the cooldown window returns 429 and never reaches the AI', async () => {
    const fetchImpl = geminiFetch(AI_ACCEPT)
    const { call, writes } = setup({ fetchImpl, reviews: [{ id: 'r1', user_id: UID, created_at: new Date(Date.now() - 2000).toISOString() }] })
    const res = await call(VALID)
    assert.equal(res.statusCode, 429)
    assert.equal(res.body.error, 'rate_limited')
    assert.ok(res.body.retry_after_seconds > 0)
    assert.equal(fetchImpl.calls.length, 0)
    assert.ok(!writes.some(w => w.table === 'tasks'))
  })
  test('cap per rolling window', () => {
    const now = Date.now()
    const recent = Array.from({ length: RATE.maxPerWindow }, (_, i) => new Date(now - RATE.cooldownMs - i * 30_000).toISOString())
    assert.equal(checkRateLimit(recent, now).limited, true)
    assert.equal(checkRateLimit(recent.slice(0, 2), now).limited, false)
  })
  test('validateAiResult coerces enums, range, lengths and array sizes', () => {
    const r = validateAiResult({
      decision: 'ACCEPT', validity_score: 250, reason: 'x'.repeat(1000), admin_reason: 'y'.repeat(5000),
      risk_flags: ['vague', 'bogus_flag', 'vague', ...RISK_FLAGS], recommended_evidence_type: 'video',
      normalized_task_summary: 'z'.repeat(999),
    }, { model: 'm' })
    assert.equal(r.ok, true)
    assert.equal(r.result.decision, 'accept')
    assert.equal(r.result.validity_score, 100)
    assert.equal(r.result.reason.length, 300)
    assert.equal(r.result.admin_reason.length, 1000)
    assert.ok(r.result.risk_flags.length <= 8 && r.result.risk_flags.every(f => RISK_FLAGS.includes(f)))
    assert.equal(r.result.recommended_evidence_type, null)
    assert.equal(r.result.normalized_task_summary.length, 200)
    assert.equal(validateAiResult(null).ok, false)
    assert.equal(validateAiResult([]).ok, false)
    assert.equal(validateAiResult({ decision: 'accept', validity_score: 'NaN' }).ok, false)
  })
  test('unsafe / impossible flags force a reject', () => {
    assert.equal(applyDecisionRules({ decision: 'accept', validity_score: 95, risk_flags: ['unsafe'] }).decision, 'reject')
    assert.equal(applyDecisionRules({ decision: 'clarify', validity_score: 50, risk_flags: ['impossible'] }).decision, 'reject')
  })
})

describe('re-check of a saved quest (owner / admin path)', () => {
  const pendingRow = () => ({ id: 'p1', user_id: UID, text: 'Write the essay introduction', goal: 'Two paragraphs drafted and saved', priority: 'P2', difficulty: 'easy', evidence_type: 'document', planned_completion_date: null, validity_status: 'pending_ai_review', completed: false, created_at: new Date().toISOString() })
  test('accept updates the row in place to accepted', async () => {
    const { call, writes, db } = setup({ fetchImpl: geminiFetch(AI_ACCEPT), tasks: [pendingRow()] })
    const res = await call({ task_id: 'p1' })
    assert.equal(res.body.decision, 'accept')
    assert.equal(db.tasks[0].validity_status, 'accepted')
    assert.ok(!writes.some(w => w.table === 'tasks' && w.op === 'insert'), 'no new row')
  })
  test('clarify marks it needs_clarification; AI outage leaves it pending', async () => {
    const a = setup({ fetchImpl: geminiFetch({ ...AI_ACCEPT, decision: 'clarify', validity_score: 30 }), tasks: [pendingRow()] })
    await a.call({ task_id: 'p1' })
    assert.equal(a.db.tasks[0].validity_status, 'needs_clarification')
    const b = setup({ fetchImpl: geminiFetch(null, { status: 503 }), tasks: [pendingRow()] })
    const res = await b.call({ task_id: 'p1' })
    assert.equal(res.body.decision, 'pending')
    assert.equal(b.db.tasks[0].validity_status, 'pending_ai_review')
  })
  test('an accepted or completed quest cannot be re-checked', async () => {
    const { call } = setup({ fetchImpl: geminiFetch(AI_ACCEPT), tasks: [{ ...pendingRow(), validity_status: 'accepted' }] })
    assert.equal((await call({ task_id: 'p1' })).statusCode, 409)
  })
})

describe('preset catalogue seed matches src/data/presetQuests.js', () => {
  test('every starter quest text is in the migration seed (so it stays exempt)', async () => {
    let src = read('src/data/presetQuests.js').replace(/^import[^\n]*\n/, 'const DIFFICULTY_COLORS = {}\n')
    const { PRESET_QUESTS } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
    let n = 0
    for (const diffs of Object.values(PRESET_QUESTS)) for (const list of Object.values(diffs)) for (const text of list) {
      n++
      assert.ok(MIGRATION.includes(`('${text.replace(/'/g, "''")}',`), `missing from seed: ${text}`)
    }
    assert.ok(n > 100)
  })
})
