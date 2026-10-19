import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { ErrorState } from '@/components/states';
import { PetHomeHero } from '@/components/PetHomeHero';
import { StatusRing } from '@/components/StatusRing';
import { PrimaryButton, SecondaryButton, SectionLabel, Skeleton, StatusPill, Surface, TextButton, type Tone } from '@/components/ui';
import { latestByQuest } from '@/data/completionModel';
import { fetchRecentCompletions } from '@/data/completions';
import { greeting, heroMessage, nextQuest, nextQuestAction, plannedLabel, todaySummary, todaysPath, type PathRow } from '@/data/homeModel';
import { STAT_META } from '@/data/petHomeModel';
import { homeAndImageFor } from '@/data/petHomes';
import { LEGENDARY_MIN, PET_CATALOG, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { fetchPetStats } from '@/data/petStats';
import { framesFor } from '@/data/spriteFrames';
import { DIFF_POINTS, difficultyMeta, type Difficulty } from '@/data/quests';
import { type Task } from '@/data/taskModel';
import { fetchTasks } from '@/data/tasks';
import { useMood } from '@/hooks/useMood';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, DifficultyColors, FontSize, Radius, Spacing, TapTarget } from '@/theme';

/**
 * Home — "Today's Adventure".
 *
 * One calm column: a short greeting, the companion, ONE next quest with ONE
 * action, today's path, and a small summary. Every figure comes from the
 * server — the participant's `tasks` and their latest `quest_completions` —
 * and a value that has not loaded shows as a skeleton or a dash, never a zero.
 *
 * Nothing here writes. The primary action only routes: to the quest screen or
 * straight into the existing evidence flow. Points, streaks and approvals move
 * only through the server RPCs the other screens call.
 */
