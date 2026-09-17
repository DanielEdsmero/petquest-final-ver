import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { PetExpression } from '@/components/PetExpression';
import ScreenContainer from '@/components/ScreenContainer';
import { StatusRing } from '@/components/StatusRing';
import { ErrorState } from '@/components/states';
import { ProgressBar, SectionLabel, Skeleton, StatusPill, Surface, TextButton } from '@/components/ui';
import { equippedGlyphs } from '@/data/accessoryModel';
import { fetchEquippedAccessories } from '@/data/accessories';
import { CARE_ACTIONS, CARE_COST } from '@/data/careModel';
import { type CloseupState } from '@/data/closeupModel';
import { MOOD_LABEL } from '@/data/moodModel';
import { STAT_META, homeFor } from '@/data/petHomeModel';
import { LEGENDARY_MIN, PET_CATALOG, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { fetchPetStats } from '@/data/petStats';
import { closeupFramesFor } from '@/data/closeupFrames';
import { useCare } from '@/hooks/useCare';
import { useMood } from '@/hooks/useMood';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing, TapTarget } from '@/theme';

/**
 * View Pet — the enlarged close-up.
 *
 *   native header (back · title)
 *   large pet on a backdrop in the home's palette, expression from the mood
 *   one speech bubble
 *   the three status rings
 *   Feed · Wash · Play (large targets)
 *   level / evolution / equipped accessories
 *
 * Same data and the same care flow as the Pet tab (useCare, useMood): the
 * expression and the rings show the server's stats, a care reaction plays
 * only after `care_pet()` replied ok, and nothing here writes anything else.
 */
