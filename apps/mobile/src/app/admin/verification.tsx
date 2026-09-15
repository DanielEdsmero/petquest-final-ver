import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { fetchVerificationQueue, rerunVerification, reviewCompletion, signProof, type ReviewAction } from '@/data/admin';
import {
  AI_COLOR,
  STATUS_META,
  VERIFICATION_FILTERS,
  activeTimeMs,
  countVerification,
  filterVerification,
  formatActive,
  isStuck,
  summariseRerun,
  type VerificationFilter,
  type VerificationQueueRow,
} from '@/data/adminModel';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Verification queue (Phase 7) — the mobile port of the web admin tab.
 *
 * Every submission (pass / fail / error / pending), the private proof photo via
 * a short-lived signed URL, the log, the AI verdict, timestamps, and the admin
 * actions. `admin_reason` IS shown here — this is the admin screen — and
 * nowhere else in the app.
 *
 * Reject rolls the award back server-side inside admin_review_completion;
 * nothing on the phone touches points.
 */
export default function AdminVerificationScreen() {
  const [filter, setFilter] = useState<VerificationFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [failedImg, setFailedImg] = useState<Record<string, true>>({});
  const [rerun, setRerun] = useState<{ done: number; total: number } | null>(null);

  const queue = useAsyncData(useCallback(() => fetchVerificationQueue(), []));
  const rows = queue.data ?? [];
  const counts = useMemo(() => countVerification(rows), [rows]);
  const shown = useMemo(() => filterVerification(rows, filter), [rows, filter]);

  // Sign the photos for whatever is loaded. Signed URLs expire, so a reload
  // re-signs and gives previously-failed images another try.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        rows.map(async (r) => {
          if (!r.proof_photo_url) return;
          const url = await signProof(r.proof_photo_url);
          if (url) map[r.id] = url;
        }),
      );
      if (!cancelled) {
        setSigned(map);
        setFailedImg({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const review = (id: string, action: ReviewAction) => {
    const copy = {
      approved: ['Approve this completion?', 'The award becomes permanent and the participant earns the verified badge.', 'Approve'],
      rejected: ['Reject and roll back?', 'The points for this completion will be reversed on the server.', 'Reject'],
      suspicious: ['Flag as suspicious?', 'Marks the row for a closer look; nothing is reversed.', 'Flag'],
    }[action];
    Alert.alert(copy[0], copy[1], [
      { text: 'Cancel', style: 'cancel' },
      {
        text: copy[2],
        style: action === 'rejected' ? 'destructive' : 'default',
        onPress: async () => {
          setBusy(id + ':' + action);
          const r = await reviewCompletion(id, action);
          setBusy(null);
          if (!r.ok) Alert.alert('Review failed', r.error ?? 'unknown');
          void queue.refresh();
        },
      },
    ]);
  };

  const rerunOne = async (id: string) => {
    setBusy(id + ':ai');
    const r = await rerunVerification(id);
    setBusy(null);
    Alert.alert(r.ok ? `AI verdict: ${r.verdict}` : 'AI re-run failed', r.ok ? r.reason : r.reason);
    void queue.refresh();
  };

  /** Sequential so Gemini is not hammered; each row has its own timeout inside requestVerification. */
  const rerunStuck = async () => {
    const stuck = rows.filter(isStuck);
    if (!stuck.length) {
      Alert.alert('Nothing stuck', 'Every entry already has a real verdict.');
      return;
    }
    setBusy('rerun-all');
    setRerun({ done: 0, total: stuck.length });
    let verdicted = 0;
    let manual = 0;
    for (let i = 0; i < stuck.length; i++) {
      const r = await rerunVerification(stuck[i].id);
      if (r.ok && (r.verdict === 'pass' || r.verdict === 'fail')) verdicted++;
      else manual++;
      setRerun({ done: i + 1, total: stuck.length });
    }
    setRerun(null);
    setBusy(null);
    Alert.alert('Re-run complete', summariseRerun(verdicted, manual));
    void queue.refresh();
  };

  const renderItem = useCallback(
    ({ item }: { item: VerificationQueueRow }) => (
      <VerificationRow
        item={item}
        signedUrl={signed[item.id]}
        imgFailed={!!failedImg[item.id]}
        onImgError={() => setFailedImg((p) => ({ ...p, [item.id]: true }))}
        busy={busy}
        onReview={review}
        onRerun={rerunOne}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signed, failedImg, busy],
  );

  return (
    <ScreenContainer scroll={false} insetTop={false}>
      <View style={styles.filters}>
        {VERIFICATION_FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label} ({counts[f.key]})</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={rerunStuck}
          disabled={busy === 'rerun-all'}
          accessibilityRole="button"
          accessibilityLabel="Re-run AI for every stuck entry"
          style={[styles.chip, styles.rerunChip, busy === 'rerun-all' && styles.disabled]}
        >
          <Text style={[styles.chipText, { color: Colors.teal }]}>
            {busy === 'rerun-all' ? `⏳ ${rerun ? `${rerun.done}/${rerun.total}` : ''}` : '🔁 Re-run stuck'}
          </Text>
        </Pressable>
      </View>

      {queue.loading ? (
        <LoadingState label="Loading the verification queue…" />
      ) : queue.error ? (
        <ErrorState body={queue.error} onRetry={queue.refetch} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={shown.length === 0 ? styles.grow : styles.list}
          refreshControl={<RefreshControl refreshing={queue.refreshing} onRefresh={queue.refresh} tintColor={Colors.gold} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          windowSize={7}
          ListEmptyComponent={<EmptyState icon="camera-outline" title="Nothing here" body="No submissions match this filter." />}
        />
      )}
    </ScreenContainer>
  );
}

function VerificationRow({
  item,
  signedUrl,
  imgFailed,
  onImgError,
  busy,
  onReview,
  onRerun,
}: {
  item: VerificationQueueRow;
  signedUrl?: string;
  imgFailed: boolean;
  onImgError: () => void;
  busy: string | null;
  onReview: (id: string, a: ReviewAction) => void;
  onRerun: (id: string) => void;
}) {
  const st = STATUS_META[item.status] ?? { label: item.status, color: Colors.textMuted };
  const stuck = isStuck(item);
  const anyBusy = busy != null && (busy.startsWith(item.id + ':') || busy === 'rerun-all');
  const isBusy = (k: string) => busy === `${item.id}:${k}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.user} numberOfLines={1}>
          {item.profiles?.username ?? 'Unknown'}
          <Text style={styles.uid}> · {item.user_id.slice(0, 6)}</Text>
        </Text>
        <View style={[styles.badge, { borderColor: `${st.color}66`, backgroundColor: `${st.color}18` }]}>
          <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <Text style={styles.questText}>{item.tasks?.text ?? '(quest)'}</Text>
      <Text style={styles.meta}>
        {item.difficulty ?? '—'} · +{item.points_earned} pts
        {item.source === 'upload' ? ' · ⚠️ file upload (not live)' : ''}
      </Text>

      {/* Proof photo — signed, short-lived, never public. */}
      <View style={styles.photoBox}>
        {signedUrl && !imgFailed ? (
          <Image source={{ uri: signedUrl }} style={styles.photo} contentFit="cover" onError={onImgError} accessibilityLabel="Proof photo" />
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
            <Text style={styles.meta}>{item.proof_photo_url ? 'image unavailable' : 'no photo'}</Text>
          </View>
        )}
      </View>

      <Text style={styles.label}>Progress log</Text>
      <Text style={styles.log}>{item.progress_log}</Text>

      <Text style={styles.meta}>
        AI verdict:{' '}
        <Text style={{ color: AI_COLOR[item.ai_verdict ?? 'pending'] ?? Colors.textMuted, fontWeight: '700' }}>
          {item.ai_verdict ?? 'pending'}
          {item.ai_confidence != null ? ` (${Math.round(item.ai_confidence * 100)}%)` : ''}
        </Text>
      </Text>
      {(item.ai_reason || item.ai_verdict === 'error') && (
        <Text style={styles.reason}>{item.ai_verdict === 'error' ? 'AI service busy — queued for manual review.' : item.ai_reason}</Text>
      )}
      {item.admin_reason ? <Text style={styles.adminReason}>Admin note: {item.admin_reason}</Text> : null}

      <Text style={styles.meta}>
        Submitted {new Date(item.created_at).toLocaleString()} · active {formatActive(activeTimeMs(item))}
        {item.ai_verdict_at ? ` · AI ${new Date(item.ai_verdict_at).toLocaleTimeString()}` : ''}
        {item.admin_reviewed_at ? ` · reviewed ${new Date(item.admin_reviewed_at).toLocaleString()}` : ''}
        {item.tasks?.planned_completion_date ? ` · planned ${new Date(item.tasks.planned_completion_date).toLocaleDateString()}` : ''}
      </Text>

      <View style={styles.actions}>
        <ActionButton label="Approve" color={Colors.green} busy={isBusy('approved')} disabled={anyBusy} onPress={() => onReview(item.id, 'approved')} />
        <ActionButton label="Reject" color={Colors.rose} busy={isBusy('rejected')} disabled={anyBusy} onPress={() => onReview(item.id, 'rejected')} />
        <ActionButton label="Suspicious" color={Colors.gold} busy={isBusy('suspicious')} disabled={anyBusy} onPress={() => onReview(item.id, 'suspicious')} />
        {stuck && <ActionButton label="Re-run AI" color={Colors.teal} busy={isBusy('ai')} disabled={anyBusy} onPress={() => onRerun(item.id)} />}
      </View>
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
  chipActive: { borderColor: 'rgba(245,163,26,0.45)', backgroundColor: 'rgba(245,163,26,0.16)' },
  rerunChip: { borderColor: 'rgba(6,182,212,0.45)', backgroundColor: 'rgba(6,182,212,0.12)' },
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
  meta: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 16 },
  label: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: Spacing.xs },
  log: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 19 },
  reason: { color: Colors.textSoft, fontSize: FontSize.xs, fontStyle: 'italic', lineHeight: 16 },
  adminReason: { color: Colors.gold, fontSize: FontSize.xs, lineHeight: 16 },

  photoBox: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#000', marginTop: Spacing.xs },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  photoEmpty: { width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', gap: 4 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  action: { minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: FontSize.xs, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
