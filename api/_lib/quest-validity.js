import { generateJson, parseJsonLoose } from './gemini.js'

/*
 * Phase 12 — AI quest validity check at creation. Pure logic + a handler
 * factory; api/validate-quest.js wires it to real deps. Everything the browser
 * sends is untrusted; everything the model returns is untrusted too.
 *
 * Flow (create):  auth → server-side field validation → rate limit → duplicate
 *   pre-check → Gemini → validate the JSON → server rules → save ONLY per the
 *   final decision → participant-safe response (never admin_reason/risk_flags/
 *   model_version — those live in quest_validity_reviews, admin-read-only).
 *
 * Flow (recheck): same, for an existing row (owner or admin) that is pending,
 *   needs_clarification or rejected — the admin path for AI outages.
 */

export const EVIDENCE_TYPES = ['photo', 'document', 'screenshot', 'timed_activity', 'admin_review']
export const DIFFICULTIES   = ['easy', 'medium', 'hard']
export const PRIORITIES     = ['P1', 'P2', 'P3']
export const DECISIONS      = ['accept', 'clarify', 'reject']
export const RISK_FLAGS     = [
  'vague', 'trivial', 'irrelevant', 'inconsistent_goal', 'difficulty_mismatch',
  'hard_to_verify', 'duplicate', 'unsafe', 'impossible', 'unverifiable_dependency', 'point_farming',
]
/* Statuses an existing row may be in for a re-check. */
export const RECHECKABLE = ['pending_ai_review', 'needs_clarification', 'rejected']

export const LIMITS = {
  title: { min: 3, max: 80 },     // matches the input's maxLength
  goal:  { min: 10, max: 140 },
  reason: 300, adminReason: 1000, summary: 200, flags: 8,
  pastPlanGraceMs: 10 * 60 * 1000,
  recentTasks: 40,
}
/* Per-user AI submission limits: a short cooldown between checks and a cap per
   rolling window, counted on quest_validity_reviews (one row per check). */
export const RATE = { cooldownMs: 15_000, windowMs: 10 * 60_000, maxPerWindow: 8 }

/* Server rule: an "accept" needs at least this score, else it becomes clarify. */
export const ACCEPT_MIN_SCORE = 60
const BLOCKING_FLAGS = new Set(['duplicate', 'point_farming', 'unsafe', 'impossible'])

const EVIDENCE_DESC = {
  photo:          'a live photo taken with the device camera (the finished work, the activity, the place)',
  document:       'an uploaded document or file (PDF, essay, spreadsheet, code, notes…)',
  screenshot:     'a screenshot of an app or website showing the result (e.g. a submitted assignment, a tracker)',
  timed_activity: 'a timed in-app activity session (start/stop timer while working) plus a short log',
  admin_review:   'other evidence that a study admin reviews manually',
}
const DIFF_DESC = {
  easy:   'Easy — a daily quest worth 10 points, expected to be done within a day',
  medium: 'Medium — a 3-day quest worth 25 points, e.g. ~12 hours of work split across the period',
  hard:   'Hard — a week-long challenge worth 50 points, intense and logged daily',
}

export const PENDING_REASON =
  'We couldn’t run the quest check right now. Your quest is saved and will be checked shortly — you can complete it once it’s accepted.'

/* ── helpers ── */
export const normalizeTitle = (s) =>
  String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* ── 1. Server-side validation of what the browser sent ──
   Mirrors (and is the authority for) the client-side required-field rules:
   title, goal statement, priority P1/P2/P3, difficulty, evidence type, and a
   planned finish date for Medium and Hard quests. */
