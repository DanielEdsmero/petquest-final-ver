import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { ErrorState } from '@/components/states';
import { PetHero, PrimaryButton, ProgressBar, SectionLabel, Skeleton, StatusPill, Surface, TextButton, type Tone } from '@/components/ui';
import { latestByQuest } from '@/data/completionModel';
import { fetchRecentCompletions } from '@/data/completions';
import { greeting, heroMessage, nextQuest, nextQuestAction, plannedLabel, todaySummary, todaysPath, type PathRow } from '@/data/homeModel';
import { PET_CATALOG, evolutionProgress, petIdOf, stageName } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { DIFF_POINTS, difficultyMeta, type Difficulty } from '@/data/quests';
import { type Task } from '@/data/taskModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, DifficultyColors, FontSize, PetAccents, Radius, Spacing, TapTarget } from '@/theme';

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

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshProfile(), tasks.refresh(), completions.refresh()]);
  }, [refreshProfile, tasks, completions]);

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
  const accent = petId ? PetAccents[petId] : PetAccents.dragon;
  const streak = profile?.current_streak;

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

      {/* Pet hero */}
      <View style={styles.hero}>
        <PetHero
          sprite={sprite}
          accent={accent}
          size={168}
          accessibilityLabel={meta ? `${meta.name}, your ${meta.species}, ${stageName(level)} stage` : 'No companion yet'}
        />
        {meta ? (
          <Text style={styles.petName}>
            {meta.name} <Text style={styles.petStage}>· {stageName(level)}</Text>
          </Text>
        ) : (
          <Text style={styles.petName}>No companion yet</Text>
        )}
        <Text style={styles.heroMessage}>
          {loading ? ' ' : meta ? heroMessage(next, summary) : 'Hatch your egg on the PetQuest website'}
        </Text>
      </View>

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
      {meta && totalEarned != null && progress.nextAt != null && progress.remaining != null ? (
        <View style={styles.evolution}>
          <ProgressBar fraction={progress.fraction} height={6} accessibilityLabel={`${progress.remaining} points to ${stageName(level + 1)}`} />
          <Text style={styles.evolutionLabel}>
            {progress.remaining.toLocaleString()} to {stageName(level + 1)}
          </Text>
        </View>
      ) : null}
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

  hero: { alignItems: 'center', paddingVertical: Spacing.md, marginBottom: Spacing.sm },
  petName: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.xs },
  petStage: { color: Colors.inkMuted, fontWeight: '500' },
  heroMessage: { color: Colors.inkSoft, fontSize: FontSize.md, marginTop: Spacing.xs, textAlign: 'center' },

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
  evolution: { marginTop: Spacing.xs, paddingHorizontal: Spacing.sm },
  evolutionLabel: { color: Colors.inkMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xs },

  pressed: { opacity: 0.7 },
});
