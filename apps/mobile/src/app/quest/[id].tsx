import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Card, ErrorState, LoadingState, Row } from '@/components/states';
import {
  verificationStages,
  verificationSummary,
  pointsAreProvisional,
  type Stage,
} from '@/data/completionModel';
import { fetchLatestCompletion } from '@/data/completions';
import {
  DIFF_POINTS,
  DIFFICULTY_COLORS,
  VALIDITY_META,
  cooldownRemainingMs,
  evidenceMeta,
  formatDuration,
  isQuestEligible,
  type Difficulty,
} from '@/data/quests';
import { deleteTask, fetchTask } from '@/data/tasks';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Quest detail (Phase 4C).
 *
 * Read-only. Everything on screen comes from the server: the quest row, and the
 * latest `quest_completions` row for its verification state. Nothing here
 * computes or displays an award the server has not recorded.
 *
 * Evidence capture (4D) is not built yet, so the completion button explains why
 * rather than pretending to work — see the Phase 4C report.
 */
export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const questId = typeof id === 'string' ? id : '';
  const [deleting, setDeleting] = useState(false);

  const quest = useAsyncData(
    useCallback(
      () => (questId ? fetchTask(questId) : Promise.resolve({ data: null, error: 'Missing quest id.' })),
      [questId],
    ),
    { enabled: !!questId },
  );

  const completion = useAsyncData(
    useCallback(
      () =>
        questId ? fetchLatestCompletion(questId) : Promise.resolve({ data: null, error: null }),
      [questId],
    ),
    { enabled: !!questId },
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([quest.refresh(), completion.refresh()]);
  }, [quest, completion]);

  const confirmDelete = () => {
    Alert.alert('Delete this quest?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await deleteTask(questId);
          setDeleting(false);
          if (error) {
            Alert.alert('Could not delete', error);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  if (quest.loading) {
    return (
      <ScreenContainer insetTop={false} center>
        <LoadingState label="Loading quest…" />
      </ScreenContainer>
    );
  }

  if (quest.error || !quest.data) {
    return (
      <ScreenContainer insetTop={false} center>
        <ErrorState body={quest.error ?? 'This quest could not be found.'} onRetry={quest.refetch} />
      </ScreenContainer>
    );
  }

  const task = quest.data;
  const difficulty = (task.difficulty ?? 'easy') as Difficulty;
  const evidence = evidenceMeta(task.evidence_type);
  const badge = task.validity_status ? VALIDITY_META[task.validity_status] : undefined;
  const eligible = isQuestEligible(task);
  const cooldown = cooldownRemainingMs(task);
  const planned = task.planned_completion_date ? new Date(task.planned_completion_date) : null;
  const stages = verificationStages(completion.data);
  const summary = verificationSummary(completion.data);

  return (
    <ScreenContainer
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={quest.refreshing || completion.refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.gold}
        />
      }
    >
      <Text style={styles.title}>{task.text}</Text>

      <View style={styles.pillRow}>
        <View style={[styles.pill, { borderColor: `${DIFFICULTY_COLORS[difficulty]}66` }]}>
          <Text style={[styles.pillText, { color: DIFFICULTY_COLORS[difficulty] }]}>
            {difficulty} · +{DIFF_POINTS[difficulty]} pts
          </Text>
        </View>
        {task.completed && (
          <View style={[styles.pill, { borderColor: `${Colors.green}66` }]}>
            <Text style={[styles.pillText, { color: Colors.green }]}>Completed</Text>
          </View>
        )}
        {badge && (
          <View style={[styles.pill, { borderColor: `${badge.color}66` }]}>
            <Text style={[styles.pillText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}
      </View>

      {/* The validity check's own words, when it had something to say. */}
      {badge && (
        <View style={[styles.notice, { borderColor: `${badge.color}55`, backgroundColor: `${badge.color}14` }]}>
          <Text style={styles.noticeBody}>{task.validity_reason || badge.hint}</Text>
        </View>
      )}

      <Card title="Details">
        {task.goal ? <Row label="Goal" value={task.goal} /> : null}
        {task.priority ? <Row label="Priority" value={task.priority} /> : null}
        <Row label="Evidence" value={`${evidence.emoji} ${evidence.label}`} />
        <Row label="Created" value={new Date(task.created_at).toLocaleString()} />
        {planned && (
          <Row
            label="Planned finish"
            value={planned.toLocaleString()}
            tint={!task.completed && planned.getTime() < Date.now() ? Colors.rose : undefined}
          />
        )}
        {task.completed_at && (
          <Row label="Completed" value={new Date(task.completed_at).toLocaleString()} />
        )}
        {task.completion_duration_minutes != null && (
          <Row label="Took" value={`${task.completion_duration_minutes} min`} />
        )}
      </Card>

      {/* Verification, from the real quest_completions row */}
      {completion.loading ? (
        <Card title="Verification">
          <LoadingState label="Loading verification…" />
        </Card>
      ) : completion.error ? (
        <Card title="Verification">
          <ErrorState body={completion.error} onRetry={completion.refetch} />
        </Card>
      ) : completion.data ? (
        <Card title="Verification">
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: toneColor(summary.tone) }]}>
              {summary.label}
            </Text>
            {completion.data.points_earned > 0 && (
              <Text style={styles.summaryPoints}>+{completion.data.points_earned} pts</Text>
            )}
          </View>

          <View style={styles.stages}>
            {stages.map((s, i) => (
              <StageRow key={s.key} stage={s} last={i === stages.length - 1} />
            ))}
          </View>

          {pointsAreProvisional(completion.data) && (
            <Text style={styles.provisional}>
              Points for this attempt are provisional until a study admin confirms them.
            </Text>
          )}
        </Card>
      ) : null}

      {/* Completion entry point */}
      {!task.completed && (
        <View style={styles.actionBlock}>
          {!eligible ? (
            <View style={[styles.notice, styles.noticeMuted]}>
              <Text style={styles.noticeBody}>
                This quest cannot be completed until the quality check accepts it.
              </Text>
            </View>
          ) : cooldown > 0 ? (
            <View style={[styles.notice, styles.noticeMuted]}>
              <Text style={styles.noticeBody}>
                Available again in {formatDuration(cooldown)}.
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Not available yet',
                  'Submitting evidence from the phone arrives in the next step of the migration. For now, complete this quest on the PetQuest website.',
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Submit evidence"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="camera-outline" size={18} color="#1a0d00" />
              <Text style={styles.primaryButtonText}>Submit evidence</Text>
            </Pressable>
          )}
        </View>
      )}

      <Pressable
        onPress={confirmDelete}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="Delete this quest"
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed, deleting && styles.disabled]}
      >
        {deleting ? (
          <ActivityIndicator color="#fb7185" />
        ) : (
          <Text style={styles.deleteText}>Delete quest</Text>
        )}
      </Pressable>
    </ScreenContainer>
  );
}

