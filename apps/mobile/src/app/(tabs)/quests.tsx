import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Colors, DifficultyColors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Quests tab — the list shell.
 *
 * Built on FlatList from the start, not a mapped ScrollView: the quest log can
 * run to hundreds of rows for an active participant, and swapping the container
 * later would mean rewriting the screen. The renderer, key extractor, separator,
 * pull-to-refresh and the four states are all in place; Phase 4B replaces the
 * empty array with a Supabase query and the row with the real quest card.
 */

type Quest = {
  id: string;
  text: string;
  difficulty: keyof typeof DifficultyColors;
  validity_status: string;
};

type ListState = 'loading' | 'ready' | 'error';

export default function QuestsTab() {
  const router = useRouter();
  // Phase 4B swaps these for a real query. 'ready' + [] is the honest state
  // today: nothing is fetched, so nothing can be shown.
  const [state] = useState<ListState>('ready');
  const [quests] = useState<Quest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // No query to re-run yet; end the spinner rather than leaving it stuck.
    setRefreshing(false);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Quest }) => (
      <Pressable
        onPress={() => router.push({ pathname: '/quest/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Open quest: ${item.text}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View
          style={[styles.difficultyDot, { backgroundColor: DifficultyColors[item.difficulty] }]}
        />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.text}
          </Text>
          <Text style={styles.rowMeta}>{item.validity_status}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>
    ),
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
          <Ionicons name="add" size={20} color="#1a0d00" />
        </Pressable>
      </View>

      {state === 'loading' ? (
        <LoadingState label="Loading your quests…" />
      ) : state === 'error' ? (
        <ErrorState
          body="Your quest log could not be loaded."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={quests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={quests.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.gold}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="reader-outline"
              title="No quests yet"
              body="Create your first quest and PetQuest will check that it is specific, meaningful and possible to verify."
              actionLabel="Create a quest"
              onAction={() => router.push('/quest/create')}
            />
          }
        />
      )}
    </ScreenContainer>
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
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
    minHeight: 56,
  },
  difficultyDot: { width: 8, height: 8, borderRadius: Radius.pill },
  rowBody: { flex: 1 },
  rowTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  rowMeta: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
