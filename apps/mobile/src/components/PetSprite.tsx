import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { MOOD_CUE, type Mood } from '@/data/moodModel';
import { type HomeId } from '@/data/petHomeModel';
import { type PetId } from '@/data/petModel';
import { type FrameSet } from '@/data/spriteFrames';
import {
  REACTION_TEXT,
  applyStep,
  flourishFor,
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
 * The `mood` prop (moodModel, derived from the server's stats by the screen)
 * bends the walker's odds and adds a small cue — dust, a droop, sparkles —
 * and `message` is the one line of dialogue the screen chose to show.
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
  mood = 'balanced',
  petId = null,
  message = null,
}: {
  home: HomeId;
  frames: FrameSet;
  /** Presentation state from moodModel; drives behaviour odds and the cue overlay. */
  mood?: Mood;
  /** Which species — picks the flourish. */
  petId?: PetId | null;
  /** A line of dialogue to show in the bubble (the screen owns the cooldown). */
  message?: string | null;
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
  /** Vertical hop for the species flourish and for `happy`; separate from the walk. */
  const hop = useRef(new Animated.Value(0)).current;
  const hopping = useRef<Animated.CompositeAnimation | null>(null);
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
    hopping.current?.stop();
    hopping.current = null;
    hop.setValue(0);
  }, [freezeWalk, hop]);

  /** The species flourish (or a single small hop for `happy`). Native-driven; snaps under Reduce Motion. */
  const playHops = useCallback(
    (kind: 'flourish' | 'happy') => {
      hopping.current?.stop();
      hop.setValue(0);
      if (reduced) return;
      const f = flourishFor(petId);
      const hops: [number, number][] = kind === 'flourish' && f ? f.hops : [[8, 160]];
      const hoverMs = kind === 'flourish' && f ? f.hoverMs : 0;
      const seq: Animated.CompositeAnimation[] = [];
      hops.forEach(([h, up], i) => {
        seq.push(Animated.timing(hop, { toValue: -h, duration: up, easing: Easing.out(Easing.quad), useNativeDriver: true }));
        if (i === hops.length - 1 && hoverMs > 0) seq.push(Animated.delay(hoverMs));
        seq.push(Animated.timing(hop, { toValue: 0, duration: up, easing: Easing.in(Easing.quad), useNativeDriver: true }));
      });
      hopping.current = Animated.sequence(seq);
      hopping.current.start(() => {
        hopping.current = null;
      });
    },
    [hop, petId, reduced],
  );
  const runRef = useRef<(step: Step) => void>(() => {});
  /** The latest mood, read when the NEXT step is chosen — a mood change never interrupts a step. */
  const moodRef = useRef<Mood>(mood);
  moodRef.current = mood;

  /** Run one step: set the state, start the frame ticker, move if walking, then schedule the next. */
  const run = useCallback(
    (step: Step) => {
      const next = { ...applyStep(machineRef.current, step), state: step.state };
      machineRef.current = next;
      setMachine(next);
      setTick(0);

      if (ticker.current) clearInterval(ticker.current);
      ticker.current = setInterval(() => setTick((t) => t + 1), Math.round(1000 / fpsFor(step.state)));

      if (step.state === 'celebrate') playHops('flourish');
      else if (step.state === 'happy') playHops('happy');

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
        runRef.current(nextStep(machineRef.current, home, rng, reduced, { mood: moodRef.current, petId }));
      }, step.durationMs);
    },
    [home, pos, reduced, rng, toPx, playHops, petId],
  );
  runRef.current = run;

  /* Start / stop the loop with `running`. */
  useEffect(() => {
    if (!running) {
      clearAll();
      return;
    }
    run(nextStep({ ...machineRef.current, state: 'idle' }, home, rng, reduced, { mood: moodRef.current, petId }));
    return clearAll;
  }, [running, home, reduced, rng, run, clearAll, petId]);

  /* Reactions: interrupt whatever is happening (a walk snaps to where it was). */
  const say = useCallback((text: string, ms = 1400) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
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

  /* Dialogue chosen by the screen (moodModel.nextDialogue owns the cooldown). */
  useEffect(() => {
    if (message && showBubbles) say(message, 3200);
  }, [message, showBubbles, say]);

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

  const frame = frameFor(machine.state, tick, petId);
  const cue = machine.state === 'celebrate' ? 'sparkle' : MOOD_CUE[mood];
  const droop = cue === 'droop' && machine.state !== 'celebrate' && machine.state !== 'happy';

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="box-none">
      <Animated.View style={[styles.sprite, { width: size, transform: pos.getTranslateTransform() }]} pointerEvents="box-none">
        {bubble ? (
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <Text style={styles.bubbleText} numberOfLines={2}>
              {bubble}
            </Text>
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
          <Animated.View style={{ transform: [{ translateY: hop }], opacity: droop ? 0.92 : 1 }}>
            <Image source={frames[frame]} style={{ width: size, height: size }} contentFit="contain" allowDownscaling={false} transition={0} />
          </Animated.View>
          <Cue cue={cue} size={size} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * The small mood cue drawn over the sprite: a few dust puffs, restrained
 * sparkles, or nothing. Views, not images, so no asset is needed and the
 * pixel art underneath is never altered.
 */
function Cue({ cue, size }: { cue: ReturnType<typeof cueOf>; size: number }) {
  if (cue === 'dust') {
    return (
      <View style={[styles.cueWrap, { width: size, height: size }]} pointerEvents="none" accessibilityElementsHidden>
        <View style={[styles.dust, { left: size * 0.12, top: size * 0.22, width: 7, height: 7 }]} />
        <View style={[styles.dust, { left: size * 0.78, top: size * 0.3, width: 5, height: 5 }]} />
        <View style={[styles.dust, { left: size * 0.7, top: size * 0.12, width: 4, height: 4 }]} />
      </View>
    );
  }
  if (cue === 'sparkle') {
    return (
      <View style={[styles.cueWrap, { width: size, height: size }]} pointerEvents="none" accessibilityElementsHidden>
        <Text style={[styles.sparkle, { left: size * 0.08, top: size * 0.1 }]}>✦</Text>
        <Text style={[styles.sparkle, styles.sparkleSmall, { left: size * 0.8, top: size * 0.2 }]}>✦</Text>
      </View>
    );
  }
  return null;
}
const cueOf = (m: Mood) => MOOD_CUE[m];

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0, alignItems: 'center' },
  cueWrap: { position: 'absolute', left: 0, top: 0 },
  dust: { position: 'absolute', borderRadius: 99, backgroundColor: Colors.inkFaint, opacity: 0.55 },
  sparkle: { position: 'absolute', color: Colors.accentWarm, fontSize: 12 },
  sparkleSmall: { fontSize: 9 },
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