export function validateQuestInput(body = {}) {
  const fail = (field, message) => ({ ok: false, field, message })

  const text = str(body.text, 200)
  if (text.length < LIMITS.title.min) return fail('text', 'Give your quest a title (at least 3 characters).')
  if (text.length > LIMITS.title.max) return fail('text', `Keep the title under ${LIMITS.title.max} characters.`)
  if (!/[a-z]/i.test(text)) return fail('text', 'The title needs some words, not just symbols.')

  const goal = str(body.goal, 500)
  if (goal.length < LIMITS.goal.min) return fail('goal', 'Add a goal statement — what does “done” look like? (at least 10 characters)')
  if (goal.length > LIMITS.goal.max) return fail('goal', `Keep the goal under ${LIMITS.goal.max} characters.`)

  const priority = String(body.priority || '')
  if (!PRIORITIES.includes(priority)) return fail('priority', 'Choose a priority: P1, P2 or P3.')

  const difficulty = String(body.difficulty || '')
  if (!DIFFICULTIES.includes(difficulty)) return fail('difficulty', 'Choose a difficulty: easy, medium or hard.')

  const evidence_type = String(body.evidence_type || '')
  if (!EVIDENCE_TYPES.includes(evidence_type)) return fail('evidence_type', 'Choose how you will show this quest is done.')

  let planned = null
  const rawPlan = body.planned_completion_date
  if (rawPlan != null && rawPlan !== '') {
    const t = new Date(rawPlan).getTime()
    if (!Number.isFinite(t)) return fail('planned_completion_date', 'That planned finish date isn’t valid.')
    if (t < Date.now() - LIMITS.pastPlanGraceMs) return fail('planned_completion_date', 'The planned finish date must be in the future.')
    planned = new Date(t).toISOString()
  }
  if (difficulty !== 'easy' && !planned) {
    return fail('planned_completion_date', `${difficulty === 'hard' ? 'Hard' : 'Medium'} quests need a planned finish date.`)
  }

  return { ok: true, quest: { text, goal, priority, difficulty, evidence_type, planned_completion_date: planned } }
}

/* ── 2. Validate the model's JSON (untrusted) ──
   Returns { ok: true, result } with every field coerced into its enum / range /
   length, or { ok: false } when the decision or score is unusable (→ pending). */