function StageRow({ stage, last }: { stage: Stage; last: boolean }) {
  const { icon, color } = stageVisual(stage.state);
  return (
    <View style={styles.stageRow}>
      <View style={styles.stageMarker}>
        <Ionicons name={icon} size={18} color={color} />
        {!last && <View style={styles.stageLine} />}
      </View>
      <View style={styles.stageBody}>
        <Text style={[styles.stageLabel, { color }]}>{stage.label}</Text>
        {stage.detail ? <Text style={styles.stageDetail}>{stage.detail}</Text> : null}
      </View>
    </View>
  );
}

function stageVisual(state: Stage['state']): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  switch (state) {
    case 'done':
      return { icon: 'checkmark-circle', color: Colors.green };
    case 'active':
      return { icon: 'ellipse', color: Colors.gold };
    case 'failed':
      return { icon: 'close-circle', color: Colors.rose };
    default:
      return { icon: 'ellipse-outline', color: Colors.textMuted };
  }
}

const toneColor = (tone: 'neutral' | 'good' | 'bad' | 'waiting') =>
  tone === 'good' ? Colors.green : tone === 'bad' ? Colors.rose : tone === 'waiting' ? Colors.gold : Colors.textMuted;

const styles = StyleSheet.create({
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', lineHeight: 25 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm, marginBottom: Spacing.md },
  pill: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'capitalize' },

  notice: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noticeMuted: { borderColor: Colors.cardBorderHi, backgroundColor: Colors.bgCard2 },
  noticeBody: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 19 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: { fontSize: FontSize.md, fontWeight: '800' },
  summaryPoints: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },

  stages: { marginTop: Spacing.xs },
  stageRow: { flexDirection: 'row', gap: Spacing.sm },
  stageMarker: { alignItems: 'center', width: 20 },
  stageLine: { flex: 1, width: 2, backgroundColor: Colors.cardBorderHi, marginVertical: 2 },
  stageBody: { flex: 1, paddingBottom: Spacing.md },
  stageLabel: { fontSize: FontSize.sm, fontWeight: '700' },
  stageDetail: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },

  provisional: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: Spacing.xs,
  },

  actionBlock: { marginBottom: Spacing.md },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    minHeight: 52,
  },
  primaryButtonText: { color: '#1a0d00', fontSize: FontSize.md, fontWeight: '800' },

  deleteButton: {
    marginTop: 'auto',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.40)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fb7185', fontSize: FontSize.sm, fontWeight: '700' },

  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
