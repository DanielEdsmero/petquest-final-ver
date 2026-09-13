import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState, PhaseNotice } from '@/components/states';
import { Spacing } from '@/theme';

/**
 * Verification queue — structure only.
 *
 * Phase 7 reads `quest_completions` (own-or-admin by RLS), signs the private
 * proof photos from the `quest-proofs` bucket for display, and wires
 * `admin_review_completion`. Rejection rolls the award back through
 * `rollback_completion`, which is service-role only — the phone never reverses
 * points itself.
 */
export default function AdminVerificationScreen() {
  const [state] = useState<'loading' | 'ready' | 'error'>('ready');
  const [rows] = useState<{ id: string }[]>([]);

  const onRetry = useCallback(() => {}, []);

  return (
    <ScreenContainer scroll={false} insetTop={false}>
      {state === 'loading' ? (
        <LoadingState label="Loading the verification queue…" />
      ) : state === 'error' ? (
        <ErrorState body="The verification queue could not be loaded." onRetry={onRetry} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={() => null}
          contentContainerStyle={rows.length === 0 ? styles.grow : undefined}
          ListEmptyComponent={
            <View style={styles.grow}>
              <EmptyState
                icon="camera-outline"
                title="No submissions"
                body="Evidence submitted for review will appear here."
              />
              <PhaseNotice
                phase="Phase 7"
                items={['Proof photo and progress log', 'AI verdict and timestamps', 'Approve / reject / flag suspicious']}
              />
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ grow: { flexGrow: 1, paddingBottom: Spacing.md } });
