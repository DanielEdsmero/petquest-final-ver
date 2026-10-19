import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { ErrorState, LoadingState } from '@/components/states';
import {
  MIN_LOG_CHARS,
  SUBMIT_STEPS,
  outcomeFromVerdict,
  submitErrorMessage,
  submitProgress,
  validateEvidence,
  type EvidenceDraft,
  type SubmitStep,
  type VerdictOutcome,
} from '@/data/evidenceModel';
import { evidenceMeta, isQuestEligible } from '@/data/quests';
import { fetchTask } from '@/data/tasks';
import { captureEvidence, submitCompletion, uploadEvidence, type CapturedImage } from '@/lib/evidence';
import { useAsyncData } from '@/lib/useAsyncData';
import { requestVerification } from '@/lib/verifyApi';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Submit evidence (Phase 4D) with live verification progress (Phase 4E).
 *
 * The sequence, each step gated on a REAL response — never a timer:
 *
 *   capture → [Uploading] storage → [Submitting] submit_completion()
 *           → [AI checking] /api/verify → outcome
 *
 * Points are awarded provisionally by submit_completion() on the server. The
 * screen never adds to a local total; after the flow it sends the participant
 * back to the detail screen, which refetches the quest, the completion row and
 * the profile.
 *
 * Important: once submit_completion() has returned OK, the submission exists
 * server-side whatever happens next. If /api/verify then fails or times out,
 * the outcome is "queued for review" — not a rejection, and not a retry of the
 * submission. The detail screen shows the real pipeline state either way.
 */
