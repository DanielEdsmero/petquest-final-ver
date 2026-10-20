import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useCompanion } from '@/companion/CompanionContext';
import useReducedMotion from '@/hooks/useReducedMotion';
import ScreenContainer from '@/components/ScreenContainer';
import { LoadingState, Row } from '@/components/states';
import { SecondaryButton, SectionLabel, Surface } from '@/components/ui';
import { Env, supabaseProjectRef } from '@/lib/env';
import { Colors, FontSize, Radius, Spacing, TapTarget } from '@/theme';

/**
 * Profile — account, how verification works, help, the admin entry point, and
 * sign-out.
 *
 * The admin row is rendered only for an admin, but that is presentation: the
 * route itself is gated in `app/admin/_layout.tsx` and the data behind it is
 * gated by Supabase RLS. Hiding the row is a convenience, not a control.
 */
export default function ProfileTab() {
  const { session, profile, profileLoading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const companion = useCompanion();
  const reducedMotion = useReducedMotion();
  const [signingOut, setSigningOut] = useState(false);
  const [showHow, setShowHow] = useState(false);

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

      <SectionLabel>Account</SectionLabel>
      <Surface style={styles.block}>
        {profileLoading && !profile ? (
          <LoadingState label="Loading your profile…" />
        ) : (
          <>
            <Row label="Username" value={profile?.username ?? 'not set'} />
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <Row label="Companion" value={profile?.selected_pet_id ?? 'not hatched'} />
            {isAdmin ? <Row label="Role" value="Study admin" tint={Colors.primary} /> : null}
          </>
        )}
      </Surface>

      {profile?.selected_pet_id ? (
        <>
          <SectionLabel style={styles.sectionGap}>Your companion</SectionLabel>
          <Surface style={styles.block}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Do not disturb</Text>
                <Text style={styles.switchBody}>Your companion stays at home and does not wander over the screen.</Text>
              </View>
              <Switch
                value={companion.dnd}
                onValueChange={companion.setDnd}
                accessibilityLabel="Do not disturb"
                trackColor={{ true: Colors.primary }}
              />
            </View>
            {!reducedMotion ? (
              <Pressable
                onPress={() => {
                  router.navigate('/');
                  setTimeout(() => companion.walk(), 600);
                }}
                disabled={companion.away || companion.dnd}
                accessibilityRole="button"
                accessibilityLabel="Let your companion out for a walk"
                style={({ pressed }) => [styles.replay, (pressed || companion.away || companion.dnd) && styles.pressed]}
              >
                <Ionicons name="walk-outline" size={20} color={Colors.primary} />
                <Text style={styles.replayText}>{companion.away ? 'Your companion is out' : 'Let your companion out for a walk'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                companion.openGuide();
                router.navigate('/');
              }}
              accessibilityRole="button"
              accessibilityLabel="Replay the tour"
              style={({ pressed }) => [styles.replay, pressed && styles.pressed]}
            >
              <Ionicons name="play-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.replayText}>Replay the tour</Text>
            </Pressable>
          </Surface>
        </>
      ) : null}

      <SectionLabel style={styles.sectionGap}>How verification works</SectionLabel>
      <Surface style={styles.block}>
        <Pressable
          onPress={() => setShowHow((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showHow }}
          accessibilityLabel="How verification works"
          style={styles.disclosure}
        >
          <Text style={styles.disclosureText}>
            Every quest you finish goes through four steps before its points are final.
          </Text>
          <Ionicons name={showHow ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primary} />
        </Pressable>
        {showHow && (
          <View style={styles.steps}>
            <Step n={1} title="Submitted" body="You add a photo and a short note about what you did." />
            <Step n={2} title="AI check" body="An automatic check compares your evidence with the quest. Points are added provisionally." />
            <Step n={3} title="Researcher review" body="If the check cannot decide, or flags something, a study admin looks at it." />
            <Step n={4} title="Outcome" body="Approved points are confirmed. If a submission is not approved, its points are reversed." />
            <Text style={styles.footnote}>
              Feeding, washing and playing with your companion cost points and are settled by the server, so the balance you see is always the real one.
            </Text>
          </View>
        )}
      </Surface>

      <SectionLabel style={styles.sectionGap}>Help</SectionLabel>
      <Surface style={styles.block}>
        <Row label="Hatching and the shop" value="PetQuest website" />
        <Row label="Server" value={supabaseProjectRef() ?? '—'} />
        <Row label="API" value={hostOf(Env.apiBaseUrl)} />
      </Surface>

      {isAdmin && (
        <Pressable
          onPress={() => router.push('/admin')}
          accessibilityRole="button"
          accessibilityLabel="Open the admin area"
          style={({ pressed }) => [styles.adminButton, pressed && styles.pressed]}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
          <Text style={styles.adminButtonText}>Admin area</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </Pressable>
      )}

      <View style={styles.spacer} />

      <SecondaryButton label="Sign out" onPress={confirmSignOut} busy={signingOut} icon="log-out-outline" />
    </ScreenContainer>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{body}</Text>
      </View>
    </View>
  );
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1] : url || '—';
}

const styles = StyleSheet.create({
  title: { color: Colors.ink, fontSize: FontSize.xl, fontWeight: '700', letterSpacing: -0.3, marginBottom: Spacing.md },
  sectionGap: { marginTop: Spacing.lg },
  block: { marginBottom: Spacing.xs },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TapTarget },
  switchText: { flex: 1 },
  switchTitle: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '600' },
  switchBody: { color: Colors.inkSoft, fontSize: FontSize.sm, lineHeight: 20, marginTop: 2 },
  replay: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TapTarget, marginTop: Spacing.xs },
  replayText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '600' },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TapTarget },
  disclosureText: { color: Colors.inkSoft, fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
  steps: { marginTop: Spacing.sm, gap: Spacing.md },
  step: { flexDirection: 'row', gap: Spacing.sm },
  stepNum: { width: 24, height: 24, borderRadius: Radius.pill, backgroundColor: Colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },
  stepBody: { flex: 1 },
  stepTitle: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  stepText: { color: Colors.inkMuted, fontSize: FontSize.sm, lineHeight: 20, marginTop: 2 },
  footnote: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16 },

  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryTint,
    minHeight: TapTarget + 4,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
  },
  adminButtonText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700', flex: 1 },

  spacer: { flex: 1, minHeight: Spacing.lg },
  pressed: { opacity: 0.7 },
});
