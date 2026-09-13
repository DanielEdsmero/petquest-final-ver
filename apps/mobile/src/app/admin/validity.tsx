import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState, PhaseNotice } from '@/components/states';
import { Spacing } from '@/theme';

/**
 * Quest validity queue — structure only.
 *
 * Phase 7 reads `tasks` with `validity_status = 'pending_ai_review'` plus the
 * admin-only `quest_validity_reviews` log, and wires the
 * `admin_resolve_quest_validity` RPC. Both are already restricted to
 * `is_admin()` in the database.
 */
export default function AdminValidityScreen() {
  const [state] = useState<'loading' | 'ready' | 'error'>('ready');
  const [rows] = useState<{ id: string }[]>([]);

  const onRetry = useCallback(() => {}, []);

  return (
    <ScreenContainer scroll={false} insetTop={false}>
      {state === 'loading' ? (
        <LoadingState label="Loading the validity queue…" />
      ) : state === 'error' ? (
        <ErrorState body="The validity queue could not be loaded." onRetry={onRetry} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={() => null}
          contentContainerStyle={rows.length === 0 ? styles.grow : undefined}
          ListEmptyComponent={
            <View style={styles.grow}>
              <EmptyState
                icon="shield-checkmark-outline"
                title="Nothing pending"
                body="Quests awaiting an AI validity check will appear here."
              />
              <PhaseNotice
                phase="Phase 7"
                items={['Pending quests', 'Run AI check / accept / reject', 'Admin decision log']}
              />
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ grow: { flexGrow: 1, paddingBottom: Spacing.md } });
