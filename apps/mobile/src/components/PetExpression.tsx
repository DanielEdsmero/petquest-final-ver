import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { MAX_OFFSET, REDUCED_FRAME, careClip, nextClip, type CareKind, type Clip, type CloseupState } from '@/data/closeupModel';
import { MOOD_CUE, type Mood } from '@/data/moodModel';
import { type PetId } from '@/data/petModel';
import { type FrameSet } from '@/data/spriteFrames';
import { type Reaction } from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors } from '@/theme';

/**
 * The close-up companion: a frame-by-frame clip player.
 *
 * Two systems, as the brief requires, and the FRAMES are the animation — the
 * card is never scaled or bounced to fake life:
 *
 *   A. frames — a self-scheduling timeout chain walks the current clip's
 *      `{ frame, ms }` steps (animated segments at 10 fps, poses held
 *      longer). One state update per step, never per render.
 *   B. motion — an `Animated.ValueXY` driven through the clip's motion track
 *      with a sequence of `Animated.timing` segments (native driver), so a
 *      hover, a bounce or a shiver interpolates continuously between points
 *      instead of teleporting. Offsets are bounded by `MAX_OFFSET`.
 *
 * Breathing is a 2 % scale of the sprite image itself, running only during
 * clips that ask for it (there is no breathing frame in the sheets).
 *
 * When a clip ends the scheduler picks the next one for the current mood, so
 * the loop reads `breathe → blink → idle → lookAround → idle → species
 * action`. A confirmed care reaction interrupts and then hands control back.
 *
 * Everything stops on blur, on backgrounding and on unmount. Reduce Motion
 * holds one pose per mood with no timers and no movement at all.
 *
 * Cosmetic only: no Supabase, no stats, no points. A care clip plays only
 * because a screen passed a `reaction`, which it does only after
 * `care_pet()` replied ok.
 */
