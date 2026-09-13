import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Card, LoadingState, Row } from '@/components/states';
import { Env, supabaseProjectRef } from '@/lib/env';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Profile tab — account, the admin entry point, and sign-out.
 *
 * The admin row is rendered only for an admin, but that is presentation: the
 * route itself is gated in `app/admin/_layout.tsx` and the data behind it is
 * gated by Supabase RLS. Hiding the row is a convenience, not a control.
 */
export default function ProfileTab() {
  const { session, profile, profileLoading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to continue your quests.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          // The root guard sends us to login; no navigation needed here.
        },
      },
    ]);
  };

  return (
    <ScreenContainer insetBottom={false}>
      <Text style={styles.title}>Profile</Text>

      <Card title="Account">
        {profileLoading && !profile ? (
          <LoadingState label="Loading your profile…" />
        ) : (
          <>
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <Row label="Username" value={profile?.username ?? 'not set'} />
            <Row
              label="Role"
              value={profile?.role ?? 'unknown'}
              tint={isAdmin ? Colors.gold : Colors.green}
            />
            <Row label="Companion" value={profile?.selected_pet_id ?? 'not hatched'} />
          </>
        )}
      </Card>

      <Card title="Connection">
        <Row label="Supabase" value={supabaseProjectRef() ?? '—'} tint={Colors.green} />
        <Row label="API" value={hostOf(Env.apiBaseUrl)} tint={Colors.green} />
      </Card>

      {isAdmin && (
        <Pressable
          onPress={() => router.push('/admin')}
          accessibilityRole="button"
          accessibilityLabel="Open the admin area"
          style={({ pressed }) => [styles.adminButton, pressed && styles.pressed]}
        >
          <Ionicons name="shield-checkmark" size={18} color={Colors.gold} />
          <Text style={styles.adminButtonText}>Admin area</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
        </Pressable>
      )}

      <View style={styles.spacer} />

      <Pressable
        onPress={confirmSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityState={{ busy: signingOut }}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.pressed,
          signingOut && styles.disabled,
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color="#fb7185" />
        ) : (
          <Text style={styles.signOutText}>Sign out</Text>
        )}
      </Pressable>
    </ScreenContainer>
  );
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1] : url || '—';
}

const styles = StyleSheet.create({
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,163,26,0.45)',
    backgroundColor: 'rgba(245,163,26,0.10)',
    minHeight: 52,
    paddingHorizontal: Spacing.md,
  },
  adminButtonText: { color: Colors.gold, fontSize: FontSize.md, fontWeight: '700', flex: 1 },

  spacer: { flex: 1, minHeight: Spacing.lg },

  signOutButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.40)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: '#fb7185', fontSize: FontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
