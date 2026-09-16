import { Stack } from 'expo-router';

import { Colors, FontSize } from '@/theme';

/**
 * Companion stack — the View Pet close-up, pushed over the tab bar with a
 * native header so back and the swipe gesture work. The screen passes
 * `insetTop={false}` to ScreenContainer because the header owns that inset.
 */
export default function CompanionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '700' },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="view" options={{ title: 'Your companion' }} />
    </Stack>
  );
}
