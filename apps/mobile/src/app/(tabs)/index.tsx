import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { ErrorState } from '@/components/states';
import { evolutionProgress, PET_CATALOG, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { summariseTasks } from '@/data/taskModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Home — the live dashboard (Phase 4A).
 *
 * Every figure comes from Supabase: points and streak from the `profiles` row
 * the auth provider already holds, quest counts derived from the participant's
 * own `tasks`. Nothing is hardcoded and nothing is estimated — a value that has
 * not loaded shows as a dash rather than a zero, because "0 points" and "not
 * loaded yet" mean very different things in a study.
 *
 * Pull-to-refresh goes through ScreenContainer's `refreshControl` prop rather
 * than a second ScrollView, so the safe-area and keyboard handling stay in one
 * place.
 */
export default function HomeTab() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;

  const tasks = useAsyncData(
    useCallback(
      () => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })),
      [userId],
    ),
    { enabled: !!userId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), tasks.refresh()]);
  }, [refreshProfile, tasks]);

  const summary = summariseTasks(tasks.data);
  const petId = petIdOf(profile?.selected_pet_id);
  const totalEarned = profile?.total_points_earned ?? null;
  const progress = evolutionProgress(totalEarned);
  // The server's stored level wins; the local computation is only a fallback
  // for a profile row that predates the column.
  const level = profile?.pet_level ?? progress.level;
  const sprite = spriteFor(profile?.selected_pet_id, level);
  const accent = petId ? PET_CATALOG[petId].accent : Colors.arcane;

  return (
    <ScreenContainer
      insetBottom={false}
      refreshControl={
        <RefreshControl refreshing={tasks.refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />
      }
    >
      <View>
        <Text style={styles.greeting} numberOfLines={2}>
          {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
        </Text>

        {/* Companion */}
        <View style={styles.heroCard}>
          <View style={styles.hero}>
            <View style={[styles.glow, { backgroundColor: accent }]} />
            {sprite ? (
              <Image
                source={sprite}
                style={styles.mascot}
                contentFit="contain"
                allowDownscaling={false}
                transition={200}
                accessibilityLabel={petId ? PET_CATALOG[petId].species : 'Your companion'}
              />
            ) : (
              <Text style={styles.noPet}>🥚</Text>
            )}
          </View>

          {petId ? (
            <>
              <Text style={styles.petName}>{PET_CATALOG[petId].name}</Text>
              <Text style={styles.petStage}>
                {PET_CATALOG[petId].species} · {stageName(level)}
              </Text>

              {progress.nextAt != null && totalEarned != null ? (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${Math.round(progress.fraction * 100)}%` }]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    {progress.remaining} points to {stageName(level + 1)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.petName}>No companion yet</Text>
              <Text style={styles.petStage}>Hatch your egg on the PetQuest website</Text>
            </>
          )}
        </View>

        {/* Progression — server-authoritative values only */}
        <View style={styles.statRow}>
          <Stat icon="star" label="Points" value={fmt(profile?.points)} tint={Colors.gold} />
          <Stat icon="flame" label="Streak" value={fmtStreak(profile?.current_streak)} tint={Colors.rose} />
          <Stat
            icon="checkmark-done"
            label="Done"
            value={tasks.loading ? '—' : String(summary.completed)}
            tint={Colors.green}
          />
        </View>

        {/* Quest summary */}
        {tasks.error ? (
          <View style={styles.card}>
            <ErrorState body={tasks.error} onRetry={tasks.refetch} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your quests</Text>
            <SummaryRow label="Active" value={tasks.loading ? '—' : String(summary.active)} />
            <SummaryRow label="Completed" value={tasks.loading ? '—' : String(summary.completed)} />
            {summary.awaitingCheck > 0 && (
              <SummaryRow label="Awaiting check" value={String(summary.awaitingCheck)} tint="#22d3ee" />
            )}
            {summary.needsAttention > 0 && (
              <SummaryRow label="Needs changes" value={String(summary.needsAttention)} tint={Colors.gold} />
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick actions</Text>
          <Action icon="add-circle-outline" label="Create a quest" onPress={() => router.push('/quest/create')} />
          <Action icon="list-outline" label="View your quest log" onPress={() => router.push('/quests')} />
        </View>
      </View>
    </ScreenContainer>
  );
}

/** A number we have, or a dash we do not — never a placeholder zero. */
const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtStreak = (n: number | null | undefined) =>
  typeof n === 'number' ? `${n}d` : '—';

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
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, tint ? { color: tint } : null]}>{value}</Text>
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
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  hero: { alignItems: 'center', justifyContent: 'center', height: 132 },
  glow: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: Radius.pill,
    opacity: 0.14,
  },
  mascot: { width: 124, height: 124 },
  noPet: { fontSize: 72 },
  petName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  petStage: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },

  progressWrap: { width: '100%', marginTop: Spacing.sm },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgCard2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: Radius.pill },
  progressLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

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
    paddingHorizontal: 4,
  },
  statValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs },

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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: { color: Colors.textSoft, fontSize: FontSize.sm },
  summaryValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },

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
