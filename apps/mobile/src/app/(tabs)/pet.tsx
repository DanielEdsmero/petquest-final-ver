import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { ErrorState } from '@/components/states';
import { PetHero, ProgressBar, SectionLabel, Skeleton, Surface } from '@/components/ui';
import { carePet } from '@/data/care';
import { CARE_ACTIONS, CARE_COST, canAfford, careErrorMessage, careSuccessMessage, type CareAction, type CareStats } from '@/data/careModel';
import { LEGENDARY_MIN, PET_CATALOG, STAGES, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { fetchPetStats } from '@/data/petStats';
import { formatMinutes, formatPct, progressMetrics } from '@/data/progressModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

/**
 * Progress — the companion, its evolution, the streak, and the participant's
 * own planning figures. Lives at the `pet` route (the tab is labelled
 * "Progress"; the route name is kept so nothing that links here changes).
 *
 * The sprite is the actual PetQuest asset for the stored `pet_level`; the
 * evolution bar is derived from `total_points_earned` with the same thresholds
 * the server's `pet_level` CASE uses. Metrics are computed from the
 * participant's own `tasks` rows only (progressModel.ts). Nothing here is
 * estimated: an unloaded value shows as a dash.
 *
 * Care actions (feed / wash / play) call the `care_pet()` RPC. The balance and
 * stats shown afterwards are the ones the server returned — this client never
 * computes a debit or a stat boost itself.
 */
export default function ProgressTab() {
  const { session, profile, refreshProfile } = useAuth();
  const userId = session?.user?.id ?? null;

  const stats = useAsyncData(
    useCallback(() => (userId ? fetchPetStats(userId) : Promise.resolve({ data: null, error: null })), [userId]),
    { enabled: !!userId },
  );
  const tasks = useAsyncData(
    useCallback(() => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), stats.refresh(), tasks.refresh()]);
  }, [refreshProfile, stats, tasks]);

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
  const accent = petId ? PetAccents[petId] : PetAccents.dragon;
  const metrics = useMemo(() => progressMetrics(tasks.data), [tasks.data]);

  return (
    <ScreenContainer
      insetBottom={false}
      refreshControl={<RefreshControl refreshing={stats.refreshing || tasks.refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Text style={styles.title}>Progress</Text>

      {/* Companion */}
      <View style={styles.hero}>
        <PetHero
          sprite={sprite}
          accent={accent}
          size={148}
          accessibilityLabel={meta ? `${meta.species}, ${stageName(level)} stage` : 'No companion yet'}
        />
        {meta ? (
          <>
            <Text style={styles.petName}>{meta.name}</Text>
            <Text style={styles.petSpecies}>
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
        <>
          <SectionLabel>Evolution</SectionLabel>
          <Surface style={styles.block}>
            <View style={styles.stageRow}>
              {STAGES.map((s, i) => {
                const reached = level >= s.level;
                const current = level === s.level || (level >= 5 && i === STAGES.length - 1);
                return (
                  <View key={s.key} style={styles.stageItem} accessibilityLabel={`${s.label}${reached ? ', reached' : ''}${current ? ', current' : ''}`}>
                    <View style={[styles.stageDot, reached && styles.stageDotReached, current && styles.stageDotCurrent]} />
                    <Text style={[styles.stageLabel, reached && styles.stageLabelReached]} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            {totalEarned == null ? (
              <Text style={styles.muted}>—</Text>
            ) : progress.nextAt != null && progress.remaining != null ? (
              <>
                <ProgressBar fraction={progress.fraction} accessibilityLabel={`${progress.remaining} points to ${stageName(level + 1)}`} />
                <Text style={styles.caption}>
                  {totalEarned.toLocaleString()} / {progress.nextAt.toLocaleString()} lifetime points · {progress.remaining.toLocaleString()} to{' '}
                  {stageName(level + 1)}
                </Text>
              </>
            ) : (
              <Text style={styles.caption}>
                {totalEarned.toLocaleString()} lifetime points · Legendary ({LEGENDARY_MIN.toLocaleString()}+)
              </Text>
            )}
          </Surface>
        </>
      )}

      {/* Streak + balance */}
      <SectionLabel style={styles.sectionGap}>Streak</SectionLabel>
      <Surface style={styles.block}>
        <View style={styles.figures}>
          <Figure label="Current" value={fmtDays(profile?.current_streak)} />
          <Figure label="Longest" value={fmtDays(profile?.longest_streak)} />
          <Figure label="Points" value={fmt(livePoints)} />
        </View>
      </Surface>

      {/* Planning — own data only */}
      <SectionLabel style={styles.sectionGap}>Planning</SectionLabel>
      <Surface style={styles.block}>
        {tasks.loading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} style={{ marginTop: Spacing.md }} />
          </>
        ) : tasks.error ? (
          <ErrorState body={tasks.error} onRetry={tasks.refetch} />
        ) : (
          <>
            <Metric
              label="On time"
              value={formatPct(metrics.onTimeRate)}
              fraction={metrics.onTimeRate == null ? null : metrics.onTimeRate / 100}
              hint={
                metrics.planned > 0
                  ? `${metrics.onTime} of ${metrics.planned} planned quests finished by their planned time`
                  : 'Finish a quest with a planned time to see this'
              }
            />
            <Metric
              label="Planned ahead"
              value={formatPct(metrics.planningRate)}
              fraction={metrics.planningRate == null ? null : metrics.planningRate / 100}
              hint={metrics.planningRate == null ? 'No quests yet' : 'Share of your quests created with a planned finish time'}
            />
            <View style={styles.figures}>
              <Figure label="Completed" value={String(metrics.completed)} />
              <Figure label="Finished late" value={String(metrics.late)} />
              <Figure label="Avg. delay" value={formatMinutes(metrics.avgDelayMinutes)} />
            </View>
          </>
        )}
      </Surface>

      {/* Care */}
      <SectionLabel style={styles.sectionGap}>Care</SectionLabel>
      <Surface style={styles.block}>
        {stats.loading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} style={{ marginTop: Spacing.md }} />
            <Skeleton height={16} style={{ marginTop: Spacing.md }} />
          </>
        ) : stats.error ? (
          <ErrorState body={stats.error} onRetry={stats.refetch} />
        ) : (
          <>
            <StatBar label="Hunger" value={liveStats?.hunger ?? null} color={Colors.accentWarm} />
            <StatBar label="Cleanliness" value={liveStats?.cleanliness ?? null} color={Colors.primary} />
            <StatBar label="Happiness" value={liveStats?.happiness ?? null} color={Colors.success} />

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
                        style={({ pressed }) => [styles.careBtn, pressed && styles.carePressed, disabled && !busy && styles.disabled]}
                      >
                        <Text style={styles.careEmoji}>{a.emoji}</Text>
                        <Text style={styles.careLabel}>{busy ? '…' : a.label}</Text>
                        <Text style={styles.careCost}>{CARE_COST} pts</Text>
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
                  Each action costs {CARE_COST} points and is settled by the server, so the balance and stats you see afterwards are the real ones.
                </Text>
              </>
            ) : (
              <Text style={styles.footnote}>Hatch your companion on the PetQuest website to start caring for it.</Text>
            )}
          </>
        )}
      </Surface>
    </ScreenContainer>
  );
}