export default function HomeTab() {
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;

  const tasks = useAsyncData(
    useCallback(() => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );
  const completions = useAsyncData(
    useCallback(
      () => (userId ? fetchRecentCompletions(userId) : Promise.resolve({ data: [], error: null })),
      [userId],
    ),
    { enabled: !!userId },
  );
  // Read-only here. The rings show whatever pet_stats holds; the only thing
  // that changes it is care_pet(), which lives on the Pet tab.
  const stats = useAsyncData(
    useCallback(() => (userId ? fetchPetStats(userId) : Promise.resolve({ data: null, error: null })), [userId]),
    { enabled: !!userId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), tasks.refresh(), completions.refresh(), stats.refresh()]);
  }, [refreshProfile, tasks, completions, stats]);

  const byQuest = useMemo(() => latestByQuest(completions.data), [completions.data]);
  const loading = tasks.loading || completions.loading;
  const next = useMemo(() => (loading ? null : nextQuest(tasks.data, byQuest)), [loading, tasks.data, byQuest]);
  const path = useMemo(() => (loading ? { rows: [], truncated: false } : todaysPath(tasks.data, byQuest)), [loading, tasks.data, byQuest]);
  const summary = useMemo(() => todaySummary(tasks.data), [tasks.data]);

  const petId = petIdOf(profile?.selected_pet_id);
  const meta = petId ? PET_CATALOG[petId] : null;
  const totalEarned = profile?.total_points_earned ?? null;
  const progress = evolutionProgress(totalEarned);
  const level = profile?.pet_level ?? progress.level;
  const sprite = spriteFor(profile?.selected_pet_id, level);
  const { home, image } = homeAndImageFor(profile?.selected_pet_id);
  // A server-confirmed moment the pet may comment on: a completion verified today.
  const verifiedToday = useMemo(() => {
    const today = new Date();
    return (completions.data ?? []).find((c) => c.status === 'verified' && c.admin_reviewed_at && isSameDay(new Date(c.admin_reviewed_at), today)) ?? null;
  }, [completions.data]);
  const { mood, message } = useMood(
    stats.data ? { hunger: stats.data.hunger, cleanliness: stats.data.cleanliness, happiness: stats.data.happiness } : null,
    petId,
    verifiedToday ? { kind: 'verified', nonce: new Date(verifiedToday.admin_reviewed_at!).getTime() } : null,
  );
  // Baby-stage companions walk their home; later stages keep the evolution portrait.
  const walking = meta && level === 1 ? { frames: framesFor(profile?.selected_pet_id), mood, petId, message } : null;
  const streak = profile?.current_streak;
  const levelLine =
    !meta
      ? 'Hatch your egg on the PetQuest website'
      : totalEarned == null
        ? null
        : progress.nextAt != null && progress.remaining != null
          ? `${totalEarned.toLocaleString()} / ${progress.nextAt.toLocaleString()} · ${progress.remaining.toLocaleString()} to ${stageName(level + 1)}`
          : `${totalEarned.toLocaleString()} lifetime points · Legendary (${LEGENDARY_MIN.toLocaleString()}+)`;

  const openQuest = (task: Task) => router.push({ pathname: '/quest/[id]', params: { id: task.id } });
  const openEvidence = (task: Task) => router.push({ pathname: '/quest/verify', params: { questId: task.id } });

  return (
    <ScreenContainer
      insetBottom={false}
      refreshControl={
        <RefreshControl refreshing={tasks.refreshing || completions.refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting()}
            {profile?.username ? `, ${profile.username}` : ''}
          </Text>
          <Text style={styles.subline} numberOfLines={1}>
            {typeof streak === 'number'
              ? streak > 0
                ? `Day ${streak} of your streak`
                : 'Start a streak today'
              : ' '}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
          hitSlop={8}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons name="person-circle-outline" size={28} color={Colors.inkSoft} />
        </Pressable>
      </View>

      {/* Pet home hero — tapping the caption opens the close-up */}
      <View style={styles.hero}>
        <PetHomeHero
          home={home}
          homeImage={image}
          sprite={sprite}
          petName={meta?.name ?? 'No companion yet'}
          stageLabel={meta ? stageName(level) : null}
          levelLine={levelLine}
          fraction={meta && totalEarned != null ? progress.fraction : null}
          compact
          walking={walking}
        />
        <View style={styles.heroRow}>
          <Text style={styles.heroMessage} numberOfLines={1}>
            {loading ? ' ' : meta ? heroMessage(next, summary) : 'Hatch your egg on the PetQuest website'}
          </Text>
          {meta ? <TextButton label="View pet" onPress={() => router.push('/companion/view')} /> : null}
        </View>
      </View>

      {/* Status rings — tapping one opens the Pet tab with that care action highlighted; nothing is spent here */}
      {meta && (
        <Surface style={styles.block}>
          {stats.error ? (
            <ErrorState body={stats.error} onRetry={stats.refetch} />
          ) : (
            <View style={styles.rings}>
              {STAT_META.map((s) => (
                <StatusRing
                  key={s.key}
                  label={s.label}
                  value={stats.loading ? null : (stats.data?.[s.key] ?? null)}
                  color={s.color}
                  icon={STAT_ICONS[s.key]}
                  size={68}
                  actionHint={`Opens ${s.actionLabel}`}
                  onPress={() => router.push({ pathname: '/pet', params: { action: s.action } })}
                />
              ))}
            </View>
          )}
          <SecondaryButton
            label="Care for your pet"
            icon="paw-outline"
            onPress={() => router.push({ pathname: '/pet', params: { view: 'home' } })}
            style={styles.careButton}
          />
        </Surface>
      )}

      {/* Next quest */}
      <SectionLabel>Next quest</SectionLabel>
      {tasks.error || completions.error ? (
        <Surface style={styles.block}>
          <ErrorState body={tasks.error ?? completions.error ?? undefined} onRetry={onRefresh} />
        </Surface>
      ) : loading ? (
        <Surface style={styles.block}>
          <Skeleton height={22} width="70%" />
          <Skeleton height={14} width="40%" style={{ marginTop: Spacing.sm }} />
          <Skeleton height={TapTarget} style={{ marginTop: Spacing.md }} />
        </Surface>
      ) : next ? (
        <NextQuestCard
          task={next}
          action={nextQuestAction(next, byQuest[next.id] ?? null)}
          onOpen={() => openQuest(next)}
          onEvidence={() => openEvidence(next)}
        />
      ) : (
        <Surface style={styles.block}>
          <Text style={styles.emptyTitle}>{summary.completedToday > 0 ? 'Nothing left for today' : 'No quest is ready yet'}</Text>
          <Text style={styles.emptyBody}>
            {summary.completedToday > 0
              ? 'Every ready quest is done. Add another when you want more.'
              : 'Create a quest, or wait for the quality check on the ones you have.'}
          </Text>
          <PrimaryButton label="Create a quest" icon="add" onPress={() => router.push('/quest/create')} style={styles.blockButton} />
        </Surface>
      )}

      {/* Today's path */}
      <SectionLabel style={styles.sectionGap}>Today's path</SectionLabel>
      <Surface style={styles.block}>
        {loading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} style={{ marginTop: Spacing.md }} />
            <Skeleton height={16} style={{ marginTop: Spacing.md }} />
          </>
        ) : path.rows.length === 0 ? (
          <Text style={styles.emptyBody}>Nothing planned for today. Quests with a planned time show up here.</Text>
        ) : (
          path.rows.map((row, i) => (
            <PathItem key={row.task.id} row={row} last={i === path.rows.length - 1} onPress={() => openQuest(row.task)} />
          ))
        )}
        {(path.truncated || (!loading && (tasks.data?.length ?? 0) > path.rows.length)) && (
          <TextButton label="View all quests" onPress={() => router.push('/quests')} />
        )}
      </Surface>

      {/* Compact summary */}
      <View style={styles.summary}>
        <Summary label="Done today" value={loading ? '—' : String(summary.completedToday)} />
        <Summary label="Streak" value={typeof streak === 'number' ? `${streak}d` : '—'} />
        <Summary label={meta ? stageName(level) : 'Level'} value={meta && totalEarned != null ? `Lv ${level}` : '—'} />
      </View>
    </ScreenContainer>
  );
}

