import { createClient } from '@supabase/supabase-js'

/*
 * Vercel serverless AI verification proxy.
 *
 * The browser is untrusted, so the Gemini key and the Supabase SERVICE ROLE key
 * live ONLY here (server-side env vars). The client calls POST /api/verify with
 * a completion_id; this function loads the completion + quest, signs the private
 * proof photo, asks Gemini whether the photo plausibly shows the quest done,
 * writes the verdict service-side (never trusting the client), and — on a FAIL —
 * reverses the provisional award via rollback_completion.
 *
 * Required Vercel env vars (server-side, NOT VITE_):
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY   = process.env.GEMINI_API_KEY
const GEMINI_API   = 'https://generativelanguage.googleapis.com/v1beta'

/*
 * Model resolution. Google retires model names over time (1.5-flash, 2.0-flash
 * are both gone), so instead of hardcoding one we ask the API which models this
 * key can actually use and pick a current "flash" one. An explicit GEMINI_MODEL
 * env var always wins. Cached per warm serverless instance.
 */
let cachedModel = null
async function resolveModel() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL
  if (cachedModel) return cachedModel
  try {
    const r = await fetch(`${GEMINI_API}/models?key=${GEMINI_KEY}&pageSize=100`)
    if (r.ok) {
      const models = (await r.json()).models || []
      const usable = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      // Plain text/vision flash models only — exclude image/tts/audio/etc variants.
      const flash = usable.filter(m => /flash/i.test(m.name)
        && !/(tts|image|audio|live|robotics|computer|omni|nano|lyria|vision|thinking)/i.test(m.name))
      // Prefer the stable "-latest" alias (never retired), then a non-preview
      // flash, then anything usable. Pinned versions get deprecated for new keys.
      const pick =
        flash.find(m => /gemini-flash-latest$/.test(m.name)) ||
        flash.find(m => !/preview/i.test(m.name)) ||
        flash[0] || usable[0]
      if (pick) { cachedModel = pick.name.replace(/^models\//, ''); return cachedModel }
    }
  } catch { /* fall through to a best-effort default */ }
  return 'gemini-flash-latest'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'server_not_configured' })
  }

  const completionId = req.body?.completion_id
  if (!completionId) return res.status(400).json({ error: 'missing_completion_id' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 1. Load the completion + its quest text.
  const { data: completion, error: cErr } = await admin
    .from('quest_completions')
    .select('id, quest_id, proof_photo_url, progress_log')
    .eq('id', completionId)
    .single()
  if (cErr || !completion) return res.status(404).json({ error: 'completion_not_found' })

  const { data: quest } = await admin
    .from('tasks').select('text').eq('id', completion.quest_id).single()
  const questText = quest?.text || 'the quest'

  // Helper: persist the verdict service-side and respond.
  const finish = async (verdict, confidence, reason, httpStatus = 200) => {
    await admin.from('quest_completions')
      .update({ ai_verdict: verdict, ai_confidence: confidence, ai_reason: reason })
      .eq('id', completionId)
    if (verdict === 'fail') {
      await admin.rpc('rollback_completion', { p_completion_id: completionId, p_reason: 'ai_rejected' })
    }
    return res.status(httpStatus).json({ verdict, confidence, reason })
  }

  // If AI isn't configured, fall back to "needs manual review" (provisional award stays).
  if (!GEMINI_KEY) {
    return finish('error', null, 'AI not configured — queued for manual review.')
  }

  try {
    // 2. Sign the private photo and fetch its bytes.
    let imagePart = null
    if (completion.proof_photo_url) {
      const { data: signed } = await admin.storage
        .from('quest-proofs').createSignedUrl(completion.proof_photo_url, 60)
      if (signed?.signedUrl) {
        const imgResp = await fetch(signed.signedUrl)
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer())
          const mime = imgResp.headers.get('content-type') || 'image/jpeg'
          imagePart = { inline_data: { mime_type: mime, data: buf.toString('base64') } }
        }
      }
    }
    if (!imagePart) return finish('error', null, 'Proof photo unavailable — queued for manual review.')

    // 3. Ask Gemini for a JSON verdict.
    const prompt =
      `You are a quest verification AI for a productivity app.\n` +
      `The user claims they completed this quest: "${questText}"\n` +
      `They provided this description: "${completion.progress_log}"\n` +
      `They uploaded the attached photo as evidence.\n\n` +
      `Evaluate: does the photo plausibly show evidence of completing this quest? ` +
      `Consider relevance, plausibility, and whether it looks staged or generic.\n` +
      `Respond with ONLY JSON: {"verdict":"pass"|"fail","confidence":0.0-1.0,"reason":"short explanation"}`

    const model = await resolveModel()
    const url = `${GEMINI_API}/models/${model}:generateContent?key=${GEMINI_KEY}`
    const gResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, imagePart] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    })

    if (!gResp.ok) {
      // Surface the real Gemini error (status + message) so the admin queue
      // shows the actual cause instead of a generic "AI service error".
      let detail = ''
      try {
        const errText = await gResp.text()
        try { detail = JSON.parse(errText)?.error?.message || errText } catch { detail = errText }
      } catch { /* ignore */ }
      console.error('[verify] Gemini error', gResp.status, model, detail)
      return finish('error', null, `AI error ${gResp.status} (${model}): ${String(detail).slice(0, 300)}`)
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
    return finish('error', null, 'Verification failed — queued for manual review.')
  }
}
