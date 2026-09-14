/*
 * Phase 13 — AI proof verification (POST /api/verify), hardened.
 *
 * WHAT CHANGED AND WHY
 * This endpoint used to accept `{ completion_id }` from anyone, with no token
 * and no ownership check. Since a `fail` verdict calls rollback_completion(),
 * any caller who learned a completion id could reverse another participant's
 * points — and every call spent a Gemini request. It was shielded only by
 * obscurity. This module adds, in order:
 *
 *   1. a required Supabase access token, verified with the service client;
 *   2. an ownership check — you may verify your own completion, an admin may
 *      verify any;
 *   3. idempotency — a completion that already holds a FINAL verdict
 *      (pass/fail) is not re-judged for a participant; the stored verdict is
 *      returned without touching Gemini. `pending` and `error` stay retryable,
 *      which is what the admin "re-run stuck" button relies on;
 *   4. a short per-user cooldown (best-effort, see RATE below).
 *
 * Unchanged on purpose: the blank-frame guard, the model fallback chain, the
 * participant-safe reason strings, and — most importantly — the failure
 * posture. An AI outage yields verdict 'error', which leaves the provisional
 * award in place for a human to review. It must never auto-approve and never
 * auto-reject.
 *
 * The logic lives here rather than in api/verify.js so it can be unit-tested
 * without Vercel, matching api/_lib/quest-validity.js.
 */

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'
const TRANSIENT = new Set([429, 500, 502, 503, 504])
const realSleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Verdicts a participant may trigger a (re-)check for. */
export const RETRYABLE_VERDICTS = ['pending', 'error']

/** A real JPEG is well over a few KB; a black/empty frame compresses to almost nothing. */
export const MIN_PROOF_BYTES = 3000

/**
 * Per-user cooldown between verification requests.
 *
 * Best-effort only: it lives in the warm instance's memory, so a cold start or
 * a second instance resets it. It is defence-in-depth, not the control — the
 * durable limits are the ownership check, the idempotency rule above, and the
 * 3-completions-in-60s burst lock inside complete_task(). Adding a persistent
 * counter would need a migration, which is out of scope here.
 */
export const RATE = { cooldownMs: 4000 }
const lastCallByUser = new Map()

export function checkCooldown(uid, now, store = lastCallByUser, cooldownMs = RATE.cooldownMs) {
  const previous = store.get(uid)
  if (previous != null && now - previous < cooldownMs) {
    return { ok: false, retryInMs: cooldownMs - (now - previous) }
  }
  store.set(uid, now)
  // Keep the map from growing without bound on a long-lived instance.
  if (store.size > 500) {
    for (const [key, at] of store) if (now - at > cooldownMs * 10) store.delete(key)
  }
  return { ok: true, retryInMs: 0 }
}

/** Reset hook for tests. */
export function _resetCooldowns() {
  lastCallByUser.clear()
}

/**
 * Decide whether this caller may verify this completion.
 * Pure, so the rules are testable without a client.
 */
export function authorizeVerify({ completion, uid, isAdmin }) {
  if (!completion) return { ok: false, status: 404, error: 'completion_not_found' }
  if (!isAdmin && completion.user_id !== uid) {
    // Deliberately the same shape as a genuine 403 rather than a 404: the
    // caller already supplied a valid token, so there is nothing to hide from
    // them about the existence of ids, and a clear error is easier to debug.
    return { ok: false, status: 403, error: 'forbidden' }
  }
  return { ok: true }
}

/**
 * Whether the stored verdict should simply be returned instead of re-judged.
 * Admins may always force a fresh run; participants may not re-roll a final one.
 */
export function shouldReuseVerdict({ completion, isAdmin }) {
  if (isAdmin) return false
  return !RETRYABLE_VERDICTS.includes(completion.ai_verdict ?? 'pending')
}