export function validateAiResult(raw, { model = 'unknown' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not_object' }
  const decision = String(raw.decision || '').toLowerCase()
  if (!DECISIONS.includes(decision)) return { ok: false, error: 'bad_decision' }

  const scoreNum = Number(raw.validity_score)
  if (!Number.isFinite(scoreNum)) return { ok: false, error: 'bad_score' }
  const validity_score = Math.max(0, Math.min(100, Math.round(scoreNum)))

  const flagsIn = Array.isArray(raw.risk_flags) ? raw.risk_flags : []
  const risk_flags = [...new Set(flagsIn.map(f => String(f).toLowerCase().trim()).filter(f => RISK_FLAGS.includes(f)))]
    .slice(0, LIMITS.flags)

  const rec = String(raw.recommended_evidence_type || '').toLowerCase()
  const recommended_evidence_type = EVIDENCE_TYPES.includes(rec) ? rec : null

  return {
    ok: true,
    result: {
      decision,
      validity_score,
      reason: str(raw.reason, LIMITS.reason) || defaultReason(decision),
      admin_reason: str(raw.admin_reason, LIMITS.adminReason),
      risk_flags,
      recommended_evidence_type,
      normalized_task_summary: str(raw.normalized_task_summary, LIMITS.summary),
      model_version: `google/${model}`,
    },
  }
}

function defaultReason(decision) {
  if (decision === 'accept') return 'Your quest looks specific and verifiable. Good luck!'
  if (decision === 'clarify') return 'Please make the task more specific so it can be checked when you finish.'
  return 'Please make the task more specific or choose evidence that can demonstrate completion.'
}

/* ── 3. Server rules on top of the model's decision ──
   The model proposes; these rules make sure a weak or flagged "accept" can never
   slip through. Kept deterministic so they are testable. */
export function applyDecisionRules(result) {
  let { decision } = result
  const flags = result.risk_flags
  if (decision === 'accept' && (result.validity_score < ACCEPT_MIN_SCORE || flags.some(f => BLOCKING_FLAGS.has(f)))) {
    decision = 'clarify'
  }
  if (decision !== 'reject' && (flags.includes('unsafe') || flags.includes('impossible'))) {
    decision = 'reject'
  }
  return { ...result, decision }
}

/* ── 4. Prompt ──
   Evaluates the quest DEFINITION only — never the participant. Recent quests
   are passed for duplicate / point-farming context. */
export function buildPrompt(quest, { recent = [], createdLast24h = 0 } = {}) {
  const lines = recent.slice(0, 25).map(t =>
    `- [${t.completed ? 'completed' : 'active'}] "${String(t.text).slice(0, 90)}" (${t.difficulty}${t.created_at ? `, created ${t.created_at.slice(0, 10)}` : ''})`)
  return [
    'You are a quest quality reviewer for PetQuest, a research app where students turn their own tasks into "quests" and earn points once completion is verified with evidence.',
    'Evaluate ONLY the quest definition below. Do not diagnose, profile or judge the person. Be fair to genuine study, fitness and life-admin tasks.',
    '',
    'QUEST',
    `- Title: "${quest.text}"`,
    `- Goal statement (what "done" looks like): "${quest.goal}"`,
    `- Requested difficulty: ${DIFF_DESC[quest.difficulty]}`,
    `- Priority: ${quest.priority}`,
    `- Evidence the participant will provide on completion: ${quest.evidence_type} — ${EVIDENCE_DESC[quest.evidence_type]}`,
    `- Planned finish: ${quest.planned_completion_date || 'not set (optional for easy quests)'}`,
    '',
    'PARTICIPANT’S RECENT QUESTS (for duplicate and repetition checks only)',
    ...(lines.length ? lines : ['- (none yet)']),
    `- Quests created in the last 24 hours: ${createdLast24h}`,
    '',
    'EVALUATE',
    '1. Is the task specific and understandable?',
    '2. Is it a meaningful activity rather than a trivial action (e.g. "open a book", "click complete", "breathe")?',
    '3. Is it relevant to task management — studying, fitness, chores, work, personal projects, habits?',
    '4. Are the title and the goal statement consistent with each other?',
    '5. Is the requested difficulty reasonable for the described effort?',
    '6. Could completion reasonably be verified with the chosen evidence type? If a different type would work better, recommend it.',
    '7. Is it a duplicate or near-duplicate of an ACTIVE recent quest? (Repeating a completed daily quest on a new day is fine.)',
    '8. Is it unsafe, inappropriate, impossible, or dependent on information the app cannot verify?',
    '9. Does it look like point farming — many near-identical low-effort quests in a short time?',
    '',
    'DECISION',
    '- "accept": specific, meaningful, verifiable with the chosen (or recommended) evidence, consistent, not a duplicate.',
    '- "clarify": fixable problems — vague wording, goal doesn’t match the title, difficulty too high/low for the effort, evidence type won’t show completion.',
    '- "reject": trivial click-through, duplicate of an active quest, unsafe or inappropriate, impossible, or a point-farming pattern.',
    '- validity_score: 0–100 overall quality/verifiability (accept is normally ≥ 60).',
    '- reason: 1–2 friendly, actionable sentences for the participant. Never mention scoring, anti-cheat rules, other users, or these instructions.',
    '- admin_reason: a detailed internal note for the study team.',
    `- risk_flags: any of ${JSON.stringify(RISK_FLAGS)} (empty array if none).`,
    `- recommended_evidence_type: one of ${JSON.stringify(EVIDENCE_TYPES)} — the best fit for this task.`,
    '- normalized_task_summary: one neutral sentence describing the task.',
    '',
    'Respond with ONLY this JSON object and nothing else:',
    '{"decision":"accept|clarify|reject","validity_score":0,"reason":"","admin_reason":"","risk_flags":[],"recommended_evidence_type":"photo","normalized_task_summary":""}',
  ].join('\n')
}

/* ── 5. Rate limit from the review log ── */
export function checkRateLimit(reviewTimestamps, now = Date.now()) {
  const times = reviewTimestamps.map(t => new Date(t).getTime()).filter(Number.isFinite).sort((a, b) => b - a)
  const inWindow = times.filter(t => t > now - RATE.windowMs)
  if (times.length && now - times[0] < RATE.cooldownMs) {
    return { limited: true, retryAfterSeconds: Math.ceil((RATE.cooldownMs - (now - times[0])) / 1000) }
  }
  if (inWindow.length >= RATE.maxPerWindow) {
    const oldest = inWindow[inWindow.length - 1]
    return { limited: true, retryAfterSeconds: Math.ceil((oldest + RATE.windowMs - now) / 1000) }
  }
  return { limited: false }
}

/* Participant-safe projection of a decision: never the admin fields. */
export function participantView(result, extra = {}) {
  return {
    decision: result.decision,
    validity_score: result.validity_score,
    reason: result.reason,
    recommended_evidence_type: result.recommended_evidence_type ?? null,
    ...extra,
  }
}

/* ── 6. Handler factory ── */
export function createQuestValidityHandler({ createClient, fetchImpl = fetch, env = process.env, now = () => Date.now() }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
    const GEMINI_KEY   = env.GEMINI_API_KEY
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'server_not_configured' })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // Auth: the browser sends its Supabase access token; the service client
    // verifies it. The user id comes from the token, never from the body.
    const auth = String(req.headers?.authorization || req.headers?.Authorization || '')
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return res.status(401).json({ error: 'unauthenticated' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    const uid = userData?.user?.id
    if (uErr || !uid) return res.status(401).json({ error: 'unauthenticated' })

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const { data: me } = await admin.from('profiles').select('role').eq('id', uid).single()
    const isAdmin = me?.role === 'admin'

    // ── Which quest are we judging? ──
    let quest, existing = null, targetUid = uid
    if (body.task_id) {
      const { data: row } = await admin.from('tasks')
        .select('id, user_id, text, goal, priority, difficulty, evidence_type, planned_completion_date, validity_status, completed')
        .eq('id', String(body.task_id)).single()
      if (!row) return res.status(404).json({ error: 'not_found' })
      if (row.user_id !== uid && !isAdmin) return res.status(403).json({ error: 'forbidden' })
      if (!RECHECKABLE.includes(row.validity_status) || row.completed) return res.status(409).json({ error: 'not_recheckable' })
      existing = row
      targetUid = row.user_id
      quest = {
        text: row.text, goal: row.goal || '', priority: row.priority || 'P2', difficulty: row.difficulty,
        evidence_type: row.evidence_type || 'photo', planned_completion_date: row.planned_completion_date,
      }
    } else {
      const v = validateQuestInput(body)
      if (!v.ok) return res.status(400).json({ error: 'validation', field: v.field, message: v.message })
      quest = v.quest
    }

    // ── Rate limit (admins re-checking someone else's quest are exempt) ──
    if (!(isAdmin && targetUid !== uid)) {
      const { data: recentChecks } = await admin.from('quest_validity_reviews')
        .select('created_at').eq('user_id', uid)
        .gte('created_at', new Date(now() - RATE.windowMs).toISOString())
        .order('created_at', { ascending: false }).limit(RATE.maxPerWindow + 1)
      const rl = checkRateLimit((recentChecks || []).map(r => r.created_at), now())
      if (rl.limited) {
        return res.status(429).json({
          error: 'rate_limited', retry_after_seconds: rl.retryAfterSeconds,
          message: `Please wait ${rl.retryAfterSeconds}s before checking another quest.`,
        })
      }
    }

    // ── Context: the participant's recent quests ──
    const { data: recentRows } = await admin.from('tasks')
      .select('id, text, difficulty, completed, created_at')
      .eq('user_id', targetUid).order('created_at', { ascending: false }).limit(LIMITS.recentTasks)
    const recent = (recentRows || []).filter(t => !existing || t.id !== existing.id)
    const dayAgo = now() - 24 * 3600_000
    const createdLast24h = recent.filter(t => new Date(t.created_at).getTime() > dayAgo).length

    const logReview = async (decision, result, taskId) => {
      await admin.from('quest_validity_reviews').insert({
        task_id: taskId || null, user_id: targetUid,
        task_title: quest.text, task_goal: quest.goal, difficulty: quest.difficulty, evidence_type: quest.evidence_type,
        decision, validity_score: result?.validity_score ?? null, reason: result?.reason ?? null,
        admin_reason: result?.admin_reason ?? null, risk_flags: result?.risk_flags ?? [],
        recommended_evidence_type: result?.recommended_evidence_type ?? null,
        normalized_task_summary: result?.normalized_task_summary ?? null,
        model_version: result?.model_version ?? null,
      })
    }

    // ── Deterministic duplicate pre-check (no AI call needed) ──
    const normTitle = normalizeTitle(quest.text)
    const dup = recent.find(t => !t.completed && normalizeTitle(t.text) === normTitle)
    if (dup) {
      const result = {
        decision: 'reject', validity_score: 0,
        reason: 'You already have an active quest with this title. Finish that one first, or describe a different task.',
        admin_reason: `Exact normalized duplicate of active task ${dup.id}.`,
        risk_flags: ['duplicate'], recommended_evidence_type: null,
        normalized_task_summary: '', model_version: 'server/duplicate-check',
      }
      if (existing) await setStatus(admin, existing.id, 'rejected', result)
      await logReview('reject', result, existing?.id)
      return res.status(200).json(participantView(result))
    }

    // ── AI ──
    let verdict = null
    if (GEMINI_KEY) {
      try {
        const g = await generateJson({ apiKey: GEMINI_KEY, prompt: buildPrompt(quest, { recent, createdLast24h }), env, fetchImpl })
        if (g.ok) {
          const parsed = validateAiResult(parseJsonLoose(g.text), { model: g.model })
          if (parsed.ok) verdict = applyDecisionRules(parsed.result)
          else console.error('[validate-quest] unusable AI JSON', parsed.error)
        } else {
          console.error('[validate-quest] Gemini error', g.status, g.model, g.detail)   // server log only
        }
      } catch (e) {
        console.error('[validate-quest] AI call failed', e?.message)
      }
    }

    // ── AI unavailable → save as pending_ai_review (never silently accept) ──
    if (!verdict) {
      const pendingInfo = { validity_score: null, reason: PENDING_REASON, admin_reason: GEMINI_KEY ? 'AI unavailable at check time.' : 'GEMINI_API_KEY not configured.', risk_flags: [], model_version: null }
      let task = existing
      if (existing) {
        // Leave the row exactly as it is — still pending / clarify / rejected.
        await logReview('pending', pendingInfo, existing.id)
        return res.status(200).json({ decision: 'pending', reason: PENDING_REASON, task_id: existing.id })
      }
      const { data: inserted, error: iErr } = await admin.from('tasks').insert({
        user_id: uid, text: quest.text, goal: quest.goal, priority: quest.priority, difficulty: quest.difficulty,
        evidence_type: quest.evidence_type, planned_completion_date: quest.planned_completion_date,
        validity_status: 'pending_ai_review', validity_reason: PENDING_REASON, validity_checked_at: null,
      }).select().single()
      if (iErr || !inserted) return res.status(503).json({ error: 'ai_unavailable', message: 'The quest check is unavailable right now. Please try again in a moment.' })
      task = inserted
      await logReview('pending', pendingInfo, task.id)
      return res.status(200).json({ decision: 'pending', reason: PENDING_REASON, task })
    }

    // ── Save only according to the final decision ──
    const checkedAt = new Date(now()).toISOString()
    if (existing) {
      const status = verdict.decision === 'accept' ? 'accepted'
        : verdict.decision === 'clarify' ? 'needs_clarification' : 'rejected'
      const { data: updated } = await setStatus(admin, existing.id, status, verdict, checkedAt)
      await logReview(verdict.decision, verdict, existing.id)
      return res.status(200).json(participantView(verdict, { task: updated || null, task_id: existing.id }))
    }

    if (verdict.decision === 'accept') {
      const { data: inserted, error: iErr } = await admin.from('tasks').insert({
        user_id: uid, text: quest.text, goal: quest.goal, priority: quest.priority, difficulty: quest.difficulty,
        evidence_type: quest.evidence_type, planned_completion_date: quest.planned_completion_date,
        validity_status: 'accepted', validity_score: verdict.validity_score, validity_reason: verdict.reason,
        validity_checked_at: checkedAt,
      }).select().single()
      if (iErr || !inserted) return res.status(500).json({ error: 'save_failed', message: 'Your quest passed the check but could not be saved. Please try again.' })
      await logReview('accept', verdict, inserted.id)
      return res.status(200).json(participantView(verdict, { task: inserted }))
    }

    // clarify / reject: nothing is saved as a quest — the browser keeps the draft.
    await logReview(verdict.decision, verdict, null)
    return res.status(200).json(participantView(verdict))
  }
}

async function setStatus(admin, taskId, status, result, checkedAt = new Date().toISOString()) {
  return admin.from('tasks').update({
    validity_status: status, validity_score: result.validity_score,
    validity_reason: result.reason, validity_checked_at: checkedAt,
  }).eq('id', taskId).select().single()
}