export default function VerifyQuestScreen() {
  const { questId } = useLocalSearchParams<{ questId?: string }>();
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const userId = session?.user?.id ?? null;
  const id = typeof questId === 'string' ? questId : '';

  const quest = useAsyncData(
    useCallback(
      () => (id ? fetchTask(id) : Promise.resolve({ data: null, error: 'Missing quest id.' })),
      [id],
    ),
    { enabled: !!id, refetchOnFocus: false },
  );

  const [image, setImage] = useState<CapturedImage | null>(null);
  const [log, setLog] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  const [step, setStep] = useState<SubmitStep>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerdictOutcome | null>(null);

  /* The research "active time" clock starts when this screen opens. */
  const openedAt = useRef(new Date().toISOString());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const draft: EvidenceDraft = {
    uri: image?.uri ?? null,
    bytes: image?.bytes ?? null,
    source: image?.source ?? null,
    log,
  };
  const draftError = validateEvidence(draft);
  const busy = step !== 'idle' && step !== 'failed';
  const canSubmit = !busy && !draftError && !!userId && !!quest.data;

  const capture = async (source: 'camera' | 'upload') => {
    if (captureBusy) return;
    setCaptureBusy(true);
    setFormError(null);
    const res = await captureEvidence(source);
    setCaptureBusy(false);
    if (res.ok) {
      setImage(res.image);
    } else if (res.reason !== 'cancelled') {
      setFormError(res.message ?? 'Could not get a photo.');
    }
  };

  const submit = async () => {
    if (!canSubmit || !image || !userId || !quest.data) return;
    const invalid = validateEvidence(draft);
    if (invalid) {
      setFormError(invalid.message);
      return;
    }
    setFormError(null);
    setFailure(null);
    setOutcome(null);

    /* 1. Upload */
    setStep('uploading');
    const up = await uploadEvidence(userId, id, image);
    if (!up.ok) {
      if (alive.current) {
        setStep('failed');
        setFailure(up.message);
      }
      return;
    }

    /* 2. Submit — the award happens here, server-side */
    setStep('submitting');
    const sub = await submitCompletion({
      taskId: id,
      photoPath: up.path,
      log,
      timeStarted: quest.data.started_at ?? quest.data.created_at,
      verificationStartedAt: openedAt.current,
      source: image.source,
    });
    if (!sub.ok) {
      if (alive.current) {
        setStep('failed');
        setFailure(submitErrorMessage(sub.code));
      }
      return;
    }

    /* 3. Verify — from here the submission exists regardless of what follows.
       Do NOT bail on `alive`: the verdict must be requested even if the
       participant navigated away, or the row would sit at 'pending' until an
       admin re-runs it (the web client learned this the hard way). Only the
       screen's own state updates are guarded. */
    if (alive.current) setStep('checking');
    const verdict = await requestVerification(sub.completionId);
    const result = outcomeFromVerdict(verdict, sub.awarded);

    // Points/streak/level moved server-side; pull the fresh profile.
    void refreshProfile();

    if (alive.current) {
      setStep('done');
      setOutcome(result);
    }
  };

  /* ── Loading / error for the quest itself ── */
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
  if (task.completed || !isQuestEligible(task)) {
    return (
      <ScreenContainer insetTop={false} center>
        <ErrorState
          title={task.completed ? 'Already completed' : 'Not ready yet'}
          body={
            task.completed
              ? 'This quest has already been submitted.'
              : 'This quest cannot be completed until the quality check accepts it.'
          }
        />
      </ScreenContainer>
    );
  }

  /* ── Outcome ── */
  if (step === 'done' && outcome) {
    return <OutcomeView outcome={outcome} onDone={() => router.back()} />;
  }

  /* ── In flight ── */
  if (busy) {
    return <ProgressView step={step} />;
  }

  const evidence = evidenceMeta(task.evidence_type);

  return (
    <ScreenContainer insetTop={false}>
      <Text style={styles.questTitle} numberOfLines={3}>
        {task.text}
      </Text>
      <Text style={styles.hint}>
        Evidence type: {evidence.emoji} {evidence.label} — {evidence.desc}
      </Text>

      {/* Photo */}
      <Text style={[styles.label, styles.labelSpaced]}>Photo</Text>
      {image ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" accessibilityLabel="Your evidence photo" />
          <View style={styles.previewMeta}>
            <Text style={styles.previewText}>
              {image.source === 'camera' ? '📷 Live photo' : '🖼️ From library'} · {Math.round(image.bytes / 1024)} KB
            </Text>
            <Pressable onPress={() => setImage(null)} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8}>
              <Text style={styles.link}>Retake</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.captureRow}>
          <CaptureButton icon="camera" label="Take photo" onPress={() => capture('camera')} busy={captureBusy} primary />
          <CaptureButton icon="images-outline" label="Choose photo" onPress={() => capture('upload')} busy={captureBusy} />
        </View>
      )}
      {!image && (
        <Text style={styles.hint}>A live photo is the strongest evidence. A chosen photo is flagged as an upload for the reviewer.</Text>
      )}

      {/* Progress log */}
      <Text style={[styles.label, styles.labelSpaced]}>What did you do?</Text>
      <TextInput
        style={styles.input}
        value={log}
        onChangeText={(v) => {
          setLog(v);
          if (formError) setFormError(null);
        }}
        placeholder="Describe what the photo shows and what you completed…"
        placeholderTextColor={Colors.textPlaceholder}
        multiline
        maxLength={500}
        textAlignVertical="top"
        accessibilityLabel="Progress log"
      />
      <Text style={[styles.counter, log.trim().length >= MIN_LOG_CHARS && styles.counterOk]}>
        {log.trim().length}/{MIN_LOG_CHARS} min
      </Text>

      {(formError || failure) && (
        <View style={styles.errorPanel} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{formError ?? failure}</Text>
        </View>
      )}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Submit evidence"
        accessibilityState={{ disabled: !canSubmit }}
        style={({ pressed }) => [styles.submit, !canSubmit && styles.submitDisabled, pressed && canSubmit && styles.pressed]}
      >
        <Text style={styles.submitText}>{failure ? 'Try again' : 'Submit evidence'}</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Submitted → AI check → Admin review if needed → Approved or not. Points are awarded by
        the server and stay provisional until an admin confirms.
      </Text>
    </ScreenContainer>
  );
}

