import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Env, supabaseProjectRef } from '@/lib/env';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Signed-in home — a Phase 2 placeholder.
 *
 * It proves the session survived, shows who the server says you are, and offers
 * sign-out plus the admin entry point so the role gate can be exercised. The
 * real dashboard (pet, points, streak, quest summary) is Phase 4A.
 */
export default function HomeScreen() {
  const { session, profile, profileLoading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // The guard redirects to login; no navigation needed here.
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.hero}>
          <View style={styles.glow} />
          <Image
            source={MASCOT}
            style={styles.mascot}
            contentFit="contain"
            allowDownscaling={false}
            accessibilityLabel="Arcane Dragon"
          />
        </View>
        <Text style={styles.title}>PetQuest</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Mobile · Phase 2</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signed in</Text>
        {profileLoading && !profile ? (
          <View style={styles.row}>
            <ActivityIndicator color={Colors.gold} size="small" />
            <Text style={styles.rowValue}>Loading your profile…</Text>
          </View>
        ) : (
          <>
            <Row label="Account" value={session?.user?.email ?? '—'} />
            <Row label="Username" value={profile?.username ?? 'not set'} />
            <Row
              label="Role"
              value={profile?.role ?? 'unknown'}
              tint={isAdmin ? Colors.gold : Colors.green}
            />
            <Row label="Companion" value={profile?.selected_pet_id ?? 'not hatched'} />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <Row label="Supabase" value={supabaseProjectRef() ?? '—'} tint={Colors.green} />
        <Row label="API" value={hostOf(Env.apiBaseUrl)} tint={Colors.green} />
        <Text style={styles.note}>
          Session stored in the device keychain. Quests, evidence and verification arrive in
          Phase 4.
        </Text>
      </View>

      {isAdmin && (
        <Pressable
          onPress={() => router.push('/admin')}
          accessibilityRole="button"
          accessibilityLabel="Open admin area"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Admin area →</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onSignOut}
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

function Row({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tint ? { color: tint } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1] : url || '—';
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  hero: { alignItems: 'center', justifyContent: 'center', height: 120 },
  glow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.13,
  },
  mascot: { width: 100, height: 100 },
  title: {
    color: Colors.goldLight,
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  badge: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.45)',
  },
  badgeText: { color: '#a78bfa', fontSize: FontSize.xs, fontWeight: '700' },

  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  rowLabel: { color: Colors.textSoft, fontSize: FontSize.sm },
  rowValue: { color: Colors.textPrimary, fontSize: FontSize.sm, flexShrink: 1 },
  note: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, lineHeight: 16 },

  secondaryButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,163,26,0.45)',
    backgroundColor: 'rgba(245,163,26,0.10)',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  secondaryButtonText: { color: Colors.gold, fontSize: FontSize.md, fontWeight: '700' },

  signOutButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.40)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  signOutText: { color: '#fb7185', fontSize: FontSize.md, fontWeight: '700' },

  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
