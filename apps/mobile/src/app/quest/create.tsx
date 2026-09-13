import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import {
  CHECK_EXPLAINER,
  CHECK_STEPS,
  DIFFICULTIES,
  DIFFICULTY_COLORS,
  EVIDENCE_TYPES,
  checkPeriodCap,
  evidenceMeta,
  validateQuestDraft,
  type Difficulty,
  type EvidenceTypeId,
} from '@/data/quests';
import { fetchTasks } from '@/data/tasks';
import { validateQuest, type ValidateResult } from '@/lib/questApi';
import { useAsyncData } from '@/lib/useAsyncData';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Create a quest (Phase 4B).
 *
 * The decision is never made here. The form collects the fields, does a
 * courtesy check so the participant is not sent on a pointless round trip, and
 * POSTs to `/api/validate-quest`; the server validates again, asks Gemini, and
 * writes the row with the service role. A direct client insert would be forced
 * to `pending_ai_review` by the `tasks_validity_guard` trigger regardless.
 *
 * Fields match the CURRENT web form — title, difficulty, evidence type, and a
 * planned finish date required on Medium and Hard. The goal statement and the
 * P1/P2/P3 priority were deliberately removed from the web form (commit
 * fdf694d) and are optional server-side, so collecting them here would make the
 * two clients gather different data for the same study.
 */
