/*
 * Display-only preview of a pet stage that no account has reached yet, for
 * looking at new art. Open any page with ?preview=dragon-2 (pet-level) and it
 * is remembered for the tab; ?preview=off clears it. It never writes to the
 * profile or Supabase: it only changes which pet and stage the UI draws.
 */
const KEY = 'pq_preview'

export function parsePreview(text) {
  const m = /^(dragon|cat|wolf)-([1-5])$/.exec(text || '')
  return m ? { petId: m[1], level: Number(m[2]) } : null
}

export function readPreview(search = '', store = null) {
  try {
    const q = new URLSearchParams(search).get('preview')
    if (q === 'off') { store?.removeItem(KEY); return null }
    if (q && parsePreview(q)) { store?.setItem(KEY, q); return parsePreview(q) }
    return parsePreview(store?.getItem(KEY))
  } catch { return null }
}