export default function ViewPetScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;

  const stats = useAsyncData(
    useCallback(() => (userId ? fetchPetStats(userId) : Promise.resolve({ data: null, error: null })), [userId]),
    { enabled: !!userId },
  );
  const equipped = useAsyncData(
    useCallback(() => (userId ? fetchEquippedAccessories(userId) : Promise.resolve({ data: {}, error: null })), [userId]),
    { enabled: !!userId },
  );

  const petId = petIdOf(profile?.selected_pet_id);
  const meta = petId ? PET_CATALOG[petId] : null;
  const totalEarned = profile?.total_points_earned ?? null;
  const progress = evolutionProgress(totalEarned);
  const level = profile?.pet_level ?? progress.level;
  const portrait = spriteFor(profile?.selected_pet_id, level);
  const home = homeFor(profile?.selected_pet_id);
  // The supplied close-up art is BABY art: only a Baby-stage companion gets
  // frames. Juvenile and older keep the evolution portrait (see PetExpression).
  const frames = meta && level === 1 ? closeupFramesFor(profile?.selected_pet_id) : null;
  const glyphs = useMemo(() => equippedGlyphs(equipped.data), [equipped.data]);

  const { liveStats, livePoints, busyAction, reaction, notice, confirmCare } = useCare({
    fetchedStats: stats.data ? { hunger: stats.data.hunger, cleanliness: stats.data.cleanliness, happiness: stats.data.happiness } : null,
    statsLoading: stats.loading,
    profilePoints: profile?.points,
    petName: meta?.name ?? null,
    refreshProfile,
  });
  /* What the close-up is playing right now — the rest clip changes the line. */
  const [closeup, setCloseup] = useState<{ state: CloseupState; label: string } | null>(null);
  const { mood, message } = useMood(liveStats, petId, null, closeup?.state === 'rest');

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), stats.refresh(), equipped.refresh()]);
  }, [refreshProfile, stats, equipped]);

  return (
    <ScreenContainer insetTop={false} refreshControl={<RefreshControl refreshing={stats.refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      {/* Large isolated pet area */}
      <View style={[styles.stage, { backgroundColor: home.palette.background }]}>
        <View style={[styles.disc, { backgroundColor: home.palette.accent }]} />
        <PetExpression
          frames={frames}
          portrait={portrait}
          mood={mood}
          petId={petId}
          reaction={reaction}
          onStateChange={(state, label) => setCloseup({ state, label })}
          accessibilityLabel={meta ? `${meta.name}, your ${meta.species}, ${stageName(level)} stage, ${MOOD_LABEL[mood].toLowerCase()}` : 'No companion yet'}
        />
        <View style={styles.stageFoot}>
          <Text style={styles.petName} numberOfLines={1}>
            {meta?.name ?? 'No companion yet'}
            {meta ? <Text style={styles.petStage}> · {stageName(level)}</Text> : null}
          </Text>
          {glyphs.length > 0 ? (
            <Text style={styles.glyphs} accessibilityLabel={`Wearing ${glyphs.length} accessories`}>
              {glyphs.join(' ')}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Speech bubble */}
      <View style={styles.bubbleRow}>
        <View style={styles.bubble} accessibilityLiveRegion="polite" accessibilityLabel={message ? `${meta?.name ?? 'Your companion'} says: ${message}` : undefined}>
          <Text style={styles.bubbleText}>{stats.loading ? '…' : (message ?? (meta ? 'It’s a peaceful day.' : 'Hatch your egg on the PetQuest website.'))}</Text>
        </View>
        <StatusPill label={MOOD_LABEL[mood]} tone={mood === 'happy' || mood === 'thriving' ? 'good' : mood === 'balanced' ? 'neutral' : 'waiting'} />
      </View>

      {/* Status */}
      <SectionLabel style={styles.sectionGap}>Status</SectionLabel>
      <Surface style={styles.block}>
        {stats.error ? (
          <ErrorState body={stats.error} onRetry={stats.refetch} />
        ) : (
          <View style={styles.rings}>
            {STAT_META.map((s) => (
              <StatusRing key={s.key} label={s.label} value={stats.loading ? null : (liveStats?.[s.key] ?? null)} color={s.color} icon={STAT_ICONS[s.key]} size={72} />
            ))}
          </View>
        )}
      </Surface>

      {/* Care */}
      <SectionLabel style={styles.sectionGap}>Care</SectionLabel>
      <Surface style={styles.block}>
        {meta ? (
          <>
            <View style={styles.careRow}>
              {CARE_ACTIONS.map((a) => {
                const busy = busyAction === a.key;
                const disabled = busyAction != null;
                const stat = STAT_META.find((s) => s.action === a.key)!;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => confirmCare(a.key)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.label} ${meta.name}, ${CARE_COST} points, raises ${stat.label}`}
                    accessibilityState={{ disabled, busy }}
                    style={({ pressed }) => [styles.careBtn, pressed && styles.carePressed, disabled && !busy && styles.disabled]}
                  >
                    <Text style={styles.careEmoji}>{a.emoji}</Text>
                    <Text style={styles.careLabel}>{busy ? '…' : a.label}</Text>
                    <Text style={[styles.careCost, { color: stat.color }]}>{CARE_COST} pts</Text>
                  </Pressable>
                );
              })}
            </View>
            {notice && (
              <Text style={[styles.notice, notice.tone === 'ok' ? styles.noticeOk : styles.noticeBad]} accessibilityLiveRegion="polite">
                {notice.text}
              </Text>
            )}
            <Text style={styles.footnote}>
              Points: {livePoints == null ? '—' : livePoints.toLocaleString()}. You confirm first; the server settles it.
            </Text>
          </>
        ) : (
          <Text style={styles.footnote}>Hatch your companion on the PetQuest website to start caring for it.</Text>
        )}
      </Surface>

      {/* Secondary */}
      {meta && (
        <>
          <SectionLabel style={styles.sectionGap}>Evolution</SectionLabel>
          <Surface style={styles.block}>
            {totalEarned == null ? (
              <Skeleton height={14} />
            ) : (
              <>
                {progress.nextAt != null && progress.remaining != null ? (
                  <>
                    <ProgressBar fraction={progress.fraction} height={6} color={home.palette.accent} accessibilityLabel={`${progress.remaining} points to ${stageName(level + 1)}`} />
                    <Text style={styles.caption}>
                      Level {level} · {totalEarned.toLocaleString()} / {progress.nextAt.toLocaleString()} · {progress.remaining.toLocaleString()} to {stageName(level + 1)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.caption}>
                    Level {level} · {totalEarned.toLocaleString()} lifetime points · Legendary ({LEGENDARY_MIN.toLocaleString()}+)
                  </Text>
                )}
              </>
            )}
            <TextButton label="Accessories" onPress={() => router.push({ pathname: '/pet', params: { view: 'accessories' } })} />
          </Surface>
        </>
      )}
    </ScreenContainer>
  );
}

const STAT_ICONS = { hunger: 'restaurant-outline', cleanliness: 'water-outline', happiness: 'happy-outline' } as const;

const styles = StyleSheet.create({
  // paddingTop leaves room for the hover/bounce offsets (MAX_OFFSET) so no clip clips.
  stage: { alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  disc: { position: 'absolute', width: 210, height: 210, borderRadius: 105, opacity: 0.3, top: Spacing.lg + 10 },
  stageFoot: { alignItems: 'center', marginTop: Spacing.sm, gap: 2 },
  petName: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700' },
  petStage: { color: Colors.inkMuted, fontWeight: '500' },
  glyphs: { fontSize: 18, letterSpacing: 2 },

  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  bubble: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: TapTarget, justifyContent: 'center' },
  bubbleText: { color: Colors.ink, fontSize: FontSize.md, lineHeight: 22 },

  sectionGap: { marginTop: Spacing.lg },
  block: { marginBottom: Spacing.xs },
  rings: { flexDirection: 'row', gap: Spacing.xs },

  careRow: { flexDirection: 'row', gap: Spacing.sm },
  careBtn: {
    flex: 1,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
  },
  carePressed: { backgroundColor: Colors.primaryTint, borderColor: Colors.primary },
  careEmoji: { fontSize: 24 },
  careLabel: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '700' },
  careCost: { fontSize: FontSize.xs, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  notice: { fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center', marginTop: Spacing.sm },
  noticeOk: { color: Colors.success },
  noticeBad: { color: Colors.warning },
  footnote: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.sm },
  caption: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, lineHeight: 16 },
});