export function PetExpression({
  frames,
  portrait,
  mood,
  petId,
  size = 220,
  reaction,
  onTap,
  onStateChange,
  accessibilityLabel,
  rng = Math.random,
}: {
  /** Sheet frames for a Baby companion, or null to hold the portrait. */
  frames: FrameSet | null;
  portrait: ImageSourcePropType | null;
  mood: Mood;
  petId: PetId | null;
  size?: number;
  reaction?: { kind: Reaction; nonce: number } | null;
  onTap?: () => void;
  /** Lets the screen know what is being played (the rest clip changes the message). */
  onStateChange?: (state: CloseupState, label: string) => void;
  accessibilityLabel: string;
  rng?: () => number;
}) {
  const reduced = useReducedMotion();
  const animatable = !!frames && !!petId;

  const [clip, setClip] = useState<Clip | null>(null);
  const [frame, setFrame] = useState<string>('idle');
  const offset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const breath = useRef(new Animated.Value(0)).current;

  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motion = useRef<Animated.CompositeAnimation | null>(null);
  const breathLoop = useRef<Animated.CompositeAnimation | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const moodRef = useRef<Mood>(mood);
  moodRef.current = mood;
  const playRef = useRef<(c: Clip) => void>(() => {});
  /**
   * Held in a ref on purpose: an inline `onStateChange` from the screen would
   * change `play`'s identity on every render, which would re-run the
   * start/stop effect and restart the clip on a loop.
   */
  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;

  /* Paused while the screen is not visible. */
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  const running = animatable && !reduced && focused && foreground;

  const stopAll = useCallback(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = null;
    motion.current?.stop();
    motion.current = null;
    breathLoop.current?.stop();
    breathLoop.current = null;
    offset.setValue({ x: 0, y: 0 });
    breath.setValue(0);
  }, [offset, breath]);

  /** Walk the clip's frame steps, one timeout per step. */
  const runSteps = useCallback((c: Clip, index: number) => {
    const step = c.steps[index];
    setFrame(step.frame);
    stepTimer.current = setTimeout(() => {
      if (index + 1 < c.steps.length) {
        runSteps(c, index + 1);
        return;
      }
      // Clip finished: hand back to the scheduler.
      playRef.current(nextClip(c, moodRef.current, petId ?? 'dragon', rng));
    }, step.ms);
  }, [petId, rng]);

  /** Drive the motion track as consecutive timing segments — continuous, never a jump. */
  const runMotion = useCallback(
    (c: Clip) => {
      motion.current?.stop();
      offset.setValue({ x: 0, y: 0 });
      const keys = c.motion;
      if (!keys || keys.length < 2) {
        motion.current = null;
        return;
      }
      const clamp = (v: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, v));
      const segments: Animated.CompositeAnimation[] = [];
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1];
        const b = keys[i];
        segments.push(
          Animated.timing(offset, {
            toValue: { x: clamp(b.dx ?? 0), y: clamp(b.dy ?? 0) },
            duration: Math.max(1, b.at - a.at),
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        );
      }
      motion.current = Animated.sequence(segments);
      motion.current.start();
    },
    [offset],
  );

  /** The breathing scale: a slow loop, only while the clip asks for it. */
  const runBreath = useCallback(
    (c: Clip) => {
      breathLoop.current?.stop();
      if (!c.breathe) {
        breath.setValue(0);
        breathLoop.current = null;
        return;
      }
      const period = c.slow ? 2600 : 1800;
      breathLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breath, { toValue: 0, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      breathLoop.current.start();
    },
    [breath],
  );

  const play = useCallback(
    (c: Clip) => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      clipRef.current = c;
      setClip(c);
      onStateRef.current?.(c.state, c.label);
      runBreath(c);
      runMotion(c);
      runSteps(c, 0);
    },
    [runBreath, runMotion, runSteps],
  );
  playRef.current = play;

  /* Start / stop the loop. */
  useEffect(() => {
    if (!running) {
      stopAll();
      return;
    }
    play(nextClip(clipRef.current, moodRef.current, petId ?? 'dragon', rng));
    return stopAll;
  }, [running, petId, rng, play, stopAll]);

  useEffect(() => stopAll, [stopAll]);

  /* A confirmed care reaction (or a tap) interrupts, plays, then resumes. */
  const lastNonce = useRef<number | null>(null);
  const playCare = useCallback(
    (kind: CareKind) => {
      if (!running || !petId) return;
      play(careClip(petId, kind));
    },
    [running, petId, play],
  );
  useEffect(() => {
    if (!reaction || reaction.nonce === lastNonce.current) return;
    lastNonce.current = reaction.nonce;
    if (reaction.kind === 'tap') playCare('play');
    else playCare(reaction.kind);
  }, [reaction, playCare]);

  /* What to draw. Reduce Motion and non-Baby stages hold a single pose. */
  const shownFrame = reduced || !running ? REDUCED_FRAME[mood] : (frame as keyof FrameSet);
  const source = frames ? frames[shownFrame] : portrait;
  const cue = clip?.state === 'happy' || mood === 'happy' || mood === 'thriving' ? 'sparkle' : MOOD_CUE[mood];
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const droop = mood === 'sad' ? 3 : 0;

  return (
    <Pressable
      onPress={() => {
        playCare('play');
        onTap?.();
      }}
      accessibilityRole="image"
      accessibilityLabel={clip && running ? `${accessibilityLabel}, ${clip.label}` : accessibilityLabel}
      accessibilityHint="Says hello"
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ translateX: offset.x }, { translateY: Animated.add(offset.y, new Animated.Value(droop)) }, { scale }],
        }}
      >
        {source ? (
          <Image source={source} style={{ width: size, height: size }} contentFit="contain" allowDownscaling={false} transition={0} />
        ) : (
          <Text style={[styles.egg, { fontSize: size * 0.5, lineHeight: size }]}>🥚</Text>
        )}
      </Animated.View>
      {cue === 'dust' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
          <View style={[styles.dust, { left: size * 0.14, top: size * 0.24, width: 12, height: 12 }]} />
          <View style={[styles.dust, { left: size * 0.8, top: size * 0.32, width: 9, height: 9 }]} />
          <View style={[styles.dust, { left: size * 0.72, top: size * 0.14, width: 7, height: 7 }]} />
        </View>
      )}
      {cue === 'sparkle' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
          <Text style={[styles.sparkle, { left: size * 0.08, top: size * 0.12 }]}>✦</Text>
          <Text style={[styles.sparkle, styles.sparkleSmall, { left: size * 0.84, top: size * 0.22 }]}>✦</Text>
          <Text style={[styles.sparkle, styles.sparkleSmall, { left: size * 0.16, top: size * 0.7 }]}>✦</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  egg: { textAlign: 'center' },
  dust: { position: 'absolute', borderRadius: 99, backgroundColor: Colors.inkFaint, opacity: 0.5 },
  sparkle: { position: 'absolute', color: Colors.accentWarm, fontSize: 18 },
  sparkleSmall: { fontSize: 13 },
});
