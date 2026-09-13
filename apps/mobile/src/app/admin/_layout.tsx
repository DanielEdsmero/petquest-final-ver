import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import LoadingScreen from '@/components/LoadingScreen';
import { Colors, FontSize } from '@/theme';

/**
 * Role gate for the admin group — a second check on top of the redirect in the
 * root layout, so an admin screen cannot render even for the frame before that
 * effect runs.
 *
 * Neither check is the real control. Admin data is protected by Supabase RLS
 * (`is_admin()` on `quest_validity_reviews`, `user_snapshots`, `cheat_events`)
 * and by the role checks inside the Vercel functions. A tampered client that
 * forced its way past this would still read nothing and write nothing.
 */
export default function AdminLayout() {
  const { status, isAdmin, profile, profileLoading } = useAuth();

  // Hold while the role is still unknown, so a legitimate admin is not bounced
  // out during the profile fetch. Fails closed: no profile means no admin.
  if (status === 'loading' || (status === 'signedIn' && !profile && profileLoading)) {
    return <LoadingScreen message="Checking permissions…" />;
  }

  if (!isAdmin) return <Redirect href="/" />;

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
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="validity" options={{ title: 'Quest validity' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification queue' }} />
    </Stack>
  );
}
