import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { type HomeId } from '@/data/petHomeModel';
import { type FrameSet } from '@/data/spriteFrames';
import {
  REACTION_TEXT,
  applyStep,
  fpsFor,
  frameFor,
  nextStep,
  reactionStep,
  startPoint,
  type Machine,
  type Point,
  type Reaction,
  type Rng,
  type Step,
} from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors, FontSize, Radius } from '@/theme';

const WALK_EASING = Easing.inOut(Easing.quad);

/**
 * The walking baby pet, placed over a home scene.
 *
 * Two animations run together:
 *   A. frames — a ticker at the state's cadence (10 fps walking, 2 fps idle)
 *      picks the sheet frame via `frameFor(state, tick)`;
 *   B. position — an `Animated.ValueXY` moved with `Animated.timing`
 *      (native driver) over a duration computed from the distance, so the
 *      sprite passes through every intermediate point rather than hopping.
 * The frame ticker starts with the walk and stops when the timing completes,
 * so the legs never move while the body is still.
 *
 * The sprite is anchored at its feet: `at` is the feet point in normalised
 * scene coordinates and the image is offset up by its own height. Frames are
 * all 128 × 128 with the feet on one baseline, so a frame swap never shifts
 * the body.
 *
 * Cosmetic only. Taps play `happy`; care reactions arrive through the
 * `reaction` prop, which the screens set only after `care_pet()` replied ok.
 * Nothing here reads or writes application state.
 *
 * Reanimated is in the project but its Babel/worklets plugin is not something
 * this session could verify on a device, so this uses React Native's Animated
 * with the native driver — the same thing the wake-up loader and the hero
 * float already rely on.
 */
