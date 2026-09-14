import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PET_CATALOG } from '@/data/petModel';
import {
  MIN_MASCOT_LOADER_MS,
  WAKE_PHASES,
  WAKE_TIMINGS,
  resolveWakePet,
  shouldRevealAccount,
  wakeFrameForPhase,
  wakeMessageFor,
  type WakeState,
} from '@/data/wakeModel';
import { WAKE_FRAMES } from '@/data/wakeSprites';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Mascot wake-up loader — the account-loading buffer (Phase 6).
 *
 * The mobile port of src/components/animations/MascotWakeLoader.jsx. The
 * participant's companion sleeps, stirs, performs its flourish and settles
 * awake. The sequence is MANDATORY by default: the account is revealed only
 * once BOTH the minimum has played AND the data has arrived — with an
 * always-visible Skip that drops the duration requirement on demand.
 *
 * It never blocks a request. The caller starts auth and data fetching first
 * and reports readiness via `accountDataReady`; this component gates the
 * REVEAL, never the network.
 *
 * State machine
 *   sleeping → waking → personalityAction → awake      (the four drawn poses)
 *     → waitingForAccount   minimum played, data still in flight
 *     → skipped             the participant pressed Skip
 *     → error               the caller reported a failure; timers stop
 *   Every terminal state holds the awake frame.
 *
 * Reveal rule: onComplete() fires once, when
 *   accountDataReady && (minimum played || skipped).
 *
 * Reduced motion keeps the full mandatory sequence (every state is still shown
 * for its readable minimum) and drops only the pulsing and cross-fades.
 */

const A11Y_STATUS = 'Loading your PetQuest account. Your pet is waking up.';

type Props = {
  petType?: string | null;
  restartToken?: string | number;
  accountDataReady: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
  error?: boolean;
  message?: string;
};

export default function MascotWakeLoader({
  petType,
  restartToken = 0,
  accountDataReady,
  onComplete,
  onSkip,
  error = false,
  message,
}: Props) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  /* ── Lock the companion for this loading instance ──
     Re-picked only when restartToken changes, so a profile arriving mid-run
     can never swap the pet out from under the participant. */
  const lockRef = useRef<{ id: keyof typeof PET_CATALOG; random: boolean } | null>(null);
  const tokenRef = useRef(restartToken);
  if (lockRef.current === null || tokenRef.current !== restartToken) {
    tokenRef.current = restartToken;
    lockRef.current = resolveWakePet(petType);
  }
  const { id: petId, random: isRandomPet } = lockRef.current;

  const [phase, setPhase] = useState<WakeState>('sleeping');
  const [skipped, setSkipped] = useState(false);

  // Callbacks in refs: a caller re-rendering with a fresh closure must not
  // restart the sequence or re-fire the reveal.
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const skipCbRef = useRef(onSkip);
  skipCbRef.current = onSkip;
  const firedRef = useRef(false); // onComplete is a one-shot

  /* ── The timed sequence ──
     One timer per pose, all cleared on unmount, restart and error, so a stale
     timer can never set state or reveal a previous account. */
  useEffect(() => {
    firedRef.current = false;
    setSkipped(false);
    setPhase('sleeping'); // every (re)start begins asleep
    if (error) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < WAKE_PHASES.length; i++) {
      elapsed += WAKE_TIMINGS[WAKE_PHASES[i - 1]];
      timers.push(setTimeout(() => setPhase(WAKE_PHASES[i]), elapsed));
    }
    // Minimum reached: hold the awake pet until the data lands.
    timers.push(
      setTimeout(() => {
        setPhase((p) => (p === 'skipped' ? p : 'waitingForAccount'));
      }, MIN_MASCOT_LOADER_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [restartToken, petId, error]);

  /* ── The reveal rule ── */
  const minimumDone = phase === 'waitingForAccount';
  useEffect(() => {
    if (firedRef.current) return;
    if (shouldRevealAccount({ accountDataReady, minimumDone, skipped, error })) {
      firedRef.current = true;
      completeRef.current?.();
    }
  }, [accountDataReady, minimumDone, skipped, error]);

  /* Skip: stop advancing and drop the duration requirement. Idempotent. */
  const handleSkip = useCallback(() => {
    setSkipped((prev) => {
      if (!prev) skipCbRef.current?.();
      return true;
    });
    setPhase('skipped');
  }, []);

  /* ── Decorative motion only (respects reduced motion) ── */
  const glow = useRef(new Animated.Value(0.3)).current;
  const shownPhase: WakeState = error ? 'error' : phase;
  const frameIndex = wakeFrameForPhase(shownPhase);
  const awake = frameIndex === WAKE_PHASES.length - 1;

  useEffect(() => {
    if (reduceMotion) {
      glow.setValue(awake ? 0.6 : 0.3);
      return;
    }
    if (!awake) {
      Animated.timing(glow, { toValue: 0.28, duration: 300, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.85, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.5, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [awake, reduceMotion, glow]);

  const meta = PET_CATALOG[petId];
  const caption = message ?? wakeMessageFor(petId, shownPhase, !isRandomPet);
  const size = 148;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}
      pointerEvents="auto"
    >
      <View
        style={styles.center}
        accessible
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${A11Y_STATUS} ${caption}`}
      >
        <View style={[styles.stage, { width: size, height: size }]}>
          <Animated.View
            style={[
              styles.glow,
              { width: size * 0.9, height: size * 0.9, backgroundColor: meta.accent, opacity: glow },
            ]}
          />
          <Image
            source={WAKE_FRAMES[petId][frameIndex]}
            style={{ width: size, height: size }}
            contentFit="contain"
            allowDownscaling={false}
            // expo-image cross-fades source changes; zero when motion is reduced.
            transition={reduceMotion ? 0 : 160}
            accessibilityLabel={`${meta.species} waking up`}
          />
        </View>

        <Text style={[styles.caption, { color: meta.accent }]}>{caption}</Text>
      </View>

      {/* Skip — always visible, outside the live region so it is not re-announced.
          Secondary styling so it reads as an option, not the primary action. */}
      {!error && (
        <Pressable
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip pet wake-up animation"
          accessibilityHint="Opens your account as soon as it has loaded"
          hitSlop={8}
          style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
        >
          <Text style={styles.skipText}>Skip animation →</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    zIndex: 1000,
    elevation: 1000,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', borderRadius: Radius.pill },
  caption: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: Spacing.md,
    maxWidth: 320,
    letterSpacing: 0.4,
  },
  skip: {
    marginTop: Spacing.xl,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  skipPressed: { opacity: 0.7 },
  skipText: { color: '#a78bfa', fontSize: FontSize.sm, fontWeight: '700' },
});
