import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { PetHomeHero } from '@/components/PetHomeHero';
import ScreenContainer from '@/components/ScreenContainer';
import { StatusRing } from '@/components/StatusRing';
import { ErrorState } from '@/components/states';
import { PrimaryButton, SecondaryButton, SectionLabel, Skeleton, StatusPill, Surface } from '@/components/ui';
import { RARITY_COLORS, canEquip, countOwned, decorate, equippedGlyphs, groupByCategory, type AccessoryRow } from '@/data/accessoryModel';
import { equipAccessory, fetchEquippedAccessories, fetchOwnedAccessories, unequipCategory } from '@/data/accessories';
import { carePet } from '@/data/care';
import { CARE_ACTIONS, CARE_BOOST, CARE_COST, canAfford, careErrorMessage, careSuccessMessage, type CareAction, type CareStats } from '@/data/careModel';
import { STAT_META } from '@/data/petHomeModel';
import { homeAndImageFor } from '@/data/petHomes';
import { LEGENDARY_MIN, PET_CATALOG, STAGES, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { fetchPetStats } from '@/data/petStats';
import { formatMinutes, formatPct, progressMetrics } from '@/data/progressModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing, TapTarget } from '@/theme';

/**
 * Pet — two views under one segmented control:
 *
 *   Pet home     the companion in its own environment, the three status
 *                rings, Feed / Wash / Play, evolution, streak, planning
 *   Accessories  what the companion wears; equipped first, then owned, then
 *                locked (with the cost). Equip / Remove only; purchases go to
 *                the website until a `buy_accessory()` RPC exists.
 *
 * Route params: `?view=accessories` opens the second view; `?action=feed`
 * (wash / play) highlights that care button — Home's status rings link here
 * with the matching action, and never spend anything themselves.
 *
 * Every figure is server data. Care calls `care_pet()`; the balance and stats
 * shown afterwards are the ones it returned. Equipping writes only an id the
 * server's own `owned_accessories` list contains.
 */
type PetView = 'home' | 'accessories';

export default function PetTab() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; action?: string }>();
  const userId = session?.user?.id ?? null;
  const [view, setView] = useState<PetView>(params.view === 'accessories' ? 'accessories' : 'home');
  const [highlight, setHighlight] = useState<CareAction | null>(isCareAction(params.action) ? params.action : null);

  useEffect(() => {
    if (params.view === 'accessories') setView('accessories');
    else if (params.view === 'home') setView('home');
    setHighlight(isCareAction(params.action) ? params.action : null);
  }, [params.view, params.action]);

  const stats = useAsyncData(
    useCallback(() => (userId ? fetchPetStats(userId) : Promise.resolve({ data: null, error: null })), [userId]),
    { enabled: !!userId },
  );
  const tasks = useAsyncData(
    useCallback(() => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );
  const owned = useAsyncData(
    useCallback(() => (userId ? fetchOwnedAccessories(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );
  const equipped = useAsyncData(
    useCallback(() => (userId ? fetchEquippedAccessories(userId) : Promise.resolve({ data: {}, error: null })), [userId]),
    { enabled: !!userId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), stats.refresh(), tasks.refresh(), owned.refresh(), equipped.refresh()]);
  }, [refreshProfile, stats, tasks, owned, equipped]);

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

  const petId = petIdOf(profile?.selected_pet_id);
  const meta = petId ? PET_CATALOG[petId] : null;
  const totalEarned = profile?.total_points_earned ?? null;
  const progress = evolutionProgress(totalEarned);
  const level = profile?.pet_level ?? progress.level;
  const sprite = spriteFor(profile?.selected_pet_id, level);
  const { home, image } = homeAndImageFor(profile?.selected_pet_id);
  const metrics = useMemo(() => progressMetrics(tasks.data), [tasks.data]);
  const glyphs = useMemo(() => equippedGlyphs(equipped.data), [equipped.data]);

  /* Care: confirm (cost + benefit) → care_pet() → show only what it returned. */
  const runCare = useCallback(
    async (action: CareAction) => {
      if (busyAction) return; // a second tap while one is in flight does nothing
      setBusyAction(action);
      const r = await carePet(action);
      setBusyAction(null);
      if (typeof r.points === 'number') setLivePoints(r.points);
      if (!r.ok) {
        setNotice({ text: careErrorMessage(r.error), tone: 'bad' });
        return;
      }
      setLiveStats(r.stats);
      const text = careSuccessMessage(action, meta?.name ?? null);
      setNotice({ text, tone: 'ok' });
      AccessibilityInfo.announceForAccessibility(text);
      void refreshProfile(); // re-syncs the header balance from the server
    },
    [busyAction, meta?.name, refreshProfile],
  );

  const confirmCare = useCallback(
    (action: CareAction) => {
      if (busyAction) return;
      if (!canAfford(livePoints)) {
        setNotice({ text: careErrorMessage('insufficient_points'), tone: 'bad' });
        return;
      }
      const a = CARE_ACTIONS.find((c) => c.key === action)!;
      const stat = STAT_META.find((s) => s.action === action)!;
      Alert.alert(
        `${a.label} ${meta?.name ?? 'your companion'}?`,
        `Costs ${CARE_COST} points and raises ${stat.label} by up to ${CARE_BOOST}. The server settles it; you will see the real result.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `${a.label} · ${CARE_COST} pts`, onPress: () => void runCare(action) },
        ],
      );
    },
    [busyAction, livePoints, meta?.name, runCare],
  );

  const levelLine =
    totalEarned == null
      ? null
      : progress.nextAt != null && progress.remaining != null
        ? `${totalEarned.toLocaleString()} / ${progress.nextAt.toLocaleString()} · ${progress.remaining.toLocaleString()} to ${stageName(level + 1)}`
        : `${totalEarned.toLocaleString()} lifetime points · Legendary (${LEGENDARY_MIN.toLocaleString()}+)`;

  return (
    <ScreenContainer
      insetBottom={false}
      refreshControl={
        <RefreshControl refreshing={stats.refreshing || tasks.refreshing || owned.refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <Text style={styles.title}>Pet</Text>

      {/* Segmented control */}
      <View style={styles.segments} accessibilityRole="tablist">
        {(
          [
            { key: 'home', label: 'Pet home', icon: 'home-outline' },
            { key: 'accessories', label: 'Accessories', icon: 'shirt-outline' },
          ] as { key: PetView; label: string; icon: keyof typeof Ionicons.glyphMap }[]
        ).map((s) => {
          const active = view === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => setView(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={s.label}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Ionicons name={s.icon} size={16} color={active ? Colors.onPrimary : Colors.inkSoft} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <PetHomeHero
        home={home}
        homeImage={image}
        sprite={sprite}
        petName={meta?.name ?? 'No companion yet'}
        stageLabel={meta ? stageName(level) : null}
        levelLine={meta ? levelLine : 'Hatch your egg on the PetQuest website'}
        fraction={meta && totalEarned != null ? progress.fraction : null}
        accessoryEmojis={glyphs}
        compact={view === 'accessories'}
      />

      {view === 'home' ? (
        <>
          {/* Status rings */}
          <SectionLabel style={styles.sectionGap}>Status</SectionLabel>
          <Surface style={styles.block}>
            {stats.error ? (
              <ErrorState body={stats.error} onRetry={stats.refetch} />
            ) : (
              <View style={styles.rings}>
                {STAT_META.map((s) => (
                  <StatusRing
                    key={s.key}
                    label={s.label}
                    value={stats.loading ? null : (liveStats?.[s.key] ?? null)}
                    color={s.color}
                    icon={STAT_ICONS[s.key]}
                    actionHint={`${s.actionLabel} to raise it`}
                    onPress={() => setHighlight(s.action)}
                  />
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
                    const lit = highlight === a.key;
                    return (
                      <Pressable
                        key={a.key}
                        onPress={() => confirmCare(a.key)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel={`${a.label} ${meta.name}, ${CARE_COST} points, raises ${stat.label}`}
                        accessibilityState={{ disabled, busy }}
                        style={({ pressed }) => [
                          styles.careBtn,
                          lit && { borderColor: stat.color, backgroundColor: `${stat.color}1A` },
                          pressed && styles.carePressed,
                          disabled && !busy && styles.disabled,
                        ]}
                      >
                        <Text style={styles.careEmoji}>{a.emoji}</Text>
                        <Text style={styles.careLabel}>{busy ? '…' : a.label}</Text>
                        <Text style={[styles.careCost, { color: stat.color }]}>
                          {CARE_COST} pts · +{stat.label.toLowerCase()}
                        </Text>
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
                  Each action costs {CARE_COST} points and raises its stat by up to {CARE_BOOST}. You confirm first; the server settles it, so the balance and
                  rings you see afterwards are the real ones.
                </Text>
              </>
            ) : (
              <Text style={styles.footnote}>Hatch your companion on the PetQuest website to start caring for it.</Text>
            )}
          </Surface>

          {/* Evolution */}
          {meta && (
            <>
              <SectionLabel style={styles.sectionGap}>Evolution</SectionLabel>
              <Surface style={styles.block}>
                <View style={styles.stageRow}>
                  {STAGES.map((s, i) => {
                    const reached = level >= s.level;
                    const current = level === s.level || (level >= 5 && i === STAGES.length - 1);
                    return (
                      <View key={s.key} style={styles.stageItem} accessibilityLabel={`${s.label}${reached ? ', reached' : ''}${current ? ', current' : ''}`}>
                        <View style={[styles.stageDot, reached && { backgroundColor: home.palette.accent, borderColor: home.palette.accent }, current && styles.stageDotCurrent]} />
                        <Text style={[styles.stageLabel, reached && styles.stageLabelReached]} numberOfLines={1}>
                          {s.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
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
                  hint={
                    metrics.planned > 0
                      ? `${metrics.onTime} of ${metrics.planned} planned quests finished by their planned time`
                      : 'Finish a quest with a planned time to see this'
                  }
                />
                <Metric
                  label="Planned ahead"
                  value={formatPct(metrics.planningRate)}
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
        </>
      ) : (
        <AccessoriesView
          userId={userId}
          owned={owned.data}
          equipped={equipped.data}
          loading={owned.loading || equipped.loading}
          error={owned.error ?? equipped.error}
          onRetry={() => {
            void owned.refetch();
            void equipped.refetch();
          }}
          onChanged={async () => {
            await equipped.refresh();
          }}
          points={livePoints}
          hasPet={!!meta}
          onOpenQuests={() => router.push('/quests')}
        />
      )}
    </ScreenContainer>
  );
}

const STAT_ICONS = { hunger: 'restaurant-outline', cleanliness: 'water-outline', happiness: 'happy-outline' } as const;

const isCareAction = (v: unknown): v is CareAction => v === 'feed' || v === 'wash' || v === 'play';

/* ── Accessories ── */

function AccessoriesView({
  userId,
  owned,
  equipped,
  loading,
  error,
  onRetry,
  onChanged,
  points,
  hasPet,
  onOpenQuests,
}: {
  userId: string | null;
  owned: string[] | null;
  equipped: Parameters<typeof decorate>[1];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onChanged: () => Promise<void>;
  points: number | null;
  hasPet: boolean;
  onOpenQuests: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = useMemo(() => decorate(owned, equipped), [owned, equipped]);
  const groups = useMemo(() => groupByCategory(rows), [rows]);
  const ownedCount = countOwned(rows);

  const toggle = async (row: AccessoryRow) => {
    if (!userId || busyId) return;
    if (!canEquip(row)) return; // locked: the button is not rendered, but never trust the tap
    setBusyId(row.id);
    const r = row.equipped ? await unequipCategory(userId, row.category) : await equipAccessory(userId, row.id, owned ?? []);
    setBusyId(null);
    if (r.error) {
      setMessage(r.error);
      return;
    }
    setMessage(null);
    await onChanged(); // re-read equipped from the server; the hero updates from that
  };

  return (
    <>
      <SectionLabel style={styles.sectionGap}>Accessories</SectionLabel>
      <Surface style={styles.block}>
        {loading ? (
          <>
            <Skeleton height={56} />
            <Skeleton height={56} style={{ marginTop: Spacing.sm }} />
            <Skeleton height={56} style={{ marginTop: Spacing.sm }} />
          </>
        ) : error ? (
          <ErrorState body={error} onRetry={onRetry} />
        ) : (
          <>
            <Text style={styles.accSummary}>
              {ownedCount} of {rows.length} unlocked{points != null ? ` · ${points.toLocaleString()} points` : ''}
            </Text>
            {message ? (
              <Text style={[styles.notice, styles.noticeBad]} accessibilityLiveRegion="polite">
                {message}
              </Text>
            ) : null}
            {groups.map((g) => (
              <View key={g.category} style={styles.group}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                {g.items.map((row) => (
                  <View key={row.id} style={styles.accRow}>
                    <Text style={styles.accEmoji} accessibilityElementsHidden>
                      {row.emoji}
                    </Text>
                    <View style={styles.accBody}>
                      <Text style={styles.accName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.accDesc} numberOfLines={1}>
                        {row.description}
                      </Text>
                      <View style={styles.accPills}>
                        <Text style={[styles.rarity, { color: RARITY_COLORS[row.rarity] }]}>{row.rarity}</Text>
                        {row.equipped ? (
                          <StatusPill label="Equipped" tone="active" icon="checkmark" />
                        ) : row.owned ? (
                          <StatusPill label="Unlocked" tone="good" />
                        ) : (
                          <StatusPill label={`Locked · ${row.cost} pts`} tone="neutral" icon="lock-closed-outline" />
                        )}
                      </View>
                    </View>
                    {row.owned ? (
                      <SecondaryButton
                        label={row.equipped ? 'Remove' : 'Equip'}
                        accessibilityLabel={`${row.equipped ? 'Remove' : 'Equip'} ${row.name}`}
                        onPress={() => void toggle(row)}
                        busy={busyId === row.id}
                        disabled={busyId != null || !hasPet}
                        style={styles.accButton}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.shopNote}>
              <Ionicons name="storefront-outline" size={16} color={Colors.inkMuted} />
              <Text style={styles.footnoteInline}>
                Unlocking is on the PetQuest website for now — the phone will get the shop once purchases are settled by the server in one step.
              </Text>
            </View>
            <PrimaryButton label="Earn points with a quest" icon="arrow-forward" onPress={onOpenQuests} style={styles.blockButton} />
          </>
        )}
      </Surface>
    </>
  );
}

/* ── Small pieces ── */

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

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.metric} accessibilityLabel={`${label}: ${value}. ${hint}`}>
      <View style={styles.metricHead}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.ink, fontSize: FontSize.xl, fontWeight: '700', letterSpacing: -0.3, marginBottom: Spacing.sm },

  segments: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  segment: { flex: 1, minHeight: TapTarget - 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.sm },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.inkSoft, fontSize: FontSize.sm, fontWeight: '700' },
  segmentTextActive: { color: Colors.onPrimary },

  sectionGap: { marginTop: Spacing.lg },
  block: { marginBottom: Spacing.xs },
  blockButton: { marginTop: Spacing.md },

  rings: { flexDirection: 'row', gap: Spacing.xs },

  careRow: { flexDirection: 'row', gap: Spacing.sm },
  careBtn: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 2,
  },
  carePressed: { backgroundColor: Colors.primaryTint, borderColor: Colors.primary },
  careEmoji: { fontSize: 20 },
  careLabel: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  careCost: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  notice: { fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center', marginTop: Spacing.sm },
  noticeOk: { color: Colors.success },
  noticeBad: { color: Colors.warning },
  footnote: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.sm },
  footnoteInline: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16, flex: 1 },

  stageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stageItem: { alignItems: 'center', gap: 6, flex: 1 },
  stageDot: { width: 12, height: 12, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.borderStrong, backgroundColor: Colors.surface },
  stageDotCurrent: { width: 16, height: 16 },
  stageLabel: { color: Colors.inkMuted, fontSize: FontSize.xs },
  stageLabelReached: { color: Colors.ink, fontWeight: '600' },

  figures: { flexDirection: 'row', gap: Spacing.sm },
  figure: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs },
  figureValue: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700' },
  figureLabel: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: 2, textAlign: 'center' },

  metric: { marginBottom: Spacing.md },
  metricHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  metricLabel: { color: Colors.inkSoft, fontSize: FontSize.sm, fontWeight: '600' },
  metricValue: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  hint: { color: Colors.inkMuted, fontSize: FontSize.xs, lineHeight: 16 },

  accSummary: { color: Colors.inkSoft, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  group: { marginTop: Spacing.sm },
  groupLabel: { color: Colors.inkMuted, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.xs },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  accEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  accBody: { flex: 1, gap: 2 },
  accName: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  accDesc: { color: Colors.inkMuted, fontSize: FontSize.xs },
  accPills: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  rarity: { fontSize: FontSize.xs, fontWeight: '700' },
  accButton: { paddingHorizontal: Spacing.md, minHeight: TapTarget - 8 },
  shopNote: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
});
