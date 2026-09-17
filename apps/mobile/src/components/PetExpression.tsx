import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { MAX_OFFSET, REDUCED_FRAME, careClip, nextClip, type CareKind, type Clip, type CloseupFrame, type CloseupState } from '@/data/closeupModel';
import { type CloseupFrameSet } from '@/data/closeupFrames';
import { MOOD_CUE, type Mood } from '@/data/moodModel';
import { type PetId } from '@/data/petModel';
import { type Reaction } from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors } from '@/theme';

/**
 * The close-up companion: a frame-by-frame clip player.
 *
 * Two systems, and the FRAMES are the animation — the card is never scaled
 * or bounced to fake life:
 *
 *   A. frames — a self-scheduling timeout chain walks the current clip's
 *      `{ frame, ms }` steps (animated beats at 10 fps, poses held longer).
 *      One state update per step, never per render.
 *   B. motion — an `Animated.ValueXY` driven through the clip's motion track
 *      with a sequence of `Animated.timing` segments (native driver), so a
 *      hover, a bounce or a shiver interpolates continuously between points
 *      instead of teleporting. Offsets are bounded by `MAX_OFFSET`.
 *
 * Breathing is a real four-frame cycle (idle → breathe → idle_return →
 * idle), so a Baby companion is animated with **no scaling at all**. The one
 * exception is the portrait fallback used by juvenile and older stages: no
 * close-up frames exist for them, so there a slow 1.5 % breath is the only
 * way to keep the pet from looking like a static image. That is documented
 * as art still to be drawn rather than hidden.
 *
 * When a clip ends the scheduler picks the next one for the current mood, so
 * the loop reads `breathe → blink → settle → breathe → species action`. A
 * confirmed care reaction interrupts and then hands control back.
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
  /** Close-up frames for a Baby companion, or null to hold the portrait. */
  frames: CloseupFrameSet | null;
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
  const [frame, setFrame] = useState<CloseupFrame>('idle');
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

  /**
   * The portrait-only breath. A Baby companion breathes through real frames,
   * so this never runs for one; it exists because juvenile and older stages
   * have no close-up frames and a completely still portrait reads as broken.
   */
  const runPortraitBreath = useCallback(() => {
    breathLoop.current?.stop();
    if (animatable || reduced) {
      breath.setValue(0);
      breathLoop.current = null;
      return;
    }
    breathLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    breathLoop.current.start();
  }, [animatable, reduced, breath]);

  useEffect(() => {
    runPortraitBreath();
    return () => breathLoop.current?.stop();
  }, [runPortraitBreath]);

  const play = useCallback(
    (c: Clip) => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      clipRef.current = c;
      setClip(c);
      onStateRef.current?.(c.state, c.label);
      runMotion(c);
      runSteps(c, 0);
    },
    [runMotion, runSteps],
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

  /* What to draw. Reduce Motion holds one pose; a portrait has only itself. */
  const shownFrame = reduced || !running ? REDUCED_FRAME[mood] : (frame as CloseupFrame);
  const source = frames ? frames[shownFrame] : portrait;
  // The frames carry their own sparkles and dust; only the portrait fallback
  // needs the drawn cue to show a mood at all.
  const cue = frames ? null : MOOD_CUE[mood];
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });
  const droop = !frames && mood === 'sad' ? 3 : 0;

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
