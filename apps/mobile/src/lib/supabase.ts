// URL/URLSearchParams shims that supabase-js relies on. Must be imported before
// the client is constructed.
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { createChunkedStorage } from '@/lib/chunkedStorage';
import { Env, isEnvConfigured } from '@/lib/env';

/**
 * The Supabase client for the mobile app.
 *
 * Same project, same anon key and same Row Level Security as the web client —
 * this is a second front end, not a second backend. The service-role key is
 * never here; anything needing it goes through the Vercel functions, which
 * verify the caller's access token (see MOBILE_MIGRATION_MAP.md §6).
 *
 * Session storage is the iOS keychain / Android keystore via `expo-secure-store`,
 * wrapped in `createChunkedStorage` because a Supabase session exceeds
 * SecureStore's 2048-byte per-entry limit.
 */

/**
 * SecureStore keys must match [A-Za-z0-9._-]+. Supabase's default key is
 * `sb-<project-ref>-auth-token`, which already conforms, but the adapter is
 * shared so anything invalid is normalised rather than silently failing.
 */
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

const secureStore = {
  getItemAsync: (key: string) => SecureStore.getItemAsync(safeKey(key)),
  setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(safeKey(key), value),
  deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(safeKey(key)),
};

export const sessionStorage = createChunkedStorage(secureStore);

/**
 * `isEnvConfigured()` is false until the developer creates `.env`. Constructing
 * the client with empty strings throws, which would crash the app before it can
 * explain what is wrong — so fall back to a syntactically valid placeholder and
 * let the UI show the setup screen instead.
 */
const url = isEnvConfigured() ? Env.supabaseUrl : 'https://placeholder.supabase.co';
const anonKey = isEnvConfigured() ? Env.supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    // SecureStore has no web build; on web supabase-js falls back to localStorage (or memory during static render).
    storage: Platform.OS === 'web' ? undefined : sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No browser URL to parse a session out of — and leaving this on makes
    // supabase-js touch `window.location`, which does not exist in React Native.
    detectSessionInUrl: false,
  },
});

/**
 * Supabase refreshes the access token on a timer. That timer should not run
 * while the app is backgrounded (iOS suspends it anyway, and a stale timer
 * firing on resume wastes a request); instead, refresh when we come back to the
 * foreground. Without this, a session can look valid but carry an expired token
 * after the phone has been locked for a while.
 *
 * Returns an unsubscribe function; the auth provider owns the lifecycle.
 */
export function startAutoRefresh(): () => void {
  if (Platform.OS === 'web') return () => {};

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });

  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();

  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}
