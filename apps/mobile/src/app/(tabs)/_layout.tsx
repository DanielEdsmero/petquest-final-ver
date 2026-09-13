import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { Colors, FontSize } from '@/theme';

/**
 * The signed-in tab bar: Home, Quests, Pet, Profile.
 *
 * Admin is deliberately NOT a tab. It is a separate route group so that an
 * ordinary participant never sees it in the chrome, and so the role gate has a
 * single entry point (`app/admin/_layout.tsx`).
 *
 * React Navigation already lifts the tab bar above the home indicator and lays
 * the scene out above the bar, so screens pass `insetBottom={false}` to
 * `ScreenContainer` rather than padding for the inset a second time.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.bgVoid,
          borderTopColor: Colors.cardBorder,
          borderTopWidth: 1,
          // A little extra height on iOS so labels are not cramped against the
          // home indicator on tall phones.
          ...(Platform.OS === 'ios' ? { height: 84, paddingTop: 8 } : {}),
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '700' },
        sceneStyle: { backgroundColor: Colors.bgDeep },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Home tab',
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Quests tab',
        }}
      />
      <Tabs.Screen
        name="pet"
        options={{
          title: 'Pet',
          tabBarIcon: ({ color, size }) => <Ionicons name="paw" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Pet tab',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Profile tab',
        }}
      />
    </Tabs>
  );
}
