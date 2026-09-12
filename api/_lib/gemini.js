/*
 * Gemini text helper shared by the Phase 12 quest-validity endpoint.
 *
 * Vercel ignores files under an underscore-prefixed folder inside /api, so this
 * is a plain module, not an endpoint. api/verify.js keeps its own (identical in
 * spirit) model resolver on purpose — the verification pipeline is left
 * untouched by Phase 12; consolidate the two in a later pass if wanted.
 *
 * Model resolution mirrors verify.js: an explicit GEMINI_MODEL env var wins,
 * otherwise ask ListModels for a current text "flash" model (Google retires
 * pinned names over time). Cached per warm instance.
 */

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'
const TRANSIENT  = new Set([429, 500, 502, 503, 504])
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let cachedModel = null

export async function resolveModel({ apiKey, env = process.env, fetchImpl = fetch } = {}) {
  if (env.GEMINI_MODEL) return env.GEMINI_MODEL
  if (cachedModel) return cachedModel
  try {
    const r = await fetchImpl(`${GEMINI_API}/models?key=${apiKey}&pageSize=100`)
    if (r.ok) {
      const models = (await r.json()).models || []
      const usable = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      const flash = usable.filter(m => /flash/i.test(m.name)
        && !/(tts|image|audio|live|robotics|computer|omni|nano|lyria|vision|thinking)/i.test(m.name))
      const pick =
        flash.find(m => /gemini-flash-latest$/.test(m.name)) ||
        flash.find(m => !/preview/i.test(m.name)) ||
        flash[0] || usable[0]
      if (pick) { cachedModel = pick.name.replace(/^models\//, ''); return cachedModel }
    }
  } catch { /* fall through */ }
  return 'gemini-flash-latest'
}

/*
 * Ask Gemini for a JSON answer. Tries the resolved model with a short backoff on
 * transient overload, then falls through the same stable Flash chain verify.js
 * uses. Total budget is deliberately small (2 attempts × ≤3 models, ~0.6s
 * backoff) so the serverless function answers well inside the browser's
 * timeout — the caller treats any failure as "AI unavailable", never as accept.
 *
 * Returns { ok: true, text, model } or { ok: false, status, model, detail }.
 * `detail` is for server logs only; never send it to the browser.
 */
export async function generateJson({ apiKey, prompt, temperature = 0.2, env = process.env, fetchImpl = fetch }) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  })
  const primary = await resolveModel({ apiKey, env, fetchImpl })
  const candidates = [...new Set([primary, 'gemini-flash-lite-latest', 'gemini-2.5-flash'])]

  let resp = null, model = primary
  outer: for (const m of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      model = m
      try {
        resp = await fetchImpl(`${GEMINI_API}/models/${m}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      } catch (e) {
        resp = null
        break outer                                   // network failure → give up quickly
      }
      if (resp.ok) break outer
      if (!TRANSIENT.has(resp.status)) break          // bad key / model → next model, no retry
      await sleep(600 * (attempt + 1))
    }
  }

  if (!resp || !resp.ok) {
    let detail = ''
    try {
      const t = resp ? await resp.text() : 'network_error'
      try { detail = JSON.parse(t)?.error?.message || t } catch { detail = t }
    } catch { /* ignore */ }
    return { ok: false, status: resp?.status ?? 0, model, detail: String(detail).slice(0, 300) }
  }

  const data = await resp.json().catch(() => null)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return { ok: true, text, model }
}

/* Tolerate stray prose around the JSON object. Returns null when unparseable. */
export function parseJsonLoose(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try { return JSON.parse(raw) } catch { /* fall through */ }
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}