export function createVerifyHandler({
  createClient,
  fetchImpl = fetch,
  env = process.env,
  now = () => Date.now(),
  /* Injectable so tests exercise the retry chain without waiting out the real
     backoff — the delays are the point in production, not in a test run. */
  sleep = realSleep,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
    const GEMINI_KEY = env.GEMINI_API_KEY
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'server_not_configured' })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    /* ── 1. Who is calling? ──
       The uid comes from the verified token, never from the body. */
    const authHeader = String(req.headers?.authorization || req.headers?.Authorization || '')
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) return res.status(401).json({ error: 'unauthenticated' })

    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    const uid = userData?.user?.id
    if (uErr || !uid) return res.status(401).json({ error: 'unauthenticated' })

    const { data: me } = await admin.from('profiles').select('role').eq('id', uid).single()
    const isAdmin = me?.role === 'admin'

    const completionId = req.body?.completion_id
    if (!completionId) return res.status(400).json({ error: 'missing_completion_id' })

    /* ── 2. Load the completion and check ownership ── */
    const { data: completion } = await admin
      .from('quest_completions')
      .select('id, user_id, quest_id, proof_photo_url, progress_log, ai_verdict, ai_confidence, ai_reason')
      .eq('id', completionId)
      .single()

    const allowed = authorizeVerify({ completion, uid, isAdmin })
    if (!allowed.ok) return res.status(allowed.status).json({ error: allowed.error })

    /* ── 3. Already judged? Return it rather than spending a Gemini call ── */
    if (shouldReuseVerdict({ completion, isAdmin })) {
      return res.status(200).json({
        verdict: completion.ai_verdict,
        confidence: completion.ai_confidence ?? null,
        reason: completion.ai_reason || '',
        reused: true,
      })
    }

    /* ── 4. Cooldown (participants only; admins run the queue) ── */
    if (!isAdmin) {
      const cooldown = checkCooldown(uid, now())
      if (!cooldown.ok) {
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Please wait a moment before checking again.',
          retry_in_ms: cooldown.retryInMs,
        })
      }
    }

    const { data: quest } = await admin
      .from('tasks').select('text, goal').eq('id', completion.quest_id).single()
    const questText = quest?.text || 'the quest'
    const questGoal = quest?.goal || ''

    /* Persist the verdict service-side (with a timestamp) and respond. On a
       FAIL, reverse the provisional award — rollback_completion is granted to
       service_role only, which is why this must happen here. */
    const finish = async (verdict, confidence, reason, httpStatus = 200) => {
      await admin.from('quest_completions')
        .update({
          ai_verdict: verdict,
          ai_confidence: confidence,
          ai_reason: reason,
          ai_verdict_at: new Date(now()).toISOString(),
        })
        .eq('id', completionId)
      if (verdict === 'fail') {
        await admin.rpc('rollback_completion', { p_completion_id: completionId, p_reason: 'ai_rejected' })
      }
      return res.status(httpStatus).json({ verdict, confidence, reason })
    }

    // No AI configured → manual review. The provisional award stands.
    if (!GEMINI_KEY) return finish('error', null, 'AI not configured — queued for manual review.')

    try {
      /* ── 5. Sign the private photo and fetch its bytes ── */
      let imagePart = null
      if (completion.proof_photo_url) {
        const { data: signed } = await admin.storage
          .from('quest-proofs').createSignedUrl(completion.proof_photo_url, 60)
        if (signed?.signedUrl) {
          const imgResp = await fetchImpl(signed.signedUrl)
          if (imgResp.ok) {
            const buf = Buffer.from(await imgResp.arrayBuffer())
            // Server-side blank/placeholder guard. The web client also checks
            // this in a canvas, but a native client cannot, so this is the only
            // check that applies to every client.
            if (buf.length < MIN_PROOF_BYTES) {
              return finish('fail', 0, 'Image too small or blank — no real evidence detected.')
            }
            const mime = imgResp.headers.get('content-type') || 'image/jpeg'
            imagePart = { inline_data: { mime_type: mime, data: buf.toString('base64') } }
          }
        }
      }
      if (!imagePart) return finish('error', null, 'Proof photo unavailable — queued for manual review.')

      /* ── 6. Ask Gemini for a JSON verdict ── */
      const prompt =
        `You are a quest verification AI for a productivity app.\n` +
        `The user claims they completed this quest: "${questText}"\n` +
        (questGoal ? `Their stated goal (what "done" looks like): "${questGoal}"\n` : '') +
        `They provided this description: "${completion.progress_log}"\n` +
        `They uploaded the attached photo as evidence.\n\n` +
        `Evaluate: does the photo plausibly show evidence of completing this quest? ` +
        `Consider relevance, plausibility, and whether it looks staged or generic.\n` +
        `Respond with ONLY JSON: {"verdict":"pass"|"fail","confidence":0.0-1.0,"reason":"short explanation"}`

      const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }, imagePart] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      })
      const callModel = (m) => fetchImpl(`${GEMINI_API}/models/${m}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

      // Try the configured model with backoff on transient overload, then fall
      // through a chain of stable Flash models.
      const primary = env.GEMINI_MODEL || 'gemini-flash-latest'
      const candidates = [...new Set([primary, 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'])]
      let gResp, model
      outer: for (const m of candidates) {
        for (let attempt = 0; attempt < 3; attempt++) {
          model = m
          gResp = await callModel(m)
          if (gResp.ok) break outer
          if (!TRANSIENT.has(gResp.status)) break      // bad key/model → don't retry this one
          await sleep(700 * (attempt + 1))
        }
      }

      if (!gResp?.ok) {
        let detail = ''
        try {
          const errText = await gResp.text()
          try { detail = JSON.parse(errText)?.error?.message || errText } catch { detail = errText }
        } catch { /* ignore */ }
        console.error('[verify] Gemini error', gResp?.status, model, detail)
        // Any error → 'error': points stay provisional for manual review rather
        // than being flagged as fraud. Internal model names and HTTP codes are
        // logged above but NEVER surfaced to a client.
        return finish('error', null, 'AI service busy — queued for manual review.')
      }

      const gData = await gResp.json()
      const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      let parsed
      try { parsed = JSON.parse(raw) }
      catch {
        const m = raw.match(/\{[\s\S]*\}/)  // tolerate stray prose around the JSON
        parsed = m ? JSON.parse(m[0]) : null
      }
      if (!parsed || (parsed.verdict !== 'pass' && parsed.verdict !== 'fail')) {
        return finish('error', null, 'AI returned an unclear verdict — queued for manual review.')
      }

      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null
      return finish(parsed.verdict, confidence, String(parsed.reason || '').slice(0, 500))
    } catch (e) {
      console.error('[verify] unexpected failure:', e?.message)
      return finish('error', null, 'Verification failed — queued for manual review.')
    }
  }
}
