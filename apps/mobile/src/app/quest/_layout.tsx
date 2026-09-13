import { Stack } from 'expo-router';

import { Colors, FontSize } from '@/theme';

/**
 * Quest stack — create, detail and verify, pushed over the tab bar.
 *
 * These use a real native header rather than a custom back button, so the iOS
 * swipe-back gesture and the system back behaviour work without reimplementing
 * them. Screens therefore pass `insetTop={false}` to ScreenContainer: the
 * header already occupies the top safe area.
 */
export default function QuestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.bgVoid },
        headerTintColor: Colors.gold,
        headerTitleStyle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.bgDeep },
      }}
    >
      <Stack.Screen name="create" options={{ title: 'New quest' }} />
      <Stack.Screen name="[id]" options={{ title: 'Quest' }} />
      <Stack.Screen name="verify" options={{ title: 'Submit evidence' }} />
    </Stack>
  );
}
