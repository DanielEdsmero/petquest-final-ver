import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState } from '@/components/states';
import { Chip, Skeleton, StatusPill } from '@/components/ui';
import { latestByQuest } from '@/data/completionModel';
import { fetchRecentCompletions } from '@/data/completions';
import { QUEST_FILTERS, bucketQuests, plannedLabel, questStatus, type CompletionMap, type QuestFilter } from '@/data/homeModel';
import { DIFF_POINTS, difficultyMeta, evidenceMeta, type Difficulty } from '@/data/quests';
import { type Task } from '@/data/taskModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, DifficultyColors, FontSize, Radius, Spacing, TapTarget } from '@/theme';

/**
 * Quests — the participant's real `tasks` in four buckets: Today, Upcoming,
 * Completed, Needs review. One tap target per row; the row's status is the
 * same server-backed status Home shows (homeModel.questStatus).
 *
 * RLS restricts both queries to the signed-in user's own rows; the `user_id`
 * filters are for the index and for readability, not for safety.
 */
export default function QuestsTab() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;
  const [filter, setFilter] = useState<QuestFilter>('today');

  const tasks = useAsyncData(
    useCallback(() => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );
  const completions = useAsyncData(
    useCallback(() => (userId ? fetchRecentCompletions(userId) : Promise.resolve({ data: [], error: null })), [userId]),
    { enabled: !!userId },
  );

  const byQuest = useMemo(() => latestByQuest(completions.data), [completions.data]);
  const buckets = useMemo(() => bucketQuests(tasks.data, byQuest), [tasks.data, byQuest]);
  const visible = buckets[filter];
  const loading = tasks.loading || completions.loading;

  const onRefresh = useCallback(async () => {
    await Promise.all([tasks.refresh(), completions.refresh()]);
  }, [tasks, completions]);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <QuestRow
        task={item}
        completions={byQuest}
        onPress={() => router.push({ pathname: '/quest/[id]', params: { id: item.id } })}
      />
    ),
    [router, byQuest],
  );

  const empty = EMPTY[filter];

  return (
    <ScreenContainer scroll={false} insetBottom={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Quests</Text>
        <Pressable
          onPress={() => router.push('/quest/create')}
          accessibilityRole="button"
          accessibilityLabel="Create a quest"
          hitSlop={8}
          style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}
        >
          <Ionicons name="add" size={24} color={Colors.onPrimary} />
        </Pressable>
      </View>

      {/* Two rows of two on a 320pt screen; one row when there is room. */}
      <View style={styles.filters}>
        {QUEST_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={f.key === filter} onPress={() => setFilter(f.key)} count={loading ? undefined : buckets[f.key].length} />
        ))}
      </View>

      {tasks.error || completions.error ? (
        <ErrorState body={tasks.error ?? completions.error ?? undefined} onRetry={onRefresh} />
      ) : loading ? (
        <View style={styles.skeletons}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={visible.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={tasks.refreshing || completions.refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              body={empty.body}
              actionLabel={filter === 'completed' || filter === 'needs_review' ? undefined : 'Create a quest'}
              onAction={() => router.push('/quest/create')}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

const EMPTY: Record<QuestFilter, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  today: { icon: 'sunny-outline', title: 'Nothing for today', body: 'Quests without a planned time, planned for today, or overdue appear here.' },
  upcoming: { icon: 'calendar-outline', title: 'Nothing planned ahead', body: 'Give a quest a planned finish date and it will wait here.' },
  completed: { icon: 'checkmark-done-outline', title: 'No completed quests yet', body: 'Finished quests and their verification status collect here.' },
  needs_review: { icon: 'shield-checkmark-outline', title: 'Nothing needs your attention', body: 'Quests waiting on the quality check, sent back for changes, or not approved appear here.' },
};

function QuestRow({ task, completions, onPress }: { task: Task; completions: CompletionMap; onPress: () => void }) {
  const difficulty = (task.difficulty ?? 'easy') as Difficulty;
  const d = difficultyMeta(difficulty);
  const ev = evidenceMeta(task.evidence_type);
  const status = questStatus(task, completions[task.id] ?? null);
  const planned = plannedLabel(task);
  const overdue = planned === 'Overdue';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open quest: ${task.text}, ${d.label}, ${status.label}${planned ? `, ${planned}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.marker, { backgroundColor: DifficultyColors[difficulty] }]} accessibilityLabel={`${d.label} difficulty`} />
      <View style={styles.body}>
        <Text style={[styles.rowTitle, task.completed && styles.rowTitleDone]} numberOfLines={2}>
          {task.text}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {d.label} · {DIFF_POINTS[difficulty]} pts · {ev.label}
        </Text>
        <View style={styles.pills}>
          <StatusPill label={status.label} tone={status.tone} />
          {planned ? <StatusPill label={planned} tone={overdue ? 'bad' : 'neutral'} icon="calendar-outline" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  title: { color: Colors.ink, fontSize: FontSize.xl, fontWeight: '700', letterSpacing: -0.3 },
  addButton: { width: TapTarget, height: TapTarget, borderRadius: Radius.pill, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  addPressed: { backgroundColor: Colors.primaryPressed },

  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },

  skeletons: { gap: Spacing.sm },
  listContent: { paddingBottom: Spacing.xl },
  emptyContainer: { flexGrow: 1 },
  separator: { height: Spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 64,
  },
  marker: { width: 4, alignSelf: 'stretch', borderRadius: Radius.pill },
  body: { flex: 1, gap: 4 },
  rowTitle: { color: Colors.ink, fontSize: FontSize.md, fontWeight: '600', lineHeight: 22 },
  rowTitleDone: { color: Colors.inkMuted },
  meta: { color: Colors.inkMuted, fontSize: FontSize.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: 2 },
  pressed: { opacity: 0.7 },
});
