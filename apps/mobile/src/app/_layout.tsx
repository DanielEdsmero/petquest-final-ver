import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { resolveRedirect } from '@/auth/guards';
import MascotWakeLoader from '@/components/MascotWakeLoader';
import { CompanionProvider } from '@/companion/CompanionContext';
import PetGuide from '@/companion/PetGuide';
import RoamingPet from '@/companion/RoamingPet';
import { Colors } from '@/theme';

/**
 * Root layout.
 *
 * Owns the safe-area provider, the dark chrome, the auth provider, the
 * navigation guard, and — since Phase 6 — the account-loading gate.
 *
 * Route groups:
 *   (auth)  — signed out only
 *   (tabs)  — the signed-in app: Home, Quests, Pet, Profile
 *   quest   — pushed over the tabs (create, detail, verify)
 *   admin   — role-gated, kept out of the tab bar entirely
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <CompanionProvider>
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="quest" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="companion" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="admin" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </AuthGate>
        </CompanionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Navigation guard + the account-loading gate.
 *
 * The gate (Phase 6) works the way the web one does. Requests are never held:
 * AuthProvider restores the session on mount and flips `signingIn` the moment
 * a sign-in starts, so the mascot and the network run in parallel. The gate
 * only decides when the account is REVEALED — once the data is ready AND the
 * wake-up minimum has played, or straight away on Skip.
 *
 * The loader is an absolute overlay ABOVE the navigator, not a replacement for
 * it. That keeps the Stack mounted, so `router.replace` never fires before a
 * navigator exists, and a redirect underneath can never tear the animation
 * down halfway.
 *
 * A signed-out visitor has no account to load, so the login screen is never
 * held behind the animation. A failed sign-in clears `signingIn` and drops the
 * gate rather than trapping anyone. A failed profile load also drops it: the
 * participant lands in the app with no role, which means no admin access —
 * degraded, not stuck.
 *
 * Reminder: the redirect is UX, not security. Supabase RLS is what stops a
 * participant reading admin data (see src/auth/guards.ts).
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { status, isAdmin, profile, profileLoading, signingIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationReady = useRootNavigationState()?.key != null;

  useEffect(() => {
    if (!navigationReady) return;
    const target = resolveRedirect({ status, isAdmin, segments: segments as string[] });
    if (target) router.replace(target);
  }, [navigationReady, status, isAdmin, segments, router]);

  /* ── Account-loading gate ── */
  const [revealedFor, setRevealedFor] = useState<string | null>(null);

  // Data is "ready" once the session question is settled, no sign-in is in
  // flight, and — if signed in — the profile fetch has finished either way.
  const accountDataReady =
    status !== 'loading' && !signingIn && !(status === 'signedIn' && profileLoading && !profile);
  const accountId = status === 'signedIn' ? (profile?.id ?? null) : null;
  const gated = !accountDataReady || (!!accountId && revealedFor !== accountId);

  // Forget the reveal on sign-out, so the same account signing back in gets
  // the full sequence again rather than an instant reveal.
  useEffect(() => {
    if (status === 'signedOut') setRevealedFor(null);
  }, [status]);

  // One token per loading instance. It must NOT change while the loader is up:
  // the account id arrives mid-sequence, and keying off it would restart the
  // animation right as the profile lands.
  const [loadId, setLoadId] = useState(0);
  const wasGated = useRef(true);
  useEffect(() => {
    if (gated && !wasGated.current) setLoadId((n) => n + 1);
    wasGated.current = gated;
  }, [gated]);

  return (
    <>
      {children}
      {gated && (
        <MascotWakeLoader
          petType={profile?.selected_pet_id}
          restartToken={loadId}
          accountDataReady={accountDataReady}
          onComplete={() => setRevealedFor(accountId ?? 'none')}
        />
      )}
      {/* The companion roams over the signed-in app once the account has been revealed. The tour sits under the pet so the pet is lit above the dim layer. */}
      {!gated && status === 'signedIn' && (
        <>
          <PetGuide />
          <RoamingPet />
        </>
      )}
    </>
  );
}
