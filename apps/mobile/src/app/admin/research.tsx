import { useCallback } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Card, ErrorState, LoadingState } from '@/components/states';
import { fetchResearchAnalytics } from '@/data/admin';
import { researchRows } from '@/data/adminModel';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Spacing } from '@/theme';

/**
 * Research data (Phase 7) — the study's aggregate metrics.
 *
 * Everything here comes from `get_research_analytics()`, a SECURITY DEFINER
 * RPC that returns aggregates across ALL participants and refuses non-admins
 * itself. It is anonymised by construction: counts, rates and averages, never
 * a row per person. The web app defines this RPC (supabase-phase6) but has no
 * screen for it, so this is the first place it is shown.
 *
 * Read-only. There is nothing to export from here; an export path would need
 * its own approval.
 */
export default function AdminResearchScreen() {
  const analytics = useAsyncData(useCallback(() => fetchResearchAnalytics(), []));
  const rows = researchRows(analytics.data);

  return (
    <ScreenContainer insetTop={false} refreshControl={<RefreshControl refreshing={analytics.refreshing} onRefresh={analytics.refresh} tintColor={Colors.gold} />}>
      <Text style={styles.lead}>
        Aggregate, anonymised metrics across every participant — the study's dependent variables as
        the server computes them. No per-person rows are shown or fetched.
      </Text>

      {analytics.loading ? (
        <LoadingState label="Loading analytics…" />
      ) : analytics.error ? (
        <ErrorState body={analytics.error} onRetry={analytics.refetch} />
      ) : (
        <Card title="Study metrics">
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.value}>{r.value}</Text>
              </View>
              {r.hint ? <Text style={styles.hint}>{r.hint}</Text> : null}
            </View>
          ))}
          {rows.length === 0 && <Text style={styles.hint}>No data yet.</Text>}
        </Card>
      )}

      <Card title="Constructs">
        <Text style={styles.hint}>
          Goal setting and prioritisation fields exist on quests but are not collected by the
          current forms; planning/scheduling is the planned finish date; time management is
          on-time rate and duration. Per-quest records live in the validity and verification queues.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  lead: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  row: { paddingVertical: 6 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  label: { color: Colors.textSoft, fontSize: FontSize.sm },
  value: { color: Colors.gold, fontSize: FontSize.md, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },
});
