/**
 * Route-guard decisions — pure, so they can be unit-tested under `node --test`
 * without a renderer. `AuthGate` in the root layout applies the result.
 *
 * SECURITY NOTE
 * These guards are navigation only. They stop an ordinary participant from
 * *reaching* an admin screen, but they are not what protects admin data — that
 * is Supabase RLS (`is_admin()` on `quest_validity_reviews`, `user_snapshots`,
 * `cheat_events`) plus the server-side role checks in the Vercel functions. A
 * client can always be tampered with; the guard is UX, the database is the
 * control. See MOBILE_MIGRATION_MAP.md §3.
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/** Routes, as one place to change them. */
export const Routes = {
  login: '/(auth)/login',
  home: '/',
  admin: '/admin',
} as const;

export type RouteTarget = (typeof Routes)[keyof typeof Routes];

export type GuardInput = {
  status: AuthStatus;
  /** True only when the loaded profile says `role = 'admin'`. */
  isAdmin: boolean;
  /** Expo Router's `useSegments()` for the current route. */
  segments: string[];
};

export const isAuthRoute = (segments: string[]) => segments[0] === '(auth)';
export const isAdminRoute = (segments: string[]) => segments[0] === 'admin';

/**
 * Where the user should be sent, or `null` to stay put.
 *
 *   loading    → stay; the layout renders the restoring-session screen.
 *   signedOut  → anywhere but the auth group sends you to login.
 *   signedIn   → the auth group sends you home; an admin route you are not an
 *                admin for sends you home.
 */
export function resolveRedirect({ status, isAdmin, segments }: GuardInput): RouteTarget | null {
  if (status === 'loading') return null;

  if (status === 'signedOut') {
    return isAuthRoute(segments) ? null : Routes.login;
  }

  // signedIn
  if (isAuthRoute(segments)) return Routes.home;
  if (isAdminRoute(segments) && !isAdmin) return Routes.home;
  return null;
}

/**
 * Whether the session-restoring screen should cover the app.
 *
 * It is shown only while the status is genuinely unknown. Once we know the user
 * is signed out we render the login screen, even though a profile fetch may
 * still be in flight — waiting on that would leave a signed-out participant
 * staring at a spinner.
 */
export const shouldShowRestoring = (status: AuthStatus) => status === 'loading';

/**
 * Map a Supabase auth error to something worth showing a participant.
 *
 * Supabase returns "Invalid login credentials" for both a wrong password and an
 * unknown email — deliberately, so the form cannot be used to discover which
 * addresses are registered. We keep that property.
 */
export function friendlyAuthError(message: string | null | undefined): string {
  const raw = (message ?? '').trim();
  if (!raw) return 'Something went wrong. Please try again.';

  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Invalid email or password.';
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return raw;
}

/** Client-side form validation, mirroring the web login page's rules. */
export function validateCredentials(email: string, password: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!password.trim()) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}