function NextQuestCard({
  task,
  action,
  onOpen,
  onEvidence,
}: {
  task: Task;
  action: ReturnType<typeof nextQuestAction>;
  onOpen: () => void;
  onEvidence: () => void;
}) {
  const difficulty = (task.difficulty ?? 'easy') as Difficulty;
  const d = difficultyMeta(difficulty);
  const planned = plannedLabel(task);
  return (
    <Surface style={styles.next}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open quest: ${task.text}`} style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.nextTitle}>{task.text}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: DifficultyColors[difficulty] }]} />
          <Text style={styles.meta}>
            {d.label} · {DIFF_POINTS[difficulty]} pts
            {planned ? ` · ${planned}` : ''}
          </Text>
        </View>
      </Pressable>
      <PrimaryButton
        label={action.label}
        icon={action.route === 'verify' ? 'camera-outline' : 'arrow-forward'}
        onPress={action.route === 'verify' ? onEvidence : onOpen}
        style={styles.blockButton}
      />
    </Surface>
  );
}

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const STAT_ICONS = { hunger: 'restaurant-outline', cleanliness: 'water-outline', happiness: 'happy-outline' } as const;

const ICONS: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  good: 'checkmark-circle',
  waiting: 'time-outline',
  bad: 'close-circle-outline',
  active: 'play-circle-outline',
  neutral: 'ellipse-outline',
};

function PathItem({ row, last, onPress }: { row: PathRow; last: boolean; onPress: () => void }) {
  const difficulty = (row.task.difficulty ?? 'easy') as Difficulty;
  const d = difficultyMeta(difficulty);
  const tone = row.status.tone;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.task.text}, ${row.status.label}`}
      style={({ pressed }) => [styles.pathRow, pressed && styles.pressed]}
    >
      <View style={styles.pathNode}>
        <Ionicons name={ICONS[tone]} size={20} color={toneFg(tone)} />
        {!last && <View style={styles.pathLine} />}
      </View>
      <View style={styles.pathBody}>
        <Text style={[styles.pathTitle, tone === 'good' && styles.pathTitleDone]} numberOfLines={2}>
          {row.task.text}
        </Text>
        <Text style={styles.pathMeta} numberOfLines={1}>
          {d.label}
          {row.planned ? ` · ${row.planned}` : ''}
          {row.task.completed && row.task.completion_duration_minutes != null ? ` · ${row.task.completion_duration_minutes} min` : ''}
        </Text>
      </View>
      <StatusPill label={row.status.label} tone={tone} />
    </Pressable>
  );
}

const toneFg = (tone: Tone) =>
  tone === 'good' ? Colors.success : tone === 'bad' ? Colors.warning : tone === 'waiting' ? Colors.accentWarm : tone === 'active' ? Colors.primary : Colors.inkFaint;

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  headerText: { flex: 1 },
  greeting: { color: Colors.ink, fontSize: FontSize.xl, fontWeight: '700', letterSpacing: -0.3 },
  subline: { color: Colors.inkMuted, fontSize: FontSize.sm, marginTop: 2 },
  headerButton: { width: TapTarget, height: TapTarget, alignItems: 'center', justifyContent: 'center' },

  hero: { marginBottom: Spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.xs, paddingHorizontal: Spacing.xs },
  heroMessage: { color: Colors.inkSoft, fontSize: FontSize.md, flexShrink: 1 },
  rings: { flexDirection: 'row', gap: Spacing.xs },
  careButton: { marginTop: Spacing.sm },

  sectionGap: { marginTop: Spacing.lg },
  block: { marginBottom: Spacing.xs },
  blockButton: { marginTop: Spacing.md },

  next: { borderColor: Colors.primary, borderWidth: 1.5 },
  nextTitle: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700', lineHeight: 26 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  meta: { color: Colors.inkMuted, fontSize: FontSize.sm, flexShrink: 1 },

  emptyTitle: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '700' },
  emptyBody: { color: Colors.inkMuted, fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing.xs },

  pathRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, minHeight: TapTarget },
  pathNode: { width: 24, alignItems: 'center', alignSelf: 'stretch' },
  pathLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginVertical: 2 },
  pathBody: { flex: 1, paddingBottom: Spacing.md },
  pathTitle: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '600', lineHeight: 22 },
  pathTitleDone: { color: Colors.inkMuted },
  pathMeta: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: 2 },

  summary: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  summaryValue: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700' },
  summaryLabel: { color: Colors.inkMuted, fontSize: FontSize.xs, marginTop: 2 },

  pressed: { opacity: 0.7 },
});
