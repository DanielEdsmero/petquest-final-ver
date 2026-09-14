import { createClient } from '@supabase/supabase-js'
import { createVerifyHandler } from './_lib/verify.js'

/*
 * Vercel serverless AI verification proxy (POST /api/verify).
 *
 * The browser and the mobile app are both untrusted, so the Gemini key and the
 * Supabase SERVICE ROLE key live ONLY here (server-side env vars). A client
 * sends its Supabase access token plus a completion_id; this function verifies
 * the token, checks the caller owns that completion (or is an admin), signs the
 * private proof photo, asks Gemini whether it plausibly shows the quest done,
 * writes the verdict service-side, and — on a FAIL — reverses the provisional
 * award via rollback_completion.
 *
 * All logic lives in ./_lib/verify.js so it can be unit-tested without Vercel.
 * See that file for the auth, ownership, idempotency and rate-limit rules.
 *
 * Required Vercel env vars (server-side, NOT VITE_):
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (optional: GEMINI_MODEL)
 */
export default createVerifyHandler({ createClient })