export default function CreateQuestScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id ?? null;

  const [text, setText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [evidenceType, setEvidenceType] = useState<EvidenceTypeId>('photo');
  const [plannedDate, setPlannedDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Loaded to evaluate the period caps before submitting. A failure here is not
  // fatal: the server enforces the real rules.
  const tasks = useAsyncData(
    useCallback(
      () => (userId ? fetchTasks(userId) : Promise.resolve({ data: [], error: null })),
      [userId],
    ),
    { enabled: !!userId, refetchOnFocus: false },
  );

  const cap = useMemo(
    () =>
      checkPeriodCap(
        difficulty,
        tasks.data ?? [],
        difficulty === 'hard' ? profile?.hard_period_start : profile?.medium_period_start,
      ),
    [difficulty, tasks.data, profile?.hard_period_start, profile?.medium_period_start],
  );

  const draftError = validateQuestDraft({ text, difficulty, evidenceType, plannedDate });
  const canSubmit = !checking && !draftError && cap.allowed;

  const onPickDate = (event: DateTimePickerEvent, date?: Date) => {
    // Android fires with type 'dismissed' when cancelled; iOS keeps the inline
    // picker open until the participant taps Done.
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (date) setPlannedDate(date);
  };

  const submit = async () => {
    if (checking) return;
    setResult(null);
    setFieldError(null);

    const invalid = validateQuestDraft({ text, difficulty, evidenceType, plannedDate });
    if (invalid) {
      setFieldError(invalid.message);
      return;
    }
    if (!cap.allowed) {
      setFieldError(cap.message);
      return;
    }

    setChecking(true);
    setStep(0);
    // The steps are indicative progress for a single opaque request — the
    // server does not stream stages back. They advance on a timer and stop at
    // the last one rather than looping, so they never imply more is happening.
    const timers = CHECK_STEPS.slice(1).map((_, i) =>
      setTimeout(() => setStep(i + 1), (i + 1) * 1200),
    );

    const res = await validateQuest({
      text: text.trim(),
      difficulty,
      evidence_type: evidenceType,
      planned_completion_date: plannedDate ? plannedDate.toISOString() : null,
    });

    timers.forEach(clearTimeout);
    setChecking(false);
    setResult(res);

    if (res.decision === 'accept') {
      // Saved and completable — drop back to the log, which refetches on focus.
      router.back();
    }
    // clarify / reject / pending / errors all stay on screen with the draft
    // intact so the participant can revise and resubmit.
  };

  if (checking) return <CheckingView step={step} />;

  return (
    <ScreenContainer insetTop={false}>
      <Text style={styles.explainer}>{CHECK_EXPLAINER}</Text>

      {result && result.decision !== 'accept' && <ResultPanel result={result} />}

      {/* Title */}
      <Text style={styles.label}>Quest title</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setFieldError(null);
        }}
        placeholder="e.g. Finish calculus problem set 4"
        placeholderTextColor={Colors.textPlaceholder}
        maxLength={80}
        multiline
        accessibilityLabel="Quest title"
      />
      <Text style={styles.counter}>{text.trim().length}/80</Text>

      {/* Difficulty */}
      <Text style={[styles.label, styles.labelSpaced]}>Difficulty</Text>
      <View style={styles.chipRow}>
        {DIFFICULTIES.map((d) => {
          const active = d.id === difficulty;
          return (
            <Pressable
              key={d.id}
              onPress={() => {
                setDifficulty(d.id);
                setFieldError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.label}, ${d.points} points, ${d.blurb}`}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? `${DIFFICULTY_COLORS[d.id]}22` : Colors.bgCard2,
                  borderColor: active ? `${DIFFICULTY_COLORS[d.id]}88` : Colors.cardBorder,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: active ? DIFFICULTY_COLORS[d.id] : Colors.textMuted }]}
              >
                {d.emoji} {d.label}
              </Text>
              <Text style={styles.chipSub}>+{d.points}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{DIFFICULTIES.find((d) => d.id === difficulty)?.blurb}</Text>

      {!cap.allowed && (
        <View style={[styles.panel, styles.panelWarn]}>
          <Text style={styles.panelBody}>{cap.message}</Text>
        </View>
      )}

      {/* Evidence type */}
      <Text style={[styles.label, styles.labelSpaced]}>How will you show it is done?</Text>
      <View style={styles.evidenceList}>
        {EVIDENCE_TYPES.map((e) => {
          const active = e.id === evidenceType;
          return (
            <Pressable
              key={e.id}
              onPress={() => setEvidenceType(e.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${e.label}. ${e.desc}`}
              style={[styles.evidenceItem, active && styles.evidenceItemActive]}
            >
              <Text style={styles.evidenceEmoji}>{e.emoji}</Text>
              <View style={styles.evidenceBody}>
                <Text style={[styles.evidenceLabel, active && styles.evidenceLabelActive]}>
                  {e.label}
                </Text>
                <Text style={styles.evidenceDesc}>{e.desc}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
            </Pressable>
          );
        })}
      </View>

      {/* Planned finish */}
      <Text style={[styles.label, styles.labelSpaced]}>
        Planned finish{difficulty !== 'easy' ? ' *' : ' (optional)'}
      </Text>
      <Pressable
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose a planned finish date"
        style={styles.dateButton}
      >
        <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
        <Text style={[styles.dateText, !plannedDate && styles.datePlaceholder]}>
          {plannedDate ? plannedDate.toLocaleString() : 'Choose a date and time'}
        </Text>
        {plannedDate && (
          <Pressable
            onPress={() => setPlannedDate(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear the planned finish date"
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </Pressable>

      {showPicker && (
        <View>
          <DateTimePicker
            value={plannedDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000)}
            mode="datetime"
            minimumDate={new Date()}
            themeVariant="dark"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onPickDate}
          />
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={() => setShowPicker(false)}
              accessibilityRole="button"
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}

      {(fieldError || draftError) && (
        <View style={[styles.panel, styles.panelError]} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{fieldError ?? draftError?.message}</Text>
        </View>
      )}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Check and add quest"
        accessibilityState={{ disabled: !canSubmit }}
        style={({ pressed }) => [
          styles.submit,
          !canSubmit && styles.submitDisabled,
          pressed && canSubmit && styles.pressed,
        ]}
      >
        <Text style={styles.submitText}>{result ? 'Re-check quest' : 'Check & add quest'}</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Your quest is saved only if the check accepts it. Points are always awarded by the
        server.
      </Text>
    </ScreenContainer>
  );
}

/** Full-screen progress while the single validate request is in flight. */
function CheckingView({ step }: { step: number }) {
  return (
    <ScreenContainer insetTop={false} center>
      <ActivityIndicator color={Colors.gold} size="large" />
      <Text style={styles.checkingTitle}>{CHECK_STEPS[Math.min(step, CHECK_STEPS.length - 1)]}…</Text>
      <View style={styles.stepDots}>
        {CHECK_STEPS.map((label, i) => (
          <View
            key={label}
            style={[styles.stepDot, i <= step && styles.stepDotActive]}
            accessibilityElementsHidden
          />
        ))}
      </View>
      <Text style={styles.checkingHint}>This usually takes a few seconds.</Text>
    </ScreenContainer>
  );
}

/**
 * The outcome for anything that is not a plain accept.
 *
 * `reason` is the participant-safe string the server produced — the admin
 * reasoning, risk flags and model version stay in `quest_validity_reviews`,
 * which only an admin can read.
 */
function ResultPanel({ result }: { result: ValidateResult }) {
  const tone =
    result.decision === 'pending'
      ? { color: '#22d3ee', title: 'Saved — awaiting check' }
      : result.decision === 'clarify'
        ? { color: Colors.gold, title: 'Almost there' }
        : result.decision === 'reject'
          ? { color: Colors.rose, title: 'Not accepted' }
          : { color: Colors.gold, title: 'Could not check' };

  return (
    <View
      style={[styles.panel, { borderColor: `${tone.color}66`, backgroundColor: `${tone.color}14` }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.panelTitle, { color: tone.color }]}>{tone.title}</Text>
      <Text style={styles.panelBody}>{result.reason}</Text>
      {result.recommendedEvidenceType && (
        <Text style={styles.panelHint}>
          Suggested evidence: {evidenceMeta(result.recommendedEvidenceType).label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  explainer: {
    color: Colors.textSoft,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },

  label: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  labelSpaced: { marginTop: Spacing.lg },
  input: {
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    minHeight: 56,
  },
  counter: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'right', marginTop: 4 },

  chipRow: { flexDirection: 'row', gap: Spacing.xs },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  chipText: { fontSize: FontSize.xs, fontWeight: '700' },
  chipSub: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  hint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xs },

  evidenceList: { gap: Spacing.xs },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    backgroundColor: Colors.bgCard2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  evidenceItemActive: { borderColor: 'rgba(245,163,26,0.55)', backgroundColor: 'rgba(245,163,26,0.08)' },
  evidenceEmoji: { fontSize: 20 },
  evidenceBody: { flex: 1 },
  evidenceLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  evidenceLabelActive: { color: Colors.goldLight },
  evidenceDesc: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 1, lineHeight: 15 },

  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 50,
    backgroundColor: Colors.bgCard2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    paddingHorizontal: Spacing.md,
  },
  dateText: { color: Colors.textPrimary, fontSize: FontSize.sm, flex: 1 },
  datePlaceholder: { color: Colors.textPlaceholder },
  doneButton: { alignSelf: 'flex-end', padding: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  doneText: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },

  panel: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  panelWarn: { backgroundColor: 'rgba(245,163,26,0.10)', borderColor: 'rgba(245,163,26,0.40)', marginTop: Spacing.sm },
  panelError: {
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderColor: 'rgba(244,63,94,0.40)',
    marginTop: Spacing.md,
  },
  panelTitle: { fontSize: FontSize.sm, fontWeight: '800', marginBottom: 4 },
  panelBody: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 19 },
  panelHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xs },
  errorText: { color: '#fb7185', fontSize: FontSize.sm },

  submit: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#1a0d00', fontSize: FontSize.md, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  footnote: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 16,
  },

  checkingTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  stepDots: { flexDirection: 'row', gap: 6, marginTop: Spacing.md },
  stepDot: { width: 8, height: 8, borderRadius: Radius.pill, backgroundColor: Colors.cardBorderHi },
  stepDotActive: { backgroundColor: Colors.gold },
  checkingHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.md },
});