export function PetSprite({
  home,
  frames,
  size = 64,
  reaction,
  rng = Math.random,
  active = true,
  showBubbles = true,
  accessibilityLabel,
}: {
  home: HomeId;
  frames: FrameSet;
  /** Rendered size in points (the frame is 128 px, so 64 = 2× pixel density). */
  size?: number;
  /** A care reaction to play; bump `nonce` to replay the same kind. */
  reaction?: { kind: Reaction; nonce: number } | null;
  /** Injectable for tests. */
  rng?: Rng;
  /** False pauses everything (screen unfocused, app backgrounded). */
  active?: boolean;
  showBubbles?: boolean;
  accessibilityLabel: string;
}) {
  const reduced = useReducedMotion();
  const [scene, setScene] = useState({ w: 0, h: 0 });
  const [machine, setMachine] = useState<Machine>(() => ({ state: 'idle', at: startPoint(home) }));
  const [tick, setTick] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const moving = useRef<Animated.CompositeAnimation | null>(null);
  const machineRef = useRef(machine);
  /** Where the feet are at the start of the current step. */
  const fromRef = useRef<Point>(machine.at);

  /* Focus / background → paused. The step loop simply does not schedule. */
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
  const running = active && focused && foreground && scene.w > 0;

  const toPx = useCallback((p: Point) => ({ x: p.x * scene.w - size / 2, y: p.y * scene.h - size }), [scene.w, scene.h, size]);

  /* A new home: stand in its centre. */
  useEffect(() => {
    const at = startPoint(home);
    machineRef.current = { state: 'idle', at };
    fromRef.current = at;
    setMachine({ state: 'idle', at });
    pos.setValue(toPx(at));
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The scene was measured (or resized): keep the feet on the same normalised point. */
  useEffect(() => {
    if (scene.w > 0) pos.setValue(toPx(machineRef.current.at));
  }, [scene.w, scene.h, toPx, pos]);

  /** The walk in progress, so an interruption can compute where the feet are. */
  const walk = useRef<{ from: Point; to: Point; startedAt: number; durationMs: number } | null>(null);

  /**
   * Stop a walk mid-way and put the feet where the eased timing had got to,
   * so the machine and the picture agree. Returns the feet point.
   */
  const freezeWalk = useCallback((): Point => {
    const w = walk.current;
    let at = machineRef.current.at;
    if (w) {
      const t = reduced ? 1 : Math.min(1, (Date.now() - w.startedAt) / w.durationMs);
      const k = WALK_EASING(t);
      at = { x: w.from.x + (w.to.x - w.from.x) * k, y: w.from.y + (w.to.y - w.from.y) * k };
      moving.current?.stop();
      moving.current = null;
      walk.current = null;
      pos.setValue(toPx(at));
      machineRef.current = { ...machineRef.current, at };
      fromRef.current = at;
    }
    return at;
  }, [reduced, pos, toPx]);

  const clearAll = useCallback(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    if (ticker.current) clearInterval(ticker.current);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    stepTimer.current = null;
    ticker.current = null;
    bubbleTimer.current = null;
    freezeWalk();
    moving.current?.stop();
    moving.current = null;
  }, [freezeWalk]);
  const runRef = useRef<(step: Step) => void>(() => {});

  /** Run one step: set the state, start the frame ticker, move if walking, then schedule the next. */
  const run = useCallback(
    (step: Step) => {
      const next = { ...applyStep(machineRef.current, step), state: step.state };
      machineRef.current = next;
      setMachine(next);
      setTick(0);

      if (ticker.current) clearInterval(ticker.current);
      ticker.current = setInterval(() => setTick((t) => t + 1), Math.round(1000 / fpsFor(step.state)));

      const walking = step.state === 'walkLeft' || step.state === 'walkRight';
      if (walking) {
        walk.current = { from: fromRef.current, to: step.to, startedAt: Date.now(), durationMs: step.durationMs };
        moving.current?.stop();
        moving.current = Animated.timing(pos, {
          toValue: toPx(step.to),
          duration: reduced ? 0 : step.durationMs,
          easing: WALK_EASING,
          useNativeDriver: true,
        });
        moving.current.start();
      } else {
        walk.current = null;
      }
      fromRef.current = step.to;

      if (stepTimer.current) clearTimeout(stepTimer.current);
      stepTimer.current = setTimeout(() => {
        // Arrived (or the pause ended): the frame ticker for this state stops here.
        if (ticker.current) clearInterval(ticker.current);
        ticker.current = null;
        moving.current = null;
        walk.current = null;
        runRef.current(nextStep(machineRef.current, home, rng, reduced));
      }, step.durationMs);
    },
    [home, pos, reduced, rng, toPx],
  );
  runRef.current = run;

  /* Start / stop the loop with `running`. */
  useEffect(() => {
    if (!running) {
      clearAll();
      return;
    }
    run(nextStep({ ...machineRef.current, state: 'idle' }, home, rng, reduced));
    return clearAll;
  }, [running, home, reduced, rng, run, clearAll]);

  /* Reactions: interrupt whatever is happening (a walk snaps to where it was). */
  const say = useCallback((text: string) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), 1400);
  }, []);

  const react = useCallback(
    (kind: Reaction) => {
      if (!running) return;
      const at = freezeWalk();
      run(reactionStep(kind, at));
      if (showBubbles) say(REACTION_TEXT[kind]);
    },
    [running, freezeWalk, run, showBubbles, say],
  );

  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!reaction || reaction.nonce === lastNonce.current) return;
    lastNonce.current = reaction.nonce;
    react(reaction.kind);
  }, [reaction, react]);

  useEffect(() => clearAll, [clearAll]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== scene.w || height !== scene.h) setScene({ w: width, h: height });
  };

  const frame = frameFor(machine.state, tick);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="box-none">
      <Animated.View style={[styles.sprite, { width: size, transform: pos.getTranslateTransform() }]} pointerEvents="box-none">
        {bubble ? (
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <Text style={styles.bubbleText}>{bubble}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => react('tap')}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Says hello"
          hitSlop={6}
          style={{ width: size, height: size }}
        >
          <Image source={frames[frame]} style={{ width: size, height: size }} contentFit="contain" allowDownscaling={false} transition={0} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0, alignItems: 'center' },
  bubble: {
    position: 'absolute',
    top: -26,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bubbleText: { color: Colors.ink, fontSize: FontSize.xs, fontWeight: '600' },
});
