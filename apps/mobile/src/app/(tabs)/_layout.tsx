import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { Colors, FontSize } from '@/theme';

/**
 * The signed-in tab bar: Home, Quests, Pet, Profile.
 *
 * The Pet tab holds the companion's home, the status rings, care, progress
 * metrics and the Accessories view (a segmented control inside the tab, not a
 * fifth tab).
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarStyle: {
          backgroundColor: Colors.surfaceElevated,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          // A little extra height on iOS so labels are not cramped against the
          // home indicator on tall phones.
          ...(Platform.OS === 'ios' ? { height: 84, paddingTop: 8 } : {}),
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '600' },
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />,
          tabBarAccessibilityLabel: 'Home tab',
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />,
          tabBarAccessibilityLabel: 'Quests tab',
        }}
      />
      <Tabs.Screen
        name="pet"
        options={{
          title: 'Pet',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'paw' : 'paw-outline'} size={size} color={color} />,
          tabBarAccessibilityLabel: 'Pet tab',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />,
          tabBarAccessibilityLabel: 'Profile tab',
        }}
      />
    </Tabs>
  );
}
