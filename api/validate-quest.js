import { createClient } from '@supabase/supabase-js'
import { createQuestValidityHandler } from './_lib/quest-validity.js'

/*
 * Vercel serverless — Phase 12 quest validity check (POST /api/validate-quest).
 *
 * The browser sends the quest draft + its Supabase access token. This function
 * validates the fields server-side, asks Gemini for a structured verdict, and
 * saves the quest ONLY according to the final decision (service role — the
 * browser can never write a validity status; see supabase-phase12). All logic
 * lives in ./_lib/quest-validity.js so it can be unit-tested without Vercel.
 *
 * Required Vercel env vars (server-side, NOT VITE_):
 *   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (optional: GEMINI_MODEL)
 */
export default createQuestValidityHandler({ createClient })
