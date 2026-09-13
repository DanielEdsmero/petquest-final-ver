import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { resolveRedirect, shouldShowRestoring } from '@/auth/guards';
import LoadingScreen from '@/components/LoadingScreen';
import { Colors } from '@/theme';

/**
 * Root layout.
 *
 * Owns the safe-area provider, the dark chrome, the auth provider and the
 * navigation guard. Every screen renders underneath this, so there is exactly
 * one place that decides whether the participant may be where they are.
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
      <StatusBar style="light" />
      <AuthProvider>
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.bgDeep },
              animation: 'fade',
            }}
          >
            {/* Declared so the group order is deterministic; each group owns
                its own header behaviour. */}
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="quest" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="admin" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </AuthGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Applies `resolveRedirect` whenever the auth state or the route changes.
 *
 * The redirect runs in an effect rather than during render because Expo Router
 * cannot navigate mid-render — and it waits for the navigator to exist.
 *
 * Reminder: this is UX, not security. Supabase RLS is what actually stops a
 * participant reading admin data (see src/auth/guards.ts).
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Navigating before the root navigator has mounted throws. The state gets a
  // `key` once it is ready; until then we hold the redirect.
  const navigationReady = useRootNavigationState()?.key != null;

  useEffect(() => {
    if (!navigationReady) return;
    const target = resolveRedirect({ status, isAdmin, segments: segments as string[] });
    if (target) router.replace(target);
  }, [navigationReady, status, isAdmin, segments, router]);

  // Cover the app while the keychain is being read, so a protected screen never
  // flashes before we know who is signed in.
  if (shouldShowRestoring(status)) return <LoadingScreen />;

  return <>{children}</>;
}
