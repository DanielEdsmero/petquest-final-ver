import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { fetchValidityLog, fetchValidityQueue, recheckValidity, resolveValidity } from '@/data/admin';
import {
  VALIDITY_FILTERS,
  countValidity,
  filterValidity,
  validityActions,
  type ValidityFilter,
  type ValidityLogRow,
  type ValidityQueueRow,
} from '@/data/adminModel';
import { VALIDITY_META, evidenceMeta } from '@/data/quests';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Quest validity queue (Phase 7) — the mobile port of the web admin tab.
 *
 * Two views: quests whose validity is unresolved, with Run AI / Accept /
 * Reject; and the admin-only decision log, which is the one place in the app
 * that shows `admin_reason`, risk flags and the model version. Both reads are
 * admitted by RLS to admins only; both actions are server-side.
 */
export default function AdminValidityScreen() {
  const [filter, setFilter] = useState<ValidityFilter>('pending_ai_review');
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const queue = useAsyncData(useCallback(() => fetchValidityQueue(), []));
  const log = useAsyncData(useCallback(() => fetchValidityLog(60), []), { enabled: showLog });

  const rows = queue.data ?? [];
  const counts = useMemo(() => countValidity(rows), [rows]);
  const shown = useMemo(() => filterValidity(rows, filter), [rows, filter]);

  const reload = useCallback(async () => {
    await Promise.all([queue.refresh(), showLog ? log.refresh() : Promise.resolve()]);
  }, [queue, log, showLog]);

  const runAi = async (id: string) => {
    setBusy(id + ':ai');
    const r = await recheckValidity(id);
    setBusy(null);
    Alert.alert(r.ok ? `AI decision: ${r.decision}` : 'AI re-check failed', r.ok ? undefined : r.error);
    void reload();
  };

  const resolve = (id: string, status: 'accepted' | 'rejected') => {
    Alert.alert(
      status === 'accepted' ? 'Accept this quest?' : 'Reject this quest?',
      status === 'accepted'
        ? 'The participant will be able to work on it.'
        : 'The participant will be told it was not accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'accepted' ? 'Accept' : 'Reject',
          style: status === 'accepted' ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(id + ':' + status);
            const r = await resolveValidity(id, status);
            setBusy(null);
            if (!r.ok) Alert.alert('Resolve failed', r.error ?? 'unknown');
            void reload();
          },
        },
      ],
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: ValidityQueueRow }) => (
      <ValidityRow item={item} busy={busy} onRunAi={runAi} onResolve={resolve} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  );

  return (
    <ScreenContainer scroll={false} insetTop={false}>
      <View style={styles.filters}>
        {VALIDITY_FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {f.label} ({counts[f.key]})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {queue.loading ? (
        <LoadingState label="Loading the validity queue…" />
      ) : queue.error ? (
        <ErrorState body={queue.error} onRetry={queue.refetch} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={shown.length === 0 ? styles.grow : styles.list}
          refreshControl={<RefreshControl refreshing={queue.refreshing} onRefresh={reload} tintColor={Colors.gold} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon="shield-checkmark-outline" title="Nothing here" body="No quests match this filter." />
          }
          ListFooterComponent={
            <View style={styles.logSection}>
              <Pressable
                onPress={() => setShowLog((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showLog }}
                style={styles.logToggle}
              >
                <Ionicons name={showLog ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gold} />
                <Text style={styles.logToggleText}>Decision log (admin only)</Text>
              </Pressable>
              {showLog &&
                (log.loading ? (
                  <LoadingState label="Loading log…" />
                ) : log.error ? (
                  <ErrorState body={log.error} onRetry={log.refetch} />
                ) : (
                  (log.data ?? []).map((l) => <LogRow key={l.id} item={l} />)
                ))}
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

function ValidityRow({
  item,
  busy,
  onRunAi,
  onResolve,
}: {
  item: ValidityQueueRow;
  busy: string | null;
  onRunAi: (id: string) => void;
  onResolve: (id: string, status: 'accepted' | 'rejected') => void;
}) {
  const meta = VALIDITY_META[item.validity_status ?? ''] ?? { label: item.validity_status ?? '?', color: Colors.textMuted };
  const ev = evidenceMeta(item.evidence_type);
  const actions = validityActions(item.validity_status);
  const isBusy = (k: string) => busy === `${item.id}:${k}`;
  const anyBusy = busy?.startsWith(item.id + ':') ?? false;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.user} numberOfLines={1}>
          {item.profiles?.username ?? 'Unknown'}
          <Text style={styles.uid}> · {item.user_id.slice(0, 6)}</Text>
        </Text>
        <View style={[styles.badge, { borderColor: `${meta.color}66`, backgroundColor: `${meta.color}18` }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Text style={styles.questText}>{item.text}</Text>
      <Text style={styles.meta}>
        {item.difficulty ?? 'easy'} · {ev.emoji} {ev.label}
        {item.validity_score != null ? ` · score ${item.validity_score}` : ''}
        {item.planned_completion_date ? ` · due ${new Date(item.planned_completion_date).toLocaleDateString()}` : ''}
      </Text>
      {item.validity_reason ? <Text style={styles.reason}>“{item.validity_reason}”</Text> : null}
      <Text style={styles.meta}>Created {new Date(item.created_at).toLocaleString()}</Text>

      <View style={styles.actions}>
        {actions.runAi && (
          <ActionButton label="Run AI" color={Colors.teal} busy={isBusy('ai')} disabled={anyBusy} onPress={() => onRunAi(item.id)} />
        )}
        {actions.accept && (
          <ActionButton label="Accept" color={Colors.green} busy={isBusy('accepted')} disabled={anyBusy} onPress={() => onResolve(item.id, 'accepted')} />
        )}
        {actions.reject && (
          <ActionButton label="Reject" color={Colors.rose} busy={isBusy('rejected')} disabled={anyBusy} onPress={() => onResolve(item.id, 'rejected')} />
        )}
      </View>
    </View>
  );
}

function LogRow({ item }: { item: ValidityLogRow }) {
  const tone =
    item.decision.includes('accept') ? Colors.green : item.decision.includes('reject') ? Colors.rose : item.decision === 'clarify' ? Colors.gold : Colors.teal;
  return (
    <View style={styles.logCard}>
      <View style={styles.cardHead}>
        <Text style={[styles.logDecision, { color: tone }]}>{item.decision}</Text>
        <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={styles.questText} numberOfLines={2}>{item.task_title}</Text>
      {item.reason ? <Text style={styles.reason}>Participant saw: “{item.reason}”</Text> : null}
      {item.admin_reason ? <Text style={styles.adminReason}>Admin note: {item.admin_reason}</Text> : null}
      <Text style={styles.meta}>
        {item.validity_score != null ? `score ${item.validity_score} · ` : ''}
        {(item.risk_flags ?? []).length ? `flags: ${(item.risk_flags ?? []).join(', ')} · ` : ''}
        {item.model_version ?? ''}
      </Text>
    </View>
  );
}

function ActionButton({ label, color, busy, disabled, onPress }: { label: string; color: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [styles.action, { borderColor: `${color}66`, backgroundColor: `${color}14` }, pressed && styles.pressed, disabled && !busy && styles.disabled]}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={[styles.actionText, { color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  chip: { minHeight: 40, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.bgCard2, justifyContent: 'center' },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryTint },
  chipText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700' },
  chipTextActive: { color: Colors.gold },

  grow: { flexGrow: 1 },
  list: { paddingBottom: Spacing.xl },
  sep: { height: Spacing.sm },

  card: { backgroundColor: Colors.cardBg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, gap: 4 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  user: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700', flexShrink: 1 },
  uid: { color: Colors.textMuted, fontWeight: '400' },
  badge: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  questText: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 19 },
  meta: { color: Colors.textMuted, fontSize: FontSize.xs },
  reason: { color: Colors.textSoft, fontSize: FontSize.xs, fontStyle: 'italic', lineHeight: 16 },
  adminReason: { color: Colors.gold, fontSize: FontSize.xs, lineHeight: 16 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  action: { minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: FontSize.xs, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },

  logSection: { marginTop: Spacing.lg, gap: Spacing.sm },
  logToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  logToggleText: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },
  logCard: { backgroundColor: Colors.bgCard2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.sm, gap: 3 },
  logDecision: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
});
