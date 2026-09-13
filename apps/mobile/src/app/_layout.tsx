import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/theme';

/**
 * Root layout for the PetQuest mobile shell.
 *
 * Phase 1 is a single screen. The tab navigator, the auth group and the
 * role-gated admin group arrive in Phases 2–3; this stays the one place that
 * owns the safe-area provider, the status-bar style and the dark chrome.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* The app is dark-only, so the status bar is always light-on-dark. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgDeep },
          animation: 'fade',
        }}
      />
    </SafeAreaProvider>
  );
}