const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtDays = (n: number | null | undefined) => (typeof n === 'number' ? `${n} day${n === 1 ? '' : 's'}` : '—');

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.figureLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function Metric({ label, value, fraction, hint }: { label: string; value: string; fraction: number | null; hint: string }) {
  return (
    <View style={styles.metric} accessibilityLabel={`${label}: ${value}. ${hint}`}>
      <View style={styles.metricHead}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <ProgressBar fraction={fraction ?? 0} height={6} />
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

/** A 0–100 bar. `null` renders as an empty track with a dash, not as 0%. */
function StatBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.metric} accessibilityLabel={`${label}: ${value == null ? 'unknown' : `${pct} percent`}`}>
      <View style={styles.metricHead}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value == null ? '—' : `${pct}%`}</Text>
      </View>
      <ProgressBar fraction={pct / 100} height={6} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.ink, fontSize: FontSize.xl, fontWeight: '700', letterSpacing: -0.3, marginBottom: Spacing.sm },

  hero: { alignItems: 'center', paddingVertical: Spacing.sm, marginBottom: Spacing.md },
  petName: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.xs },
  petSpecies: { color: Colors.inkMuted, fontSize: FontSize.sm, marginTop: 2 },

  sectionGap: { marginTop: Spacing.lg },
  block: { marginBottom: Spacing.xs },

  stageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  stageItem: { alignItems: 'center', gap: 6, flex: 1 },
  stageDot: { width: 12, height: 12, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.borderStrong, backgroundColor: Colors.surface },
  stageDotReached: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stageDotCurrent: { width: 16, height: 16, borderColor: Colors.primaryPressed },
  stageLabel: { color: Colors.inkMuted, fontSize: FontSize.xs },
  stageLabelReached: { color: Colors.ink, fontWeight: '600' },
  caption: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 16 },
  muted: { color: Colors.inkMuted, fontSize: FontSize.sm, textAlign: 'center' },

  figures: { flexDirection: 'row', gap: Spacing.sm },
  figure: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs },
  figureValue: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700' },
  figureLabel: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: 2, textAlign: 'center' },

  metric: { marginBottom: Spacing.md },
  metricHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  metricLabel: { color: Colors.inkSoft, fontSize: FontSize.sm, fontWeight: '600' },
  metricValue: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  hint: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: 6, lineHeight: 16 },
  footnote: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.sm },

  careRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  careBtn: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xs,
  },
  carePressed: { backgroundColor: Colors.primaryTint, borderColor: Colors.primary },
  careEmoji: { fontSize: 20 },
  careLabel: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  careCost: { color: Colors.primary, fontSize: FontSize.xs },
  disabled: { opacity: 0.45 },
  notice: { fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center', marginTop: Spacing.sm },
  noticeOk: { color: Colors.success },
  noticeBad: { color: Colors.warning },
});
