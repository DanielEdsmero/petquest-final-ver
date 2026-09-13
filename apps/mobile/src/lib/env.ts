/**
 * Public mobile configuration.
 *
 * SECURITY CONTRACT — read before adding anything here.
 * Everything prefixed `EXPO_PUBLIC_` is inlined into the JavaScript bundle at
 * build time and is readable by anyone with the app. Only values that are
 * public by design may live here:
 *
 *   • Supabase project URL      — public; Row Level Security is the control.
 *   • Supabase anon key         — public by design, same as the web client.
 *   • API base URL              — just the Vercel origin.
 *
 * NEVER put these in the mobile app, in any form, prefixed or not:
 *   • SUPABASE_SERVICE_ROLE_KEY — bypasses every RLS policy.
 *   • GEMINI_API_KEY            — billable, and grants raw model access.
 *
 * Both live only in Vercel's server-side environment and are used only by
 * api/verify.js and api/_lib/*.js. The mobile app reaches Gemini exclusively
 * through the server endpoints, which verify the caller's Supabase token.
 */

const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
} as const;

export const Env = {
  supabaseUrl: raw.supabaseUrl ?? '',
  supabaseAnonKey: raw.supabaseAnonKey ?? '',
  apiBaseUrl: (raw.apiBaseUrl ?? '').replace(/\/+$/, ''),
} as const;

/** Which public values are missing, for the setup hints on the home screen. */
export function missingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!Env.supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!Env.supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!Env.apiBaseUrl) missing.push('EXPO_PUBLIC_API_BASE_URL');
  return missing;
}

export const isEnvConfigured = () => missingEnvKeys().length === 0;

/**
 * The project ref, shown on the setup screen so you can confirm the app points
 * at the right Supabase project without ever rendering the key itself.
 */
export function supabaseProjectRef(): string | null {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(Env.supabaseUrl);
  return m ? m[1] : null;
}
