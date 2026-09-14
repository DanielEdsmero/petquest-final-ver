/*
 * Minimal in-memory stand-in for the supabase-js service client, just enough
 * for api/_lib/quest-validity.js: auth.getUser, from().select/insert/update
 * with eq/gte/in/order/limit/single. Records every insert/update so tests can
 * assert what would have been written.
 */
export function createFakeSupabase({ users = {}, profiles = {}, tasks = [], reviews = [], completions = [], signedUrls = {} } = {}) {
  const db = { profiles, tasks: [...tasks], quest_validity_reviews: [...reviews], quest_completions: [...completions] }
  const writes = []
  let seq = 0

  function builder(table) {
    const st = { op: 'select', filters: [], order: null, limit: null, single: false, payload: null }
    const rows = () => {
      if (table === 'profiles') {
        return Object.entries(db.profiles).map(([id, p]) => ({ id, ...p }))
      }
      return db[table] || []
    }
    const apply = (list) => {
      let out = list.filter(r => st.filters.every(f =>
        f.kind === 'eq' ? r[f.col] === f.val
        : f.kind === 'gte' ? r[f.col] >= f.val
        : f.kind === 'in' ? f.val.includes(r[f.col])
        : true))
      if (st.order) out = [...out].sort((a, b) => (a[st.order.col] < b[st.order.col] ? -1 : 1) * (st.order.asc ? 1 : -1))
      if (st.limit != null) out = out.slice(0, st.limit)
      return out
    }
    const exec = () => {
      if (st.op === 'insert') {
        const row = { id: `row_${++seq}`, created_at: new Date().toISOString(), ...st.payload }
        ;(db[table] ||= []).push(row)
        writes.push({ table, op: 'insert', row })
        return { data: st.single ? row : [row], error: null }
      }
      if (st.op === 'update') {
        const targets = apply(rows())
        targets.forEach(r => Object.assign(r, st.payload))
        writes.push({ table, op: 'update', rows: targets, patch: st.payload })
        return { data: st.single ? (targets[0] || null) : targets, error: null }
      }
      const out = apply(rows())
      if (st.single) return { data: out[0] || null, error: out[0] ? null : { message: 'not found' } }
      return { data: out, error: null }
    }
    const b = {
      select() { return b },
      insert(p) { st.op = 'insert'; st.payload = p; return b },
      update(p) { st.op = 'update'; st.payload = p; return b },
      eq(col, val) { st.filters.push({ kind: 'eq', col, val }); return b },
      gte(col, val) { st.filters.push({ kind: 'gte', col, val }); return b },
      in(col, val) { st.filters.push({ kind: 'in', col, val }); return b },
      order(col, o) { st.order = { col, asc: o?.ascending !== false }; return b },
      limit(n) { st.limit = n; return b },
      single() { st.single = true; return b },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
    }
    return b
  }

  const client = {
    auth: { getUser: async (token) => users[token] ? { data: { user: { id: users[token] } }, error: null } : { data: { user: null }, error: { message: 'bad token' } } },
    from: (table) => builder(table),
    /* Records the call and succeeds. api/_lib/verify.js relies on
       rollback_completion actually resolving, so tests can assert it fired. */
    rpc: async (name, args) => { writes.push({ op: 'rpc', name, args }); return { data: { ok: true }, error: null } },
    /* Signed URLs for the private quest-proofs bucket. `signedUrls` maps a
       storage path to the URL the fetch stub should be asked for; a path that
       is absent returns no URL, which is how "photo unavailable" is exercised. */
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, expiresIn) => {
          writes.push({ op: 'signedUrl', bucket, path, expiresIn })
          const url = signedUrls[path]
          return url
            ? { data: { signedUrl: url }, error: null }
            : { data: null, error: { message: 'object not found' } }
        },
      }),
    },
  }
  return { client, db, writes, createClient: () => client }
}

/*
 * A fetch stub for the proof-photo download.
 *
 * `bytes` sets the size of the body, which is what the blank-frame guard in
 * api/_lib/verify.js measures — pass something under MIN_PROOF_BYTES (3000) to
 * exercise it. Any request that is not the signed URL falls through to
 * `geminiResult`, so one stub can serve both legs of the verification.
 */
export function proofAndGeminiFetch({
  signedUrl,
  bytes = 50_000,
  contentType = 'image/jpeg',
  geminiResult = { verdict: 'pass', confidence: 0.9, reason: 'Looks done.' },
  geminiStatus = 200,
  imageOk = true,
} = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    if (url === signedUrl) {
      return {
        ok: imageOk,
        status: imageOk ? 200 : 404,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
        arrayBuffer: async () => new ArrayBuffer(bytes),
      }
    }
    if (geminiStatus !== 200) {
      return { ok: false, status: geminiStatus, text: async () => 'overloaded', json: async () => ({}) }
    }
    const text = typeof geminiResult === 'string' ? geminiResult : JSON.stringify(geminiResult)
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
      text: async () => '',
    }
  }
  fn.calls = calls
  /** Requests that went to Gemini rather than the photo. */
  fn.geminiCalls = () => calls.filter((c) => String(c.url).includes('generativelanguage'))
  return fn
}

/* Vercel-style res shim capturing status + body. */
export function makeRes() {
  const r = { statusCode: 200, body: null }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}

/* A fetch stub for Gemini: returns the given JSON object as the model text. */
export function geminiFetch(resultObj, { status = 200, throwNetwork = false } = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    if (throwNetwork) throw new Error('fetch failed')
    if (status !== 200) return { ok: false, status, text: async () => 'overloaded', json: async () => ({}) }
    const text = typeof resultObj === 'string' ? resultObj : JSON.stringify(resultObj)
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }), text: async () => '' }
  }
  fn.calls = calls
  return fn
}
