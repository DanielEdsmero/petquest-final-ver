/*
 * Minimal in-memory stand-in for the supabase-js service client, just enough
 * for api/_lib/quest-validity.js: auth.getUser, from().select/insert/update
 * with eq/gte/in/order/limit/single. Records every insert/update so tests can
 * assert what would have been written.
 */
export function createFakeSupabase({ users = {}, profiles = {}, tasks = [], reviews = [] } = {}) {
  const db = { profiles, tasks: [...tasks], quest_validity_reviews: [...reviews] }
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
    rpc: async (name) => { writes.push({ op: 'rpc', name }); return { data: null, error: { message: 'rpc not expected' } } },
  }
  return { client, db, writes, createClient: () => client }
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
