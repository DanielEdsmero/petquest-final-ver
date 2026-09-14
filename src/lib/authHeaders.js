import { supabase } from './supabase'

/*
 * Authorization header for the Vercel functions.
 *
 * Both /api/validate-quest and /api/verify verify this token with the service
 * client and derive the user id from it — never from the request body — so a
 * client cannot act as someone else. Every caller must send it; an unauthorised
 * request is rejected with 401.
 *
 * Returns an empty object when there is no session, which lets a caller fail
 * with a clean 401 rather than throwing here.
 */
export async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

/** `fetch` init for a JSON POST to one of the API routes, with the bearer token. */
export async function jsonPost(body, extra = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    ...extra,
  }
}
