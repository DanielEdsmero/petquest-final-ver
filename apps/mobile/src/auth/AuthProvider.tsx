import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { friendlyAuthError, type AuthStatus } from '@/auth/guards';
import { startAutoRefresh, supabase } from '@/lib/supabase';

/**
 * The single source of auth truth for the mobile app.
 *
 * Mirrors the web app's model exactly — same Supabase Auth, same `profiles`
 * row, same `role` column — so a participant's account behaves identically on
 * both clients. Nothing here decides permissions; it only reports what the
 * server said, and RLS enforces it.
 */

export type Profile = {
  id: string;
  username: string | null;
  role: 'user' | 'admin';
  selected_pet_id: string | null;
  pet_level: number | null;
  /* Progression — all server-authoritative. The client never computes these;
     `complete_task` is the only thing that moves them. */
  points: number | null;
  total_points_earned: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  game_mode: string | null;
  /* Period anchors for the Medium / Hard quest caps. */
  hard_period_start: string | null;
  medium_period_start: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** A profile fetch is in flight after a session was restored. */
  profileLoading: boolean;
  /**
   * A sign-in is in flight — from the moment the request starts until the
   * profile has loaded (or the request failed). Drives the account-loading
   * gate so the wake-up animation and the network run in parallel.
   */
  signingIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_COLUMNS =
  'id, username, role, selected_pet_id, pet_level, points, total_points_earned, ' +
  'current_streak, longest_streak, game_mode, hard_period_start, medium_period_start';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  /** Guards against a slow profile fetch resolving after sign-out. */
  const activeUserId = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .single();

    // The user may have signed out, or signed in as someone else, while this
    // was in flight — discard a result that is no longer for the current user.
    if (!mounted.current || activeUserId.current !== userId) return;

    setProfileLoading(false);
    setSigningIn(false); // the account is loaded (or failed to); the gate may reveal
    if (error) {
      // A missing or unreadable profile must not crash the app or strand the
      // participant on a loading screen. They stay signed in with no role,
      // which means no admin access — failing closed.
      console.warn('[auth] profile load failed:', error.message);
      setProfile(null);
      return;
    }
    // No generated Supabase schema types in this project, so the row shape
    // cannot be inferred from the select string; `Profile` above is the
    // hand-maintained mirror of PROFILE_COLUMNS.
    setProfile((data ?? null) as unknown as Profile | null);
  }, []);

  /** Restore any stored session, then follow Supabase's auth events. */
  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn('[auth] getSession failed:', error.message);

        const restored = data?.session ?? null;
        activeUserId.current = restored?.user?.id ?? null;
        setSession(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
        if (restored?.user?.id) void loadProfile(restored.user.id);
      })
      .catch((e: unknown) => {
        // A corrupt or unreadable keychain entry must land on the login screen,
        // not a crash.
        if (cancelled) return;
        console.warn('[auth] session restore threw:', e);
        activeUserId.current = null;
        setSession(null);
        setStatus('signedOut');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;

      activeUserId.current = next?.user?.id ?? null;
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');

      if (event === 'SIGNED_OUT' || !next) {
        // Covers an explicit sign-out AND a refresh token that could not be
        // renewed — an expired session lands on the login screen.
        setProfile(null);
        setProfileLoading(false);
        setSigningIn(false);
        return;
      }

      // Reload the profile on sign-in and on a user change, but not on every
      // token refresh — that fires hourly and the role does not change with it.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (next.user?.id) void loadProfile(next.user.id);
      }
    });

    const stopAutoRefresh = startAutoRefresh();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Flip BEFORE the network call so the wake-up loader mounts at request
    // start and the two run in parallel. A failure clears it immediately —
    // nobody is held behind an animation with nothing to reveal. On success
    // loadProfile() clears it once the account has actually arrived.
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setSigningIn(false);
      return { error: friendlyAuthError(error.message) };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    // Clear local state first so the guard redirects on this render, then tear
    // down the session — the same ordering the web app uses.
    setProfile(null);
    setSession(null);
    setStatus('signedOut');
    setSigningIn(false);
    activeUserId.current = null;
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('[auth] signOut failed:', error.message);
  }, []);

  const refreshProfile = useCallback(async () => {
    const id = activeUserId.current;
    if (id) await loadProfile(id);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      // Admin only when the server-sent row says so. Anything else — no profile,
      // a failed fetch, an unexpected value — is not an admin.
      isAdmin: profile?.role === 'admin',
      profileLoading,
      signingIn,
      signIn,
      signOut,
      refreshProfile,
    }),
    [status, session, profile, profileLoading, signingIn, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
