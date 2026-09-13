import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import {
  DIFFICULTIES,
  DIFFICULTY_COLORS,
  evidenceMeta,
  isQuestEligible,
  VALIDITY_META,
  type Difficulty,
} from '@/data/quests';
import { type Task } from '@/data/taskModel';
import { fetchTasks } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Quest log (Phase 4B) — the participant's real `tasks`, filtered by difficulty.
 *
 * RLS restricts the query to the signed-in user's own rows; the `user_id`
 * filter is for the index and for readability, not for safety.
 */
export default function QuestsTab() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  const tasks = useAsyncData(
    useCallback(
      () => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })),
      [userId],
    ),
    { enabled: !!userId },
  );

  const visible = useMemo(() => {
    const all = tasks.data ?? [];
    return all.filter((t) => (t.difficulty ?? 'easy') === difficulty);
  }, [tasks.data, difficulty]);

  // Counts per tab come from the already-loaded list — no extra query.
  const counts = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      easy: all.filter((t) => (t.difficulty ?? 'easy') === 'easy' && !t.completed).length,
      medium: all.filter((t) => t.difficulty === 'medium' && !t.completed).length,
      hard: all.filter((t) => t.difficulty === 'hard' && !t.completed).length,
    };
  }, [tasks.data]);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => <QuestRow task={item} onPress={() => router.push({ pathname: '/quest/[id]', params: { id: item.id } })} />,
    [router],
  );

  return (
    <ScreenContainer scroll={false} insetBottom={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Quest log</Text>
        <Pressable
          onPress={() => router.push('/quest/create')}
          accessibilityRole="button"
          accessibilityLabel="Create a quest"
          hitSlop={8}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={22} color="#1a0d00" />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {DIFFICULTIES.map((d) => {
          const active = d.id === difficulty;
          return (
            <Pressable
              key={d.id}
              onPress={() => setDifficulty(d.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.label} quests, ${counts[d.id]} active`}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? `${DIFFICULTY_COLORS[d.id]}22` : Colors.bgCard2,
                  borderColor: active ? `${DIFFICULTY_COLORS[d.id]}88` : Colors.cardBorder,
                },
              ]}
            >
              <Text
                style={[styles.tabText, { color: active ? DIFFICULTY_COLORS[d.id] : Colors.textMuted }]}
                numberOfLines={1}
              >
                {d.emoji} {d.label}
              </Text>
              {counts[d.id] > 0 && (
                <Text style={[styles.tabCount, { color: DIFFICULTY_COLORS[d.id] }]}>{counts[d.id]}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {tasks.loading ? (
        <LoadingState label="Loading your quests…" />
      ) : tasks.error ? (
        <ErrorState body={tasks.error} onRetry={tasks.refetch} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={visible.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={tasks.refreshing} onRefresh={tasks.refresh} tintColor={Colors.gold} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="reader-outline"
              title={`No ${difficulty} quests yet`}
              body="Create one and PetQuest will check that it is specific, meaningful and possible to verify."
              actionLabel="Create a quest"
              onAction={() => router.push('/quest/create')}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

function QuestRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const badge = task.validity_status ? VALIDITY_META[task.validity_status] : undefined;
  const evidence = evidenceMeta(task.evidence_type);
  const eligible = isQuestEligible(task);
  const planned = task.planned_completion_date ? new Date(task.planned_completion_date) : null;
  const overdue = !task.completed && planned != null && planned.getTime() < Date.now();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open quest: ${task.text}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, task.completed && styles.rowDone]}
    >
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor: task.completed
              ? Colors.green
              : eligible
                ? DIFFICULTY_COLORS[(task.difficulty ?? 'easy') as Difficulty]
                : Colors.textMuted,
          },
        ]}
      />

      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, task.completed && styles.rowTitleDone]} numberOfLines={2}>
          {task.text}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.rowMeta}>
            {evidence.emoji} {evidence.label}
          </Text>
          {planned && (
            <Text style={[styles.rowMeta, overdue && styles.overdue]}>
              {overdue ? 'Overdue' : `Due ${planned.toLocaleDateString()}`}
            </Text>
          )}
        </View>

        {badge && (
          <View style={[styles.badge, { borderColor: `${badge.color}66`, backgroundColor: `${badge.color}18` }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}
      </View>

      {task.completed ? (
        <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabs: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  tabText: { fontSize: FontSize.xs, fontWeight: '700', flexShrink: 1 },
  tabCount: { fontSize: FontSize.xs, fontWeight: '800' },

  listContent: { paddingBottom: Spacing.xl },
  emptyContainer: { flexGrow: 1 },
  separator: { height: Spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    minHeight: 60,
  },
  rowDone: { opacity: 0.65 },
  statusDot: { width: 8, height: 8, borderRadius: Radius.pill },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  rowTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  rowMeta: { color: Colors.textMuted, fontSize: FontSize.xs },
  overdue: { color: Colors.rose, fontWeight: '700' },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },

  pressed: { opacity: 0.8 },
});
