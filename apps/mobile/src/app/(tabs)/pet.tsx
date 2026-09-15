import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Card, ErrorState, LoadingState, Row } from '@/components/states';
import { LEGENDARY_MIN, PET_CATALOG, STAGES, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { carePet } from '@/data/care';
import { CARE_ACTIONS, CARE_COST, canAfford, careErrorMessage, careSuccessMessage, type CareAction, type CareStats } from '@/data/careModel';
import { fetchPetStats } from '@/data/petStats';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Pet tab (Phase 4F) — the companion, its real evolution stage, and its stats.
 *
 * The sprite is the actual PetQuest asset for the stored `pet_level`; the
 * progress bar is derived from `total_points_earned` with the same thresholds
 * the server's `pet_level` CASE uses. Nothing here is estimated: an unloaded
 * value shows as a dash.
 *
 * Care actions (feed / wash / play, Phase 8) call the `care_pet()` RPC. The
 * balance and the stats shown afterwards are the ones the server returned —
 * this client never computes a debit or a stat boost itself.
 */
export default function PetTab() {
  const { session, profile, refreshProfile } = useAuth();
  const userId = session?.user?.id ?? null;

  const stats = useAsyncData(
    useCallback(
      () => (userId ? fetchPetStats(userId) : Promise.resolve({ data: null, error: null })),
      [userId],
    ),
    { enabled: !!userId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), stats.refresh()]);
  }, [refreshProfile, stats]);

  /* Live copies of the two things a care action changes. They follow the
     fetched values and are overwritten by the server's answer to care_pet(). */
  const [liveStats, setLiveStats] = useState<CareStats | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  useEffect(() => {
    if (stats.data) setLiveStats({ hunger: stats.data.hunger, cleanliness: stats.data.cleanliness, happiness: stats.data.happiness });
    else if (!stats.loading) setLiveStats(null);
  }, [stats.data, stats.loading]);
  useEffect(() => {
    setLivePoints(typeof profile?.points === 'number' ? profile.points : null);
  }, [profile?.points]);

  const [busyAction, setBusyAction] = useState<CareAction | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const care = useCallback(
    async (action: CareAction, petName: string | null) => {
      if (busyAction) return;
      if (!canAfford(livePoints)) {
        setNotice({ text: careErrorMessage('insufficient_points'), tone: 'bad' });
        return;
      }
      setBusyAction(action);
      const r = await carePet(action);
      setBusyAction(null);
      if (typeof r.points === 'number') setLivePoints(r.points);
      if (!r.ok) {
        setNotice({ text: careErrorMessage(r.error), tone: 'bad' });
        return;
      }
      setLiveStats(r.stats);
      const text = careSuccessMessage(action, petName);
      setNotice({ text, tone: 'ok' });
      AccessibilityInfo.announceForAccessibility(text);
      void refreshProfile(); // re-syncs the header balance from the server
    },
    [busyAction, livePoints, refreshProfile],
  );

  const petId = petIdOf(profile?.selected_pet_id);
  const meta = petId ? PET_CATALOG[petId] : null;
  const totalEarned = profile?.total_points_earned ?? null;
  const progress = evolutionProgress(totalEarned);
  const level = profile?.pet_level ?? progress.level;
  const sprite = spriteFor(profile?.selected_pet_id, level);
  const accent = meta?.accent ?? Colors.arcane;

  return (
    <ScreenContainer
      insetBottom={false}
      refreshControl={<RefreshControl refreshing={stats.refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
    >
      <Text style={styles.title}>Your companion</Text>

      {/* Companion */}
      <View style={[styles.heroCard, { borderColor: `${accent}44` }]}>
        <View style={styles.hero}>
          <View style={[styles.glow, { backgroundColor: accent }]} />
          {sprite ? (
            <Image
              source={sprite}
              style={styles.mascot}
              contentFit="contain"
              allowDownscaling={false}
              transition={200}
              accessibilityLabel={`${meta?.species ?? 'Companion'}, ${stageName(level)} stage`}
            />
          ) : (
            <Text style={styles.noPet}>🥚</Text>
          )}
        </View>

        {meta ? (
          <>
            <Text style={styles.petName}>{meta.name}</Text>
            <Text style={[styles.petSpecies, { color: accent }]}>
              {meta.species} · {stageName(level)}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.petName}>No companion yet</Text>
            <Text style={styles.petSpecies}>Hatch your egg on the PetQuest website</Text>
          </>
        )}
      </View>

      {/* Evolution */}
      {meta && (
        <Card title="Evolution">
          <View style={styles.stageRow}>
            {STAGES.map((s, i) => {
              const reached = level >= s.level;
              const current = level === s.level || (level >= 5 && i === STAGES.length - 1);
              return (
                <View key={s.key} style={styles.stageItem} accessibilityLabel={`${s.label}${reached ? ', reached' : ''}`}>
                  <View style={[styles.stageDot, reached && { backgroundColor: accent, borderColor: accent }, current && styles.stageDotCurrent]} />
                  <Text style={[styles.stageLabel, reached && { color: Colors.textPrimary }]}>{s.label}</Text>
                </View>
              );
            })}
          </View>

          {totalEarned == null ? (
            <Text style={styles.muted}>—</Text>
          ) : progress.nextAt != null ? (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%`, backgroundColor: accent }]} />
              </View>
              <Text style={styles.progressLabel}>
                {totalEarned.toLocaleString()} / {progress.nextAt.toLocaleString()} lifetime points ·{' '}
                {progress.remaining} to {stageName(level + 1)}
              </Text>
            </>
          ) : (
            <Text style={styles.progressLabel}>
              {totalEarned.toLocaleString()} lifetime points · Legendary ({LEGENDARY_MIN.toLocaleString()}+)
            </Text>
          )}
        </Card>
      )}

      {/* Streak */}
      <Card title="Streak">
        <View style={styles.streakRow}>
          <Streak icon="flame" label="Current" value={fmtDays(profile?.current_streak)} tint={Colors.rose} />
          <Streak icon="trophy" label="Longest" value={fmtDays(profile?.longest_streak)} tint={Colors.gold} />
        </View>
      </Card>

      {/* Stats + care */}
      {stats.loading ? (
        <Card title="Stats">
          <LoadingState label="Loading stats…" />
        </Card>
      ) : stats.error ? (
        <Card title="Stats">
          <ErrorState body={stats.error} onRetry={stats.refetch} />
        </Card>
      ) : (
        <Card title="Stats">
          <StatBar label="Hunger" value={liveStats?.hunger ?? null} tint="#fb923c" />
          <StatBar label="Cleanliness" value={liveStats?.cleanliness ?? null} tint={Colors.teal} />
          <StatBar label="Happiness" value={liveStats?.happiness ?? null} tint="#f472b6" />

          {meta ? (
            <>
              <View style={styles.careRow}>
                {CARE_ACTIONS.map((a) => {
                  const busy = busyAction === a.key;
                  const disabled = busyAction != null;
                  return (
                    <Pressable
                      key={a.key}
                      onPress={() => care(a.key, meta.name)}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityLabel={`${a.label} ${meta.name}, ${CARE_COST} points`}
                      accessibilityState={{ disabled, busy }}
                      style={({ pressed }) => [styles.careBtn, pressed && styles.pressed, disabled && !busy && styles.disabled]}
                    >
                      <Text style={styles.careEmoji}>{a.emoji}</Text>
                      <Text style={styles.careLabel}>{busy ? '…' : a.label}</Text>
                      <Text style={styles.careCost}>{CARE_COST} pts</Text>
                    </Pressable>
                  );
                })}
              </View>
              {notice && (
                <Text
                  style={[styles.notice, notice.tone === 'ok' ? styles.noticeOk : styles.noticeBad]}
                  accessibilityLiveRegion="polite"
                >
                  {notice.text}
                </Text>
              )}
              <Text style={styles.footnote}>
                Each action costs {CARE_COST} points and is settled by the server, so the balance and stats
                you see afterwards are the real ones.
              </Text>
            </>
          ) : (
            <Text style={styles.footnote}>Hatch your companion on the PetQuest website to start caring for it.</Text>
          )}
        </Card>
      )}

      {profile && (
        <Card title="Account">
          <Row label="Points" value={fmt(livePoints)} tint={Colors.gold} />
          <Row label="Lifetime earned" value={fmt(profile.total_points_earned)} />
        </Card>
      )}
    </ScreenContainer>
  );
}

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtDays = (n: number | null | undefined) => (typeof n === 'number' ? `${n} day${n === 1 ? '' : 's'}` : '—');

function Streak({ icon, label, value, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tint: string }) {
  return (
    <View style={styles.streak} accessibilityLabel={`${label} streak: ${value}`}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[styles.streakValue, { color: tint }]}>{value}</Text>
      <Text style={styles.streakLabel}>{label}</Text>
    </View>
  );
}

/** A 0–100 bar. `null` renders as an empty track with a dash, not as 0%. */
function StatBar({ label, value, tint }: { label: string; value: number | null; tint: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.statRow} accessibilityLabel={`${label}: ${value == null ? 'unknown' : `${pct} percent`}`}>
      <View style={styles.statHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color: tint }]}>{value == null ? '—' : `${pct}%`}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },

  heroCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  hero: { alignItems: 'center', justifyContent: 'center', height: 168 },
  glow: { position: 'absolute', width: 156, height: 156, borderRadius: Radius.pill, opacity: 0.14 },
  mascot: { width: 156, height: 156 },
  noPet: { fontSize: 88 },
  petName: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  petSpecies: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },

  stageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  stageItem: { alignItems: 'center', gap: 4, flex: 1 },
  stageDot: { width: 12, height: 12, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.cardBorderHi, backgroundColor: Colors.bgCard2 },
  stageDotCurrent: { width: 16, height: 16 },
  stageLabel: { color: Colors.textMuted, fontSize: FontSize.xs },

  track: { height: 8, borderRadius: Radius.pill, backgroundColor: Colors.bgCard2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  progressLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xs, textAlign: 'center' },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },

  streakRow: { flexDirection: 'row', gap: Spacing.sm },
  streak: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.xs },
  streakValue: { fontSize: FontSize.lg, fontWeight: '800' },
  streakLabel: { color: Colors.textMuted, fontSize: FontSize.xs },

  statRow: { marginBottom: Spacing.sm },
  statHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  statLabel: { color: Colors.textSoft, fontSize: FontSize.sm },
  statValue: { fontSize: FontSize.sm, fontWeight: '700' },
  footnote: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.xs },

  careRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  careBtn: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    backgroundColor: Colors.bgCard2,
    paddingVertical: Spacing.xs,
  },
  careEmoji: { fontSize: 20 },
  careLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  careCost: { color: Colors.gold, fontSize: FontSize.xs },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  notice: { fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center', marginTop: Spacing.sm },
  noticeOk: { color: Colors.green },
  noticeBad: { color: Colors.rose },
});
