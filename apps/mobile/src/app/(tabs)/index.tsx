import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Card, LoadingState, PhaseNotice } from '@/components/states';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Home tab — the structural shell of the dashboard.
 *
 * Phase 3 wires navigation only. The live figures (points, streak, quest
 * counts, the real companion and its evolution stage) come from Supabase in
 * Phase 4A; the placeholders below show a dash rather than a plausible-looking
 * number, so nothing here can be mistaken for real research data.
 */
export default function HomeTab() {
  const { profile, profileLoading } = useAuth();
  const router = useRouter();

  const greeting = profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back';

  return (
    <ScreenContainer insetBottom={false}>
      <Text style={styles.greeting} numberOfLines={2}>
        {greeting}
      </Text>

      <View style={styles.heroCard}>
        <View style={styles.hero}>
          <View style={styles.glow} />
          <Image
            source={MASCOT}
            style={styles.mascot}
            contentFit="contain"
            allowDownscaling={false}
            accessibilityLabel="Your companion"
          />
        </View>
        {profileLoading && !profile ? (
          <LoadingState label="Loading your companion…" />
        ) : (
          <>
            <Text style={styles.petName}>{profile?.selected_pet_id ?? 'No companion yet'}</Text>
            <Text style={styles.petStage}>
              {profile?.pet_level ? `Level ${profile.pet_level}` : 'Not hatched'}
            </Text>
          </>
        )}
      </View>

      <View style={styles.statRow}>
        <Stat icon="star" label="Points" value="—" tint={Colors.gold} />
        <Stat icon="flame" label="Streak" value="—" tint={Colors.rose} />
        <Stat icon="checkmark-done" label="Done" value="—" tint={Colors.green} />
      </View>

      <Card title="Quick actions">
        <Action
          icon="add-circle-outline"
          label="Create a quest"
          onPress={() => router.push('/quest/create')}
        />
        <Action
          icon="list-outline"
          label="View your quest log"
          onPress={() => router.push('/quests')}
        />
      </Card>

      <PhaseNotice
        phase="Phase 4A"
        items={['Live points, streak and quest counts', 'Your real companion and evolution stage', 'Pet care actions']}
      />
    </ScreenContainer>
  );
}

function Stat({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={Colors.gold} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },

  heroCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  hero: { alignItems: 'center', justifyContent: 'center', height: 120 },
  glow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.13,
  },
  mascot: { width: 104, height: 104 },
  petName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  petStage: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: Spacing.sm,
  },
  statValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.xs,
  },
  actionLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, flex: 1 },
  pressed: { opacity: 0.7 },
});