function CaptureButton({
  icon,
  label,
  onPress,
  busy,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.captureButton, primary && styles.capturePrimary, pressed && styles.pressed, busy && styles.submitDisabled]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? Colors.onPrimary : Colors.gold} />
      ) : (
        <>
          <Ionicons name={icon} size={22} color={primary ? Colors.onPrimary : Colors.gold} />
          <Text style={[styles.captureLabel, primary && styles.captureLabelPrimary]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Live progress, advanced only by real responses (Phase 4E). */
function ProgressView({ step }: { step: SubmitStep }) {
  const activeIndex = SUBMIT_STEPS.findIndex((s) => s.key === step);
  const pct = Math.round(submitProgress(step) * 100);
  return (
    <ScreenContainer insetTop={false} center>
      <View style={styles.stepsRow} accessibilityRole="progressbar" accessibilityLabel={`${SUBMIT_STEPS[activeIndex]?.label ?? 'Working'}, ${pct} percent`}>
        {SUBMIT_STEPS.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <View key={s.key} style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={Colors.onPrimary} />
                ) : active ? (
                  <ActivityIndicator size="small" color={Colors.gold} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, (done || active) && styles.stepLabelOn]}>{s.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressHint}>
        {step === 'uploading'
          ? 'Sending your photo to the private evidence store…'
          : step === 'submitting'
            ? 'Recording your completion…'
            : 'The AI is looking at your evidence. This can take a few seconds.'}
      </Text>
      <Text style={styles.progressWarn}>Keep the app open until this finishes.</Text>
    </ScreenContainer>
  );
}

function OutcomeView({ outcome, onDone }: { outcome: VerdictOutcome; onDone: () => void }) {
  const tone =
    outcome.kind === 'pass'
      ? { icon: 'checkmark-circle' as const, color: Colors.green, title: `+${outcome.points} points earned` }
      : outcome.kind === 'fail'
        ? { icon: 'close-circle' as const, color: Colors.rose, title: 'Evidence not accepted' }
        : { icon: 'time' as const, color: Colors.accentWarm, title: 'Submitted — queued for review' };
  return (
    <ScreenContainer insetTop={false} center>
      <Ionicons name={tone.icon} size={56} color={tone.color} />
      <Text style={[styles.outcomeTitle, { color: tone.color }]}>{tone.title}</Text>
      <Text style={styles.outcomeBody}>{outcome.reason}</Text>
      <Text style={styles.outcomeNote}>
        {outcome.kind === 'pass'
          ? 'Points are provisional until a study admin confirms them.'
          : outcome.kind === 'fail'
            ? 'The provisional points for this attempt were reversed. You can revise your evidence and try again once.'
            : 'Your submission is recorded. A study admin will review it and your points stay provisional until then.'}
      </Text>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Back to quest" style={({ pressed }) => [styles.submit, styles.outcomeButton, pressed && styles.pressed]}>
        <Text style={styles.submitText}>Back to quest</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  questTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', lineHeight: 22 },
  hint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xs, lineHeight: 16 },
  label: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  labelSpaced: { marginTop: Spacing.lg },

  captureRow: { flexDirection: 'row', gap: Spacing.sm },
  captureButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  capturePrimary: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  captureLabel: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },
  captureLabelPrimary: { color: Colors.onPrimary },

  previewWrap: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.bgCard2, borderWidth: 1, borderColor: Colors.cardBorder },
  preview: { width: '100%', aspectRatio: 4 / 3 },
  previewMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.sm },
  previewText: { color: Colors.textMuted, fontSize: FontSize.xs },
  link: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },

  input: {
    backgroundColor: Colors.bgCard2,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    padding: Spacing.md,
    minHeight: 110,
  },
  counter: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'right', marginTop: 4 },
  counterOk: { color: Colors.green },

  errorPanel: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    backgroundColor: Colors.warningTint,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  errorText: { color: Colors.warning, fontSize: FontSize.sm, lineHeight: 19 },

  submit: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: Colors.onPrimary, fontSize: FontSize.md, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  footnote: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 16 },

  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: Spacing.md },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    backgroundColor: Colors.bgCard2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  stepDotActive: { borderColor: Colors.gold },
  stepLabel: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },
  stepLabelOn: { color: Colors.ink, fontWeight: '700' },
  track: { width: '100%', height: 6, borderRadius: Radius.pill, backgroundColor: Colors.bgCard2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Colors.gold },
  progressHint: { color: Colors.textSoft, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.md, lineHeight: 20 },
  progressWarn: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.sm },

  outcomeTitle: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', marginTop: Spacing.md },
  outcomeBody: { color: Colors.textSoft, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, marginTop: Spacing.sm, maxWidth: 320 },
  outcomeNote: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17, marginTop: Spacing.md, maxWidth: 320 },
  outcomeButton: { alignSelf: 'stretch' },
});
