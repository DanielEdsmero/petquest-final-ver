// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { Mood, Rng } from './moodModel.ts';
import type { PetId } from './petModel.ts';
import type { FrameKey } from './spriteModel.ts';

/**
 * View Pet close-up — the animation clips, per species, as data.
 *
 * The close-up is frame animation, not a moving card. A **clip** is an ordered
 * list of `{ frame, ms }` steps drawn from the companion's own eight frames,
 * optionally with a small motion track (a hover, a bounce, a shiver) that
 * stays inside the stage. The component plays clips; it never invents poses.
 *
 * WHAT THE ART ACTUALLY PROVIDES (checked against assets/sprites/*):
 *   f1 idle       sitting, front, eyes open
 *   f2 blink      sitting, front, eyes closed / soft smile
 *   f3/f4 left    standing side, head turned LEFT   (two-pose cycle)
 *   f5/f6 right   standing side, head turned RIGHT  (two-pose cycle)
 *   f7 happy      front, open-mouthed, arms/wings up
 *   f8 interact   low pose — dragon lying, cat grooming a paw, wolf nose-down
 *
 * So a head turn, a run cycle, a shake-off and a grooming beat are all REAL
 * frames. What the sheets do NOT contain: separate ear, tail, wing-fold or
 * eye-direction frames, and no breathing pose. Breathing is therefore a 2 %
 * scale of the sprite image (not the card), and ear/tail/wing motion is
 * listed in the report as art still to be drawn rather than faked.
 */

export type CloseupState =
  | 'breathe'
  | 'blink'
  | 'idle'
  | 'lookAround'
  | 'rest'
  | 'happy'
  | 'hungry'
  | 'needsCleaning'
  | 'careReaction';

export type FrameStep = { frame: FrameKey; ms: number };

/** A point on the motion track, in points relative to the resting position. */
export type MotionKey = { at: number; dx?: number; dy?: number };

export type Clip = {
  state: CloseupState;
  steps: FrameStep[];
  /** Optional position track, `at` in ms from the clip's start. */
  motion?: MotionKey[];
  /** Whether the breathing scale runs during this clip. */
  breathe: boolean;
  /** Slower, shallower breathing (rest and the low moods). */
  slow?: boolean;
  /** What a screen reader should be told is happening. */
  label: string;
};

/** Animated segments run at 10 fps; held poses are deliberately longer. */
export const CLIP_FPS = 10;
export const FRAME_MS = Math.round(1000 / CLIP_FPS); // 100

export const clipMs = (c: Clip) => c.steps.reduce((t, s) => t + s.ms, 0);

const hold = (frame: FrameKey, ms: number): FrameStep => ({ frame, ms });
/** `n` alternations of two frames at the clip frame rate — a real cycle. */
const cycle = (a: FrameKey, b: FrameKey, n: number, ms = FRAME_MS): FrameStep[] =>
  Array.from({ length: n * 2 }, (_, i) => hold(i % 2 === 0 ? a : b, ms));

/* ── Clips every companion shares ── */

const breathe = (slow = false): Clip => ({
  state: 'breathe',
  steps: [hold('idle', slow ? 2600 : 1800)],
  breathe: true,
  slow,
  label: 'breathing quietly',
});

const blink: Clip = { state: 'blink', steps: [hold('blink', 160), hold('idle', 120)], breathe: true, label: 'blinking' };

const idle = (ms = 900): Clip => ({ state: 'idle', steps: [hold('idle', ms)], breathe: true, label: 'sitting' });

/**
 * A genuine look-around: the front pose, then the head-left standing pose,
 * back to front, then head-right, back to front. Real frames, held long
 * enough to read as looking rather than walking.
 */
const lookAround: Clip = {
  state: 'lookAround',
  steps: [hold('idle', 260), hold('walkLeftA', 460), hold('idle', 240), hold('walkRightA', 460), hold('idle', 300)],
  breathe: true,
  label: 'looking around',
};

/** A glance toward the food side, then back. */
const hungry: Clip = {
  state: 'hungry',
  steps: [hold('idle', 300), hold('walkLeftA', 500), hold('walkLeftB', 400), hold('walkLeftA', 500), hold('idle', 400)],
  breathe: true,
  slow: true,
  label: 'looking toward its food',
};

/* ── Per species ── */

type ClipSet = { rest: Clip; happy: Clip; needsCleaning: Clip; feed: Clip; wash: Clip };

/** A shake-off: the two side poses alternating fast, with a small side wobble. */
const shake = (state: CloseupState, label: string, n = 6): Clip => ({
  state,
  steps: cycle('walkLeftA', 'walkRightA', n, 90),
  motion: [{ at: 0, dx: 0 }, { at: 180, dx: -3 }, { at: 360, dx: 3 }, { at: 540, dx: -2 }, { at: 720, dx: 2 }, { at: n * 180, dx: 0 }],
  breathe: false,
  label,
});

export const CLIPS: Record<PetId, ClipSet> = {
  dragon: {
    // Lying low, wings folded, eyes soft; the slow breath does the rest.
    rest: { state: 'rest', steps: [hold('interact', 2400)], breathe: true, slow: true, label: 'resting with its wings folded' },
    // Wing flap into a short controlled hover, then settle.
    happy: {
      state: 'happy',
      steps: [...cycle('happy', 'idle', 3), hold('happy', 420), ...cycle('happy', 'idle', 2), hold('idle', 220)],
      motion: [{ at: 0, dy: 0 }, { at: 300, dy: -14 }, { at: 600, dy: -20 }, { at: 1020, dy: -18 }, { at: 1320, dy: -6 }, { at: 1540, dy: 0 }],
      breathe: false,
      label: 'flapping its wings and hovering',
    },
    needsCleaning: shake('needsCleaning', 'shaking dust from its scales'),
    feed: { state: 'careReaction', steps: [hold('walkLeftA', 320), hold('interact', 560), hold('blink', 240), hold('happy', 420)], breathe: true, label: 'eating' },
    wash: shake('careReaction', 'shaking off the water', 8),
  },
  cat: {
    // Curled up, one paw tucked.
    rest: { state: 'rest', steps: [hold('interact', 2400)], breathe: true, slow: true, label: 'curled up' },
    // Stretch, then a paw wave.
    happy: {
      state: 'happy',
      steps: [hold('interact', 260), hold('happy', 260), hold('interact', 220), hold('happy', 260), hold('idle', 240)],
      motion: [{ at: 0, dy: 0 }, { at: 300, dy: -10 }, { at: 600, dy: 0 }, { at: 900, dy: -6 }, { at: 1240, dy: 0 }],
      breathe: false,
      label: 'stretching and waving a paw',
    },
    // The cat's own grooming pose, with a blink between licks.
    needsCleaning: {
      state: 'needsCleaning',
      steps: [hold('interact', 620), hold('blink', 260), hold('interact', 620), hold('idle', 320)],
      breathe: true,
      slow: true,
      label: 'grooming a paw',
    },
    feed: { state: 'careReaction', steps: [hold('walkLeftA', 300), hold('interact', 520), hold('blink', 240), hold('happy', 400)], breathe: true, label: 'eating' },
    wash: shake('careReaction', 'shaking off the water', 8),
  },
  wolf: {
    rest: { state: 'rest', steps: [hold('interact', 2400)], breathe: true, slow: true, label: 'resting with its tail curled' },
    // A grounded run-in-place: the right-facing two-pose cycle with a bounce.
    happy: {
      state: 'happy',
      steps: [...cycle('walkRightA', 'walkRightB', 4), hold('happy', 360), ...cycle('walkRightA', 'walkRightB', 2)],
      motion: [{ at: 0, dy: 0, dx: 0 }, { at: 200, dy: -7, dx: 2 }, { at: 400, dy: 0, dx: 0 }, { at: 600, dy: -7, dx: -2 }, { at: 800, dy: 0, dx: 0 }, { at: 1560, dy: 0, dx: 0 }],
      breathe: false,
      label: 'bouncing on the spot',
    },
    needsCleaning: shake('needsCleaning', 'shaking out its fur'),
    feed: { state: 'careReaction', steps: [hold('walkLeftA', 300), hold('interact', 560), hold('blink', 220), hold('happy', 400)], breathe: true, label: 'eating' },
    wash: shake('careReaction', 'shaking off the water', 8),
  },
};

/* ── The scheduler ── */

export type CareKind = 'feed' | 'wash' | 'play';

/** The clip a confirmed care action plays. Never called before the server replies. */
export function careClip(petId: PetId, kind: CareKind): Clip {
  const set = CLIPS[petId];
  if (kind === 'feed') return set.feed;
  if (kind === 'wash') return set.wash;
  return set.happy;
}

/** Weighted pick; weights are per mood so a low pet never celebrates. */
type Weighted = { clip: Clip; weight: number };

function weights(mood: Mood, petId: PetId): Weighted[] {
  const set = CLIPS[petId];
  switch (mood) {
    case 'unclean':
      return [
        { clip: set.needsCleaning, weight: 3 },
        { clip: breathe(true), weight: 3 },
        { clip: blink, weight: 2 },
        { clip: set.rest, weight: 2 },
        { clip: idle(1100), weight: 1 },
      ];
    case 'hungry':
      return [
        { clip: hungry, weight: 3 },
        { clip: breathe(true), weight: 3 },
        { clip: blink, weight: 2 },
        { clip: lookAround, weight: 1 },
        { clip: idle(1100), weight: 1 },
      ];
    case 'sad':
      return [
        { clip: breathe(true), weight: 4 },
        { clip: set.rest, weight: 3 },
        { clip: blink, weight: 2 },
        { clip: idle(1400), weight: 2 },
      ];
    case 'happy':
      return [
        { clip: set.happy, weight: 2 },
        { clip: breathe(), weight: 3 },
        { clip: blink, weight: 2 },
        { clip: lookAround, weight: 2 },
        { clip: idle(), weight: 1 },
      ];
    case 'thriving':
      return [
        { clip: set.happy, weight: 3 },
        { clip: breathe(), weight: 2 },
        { clip: blink, weight: 2 },
        { clip: lookAround, weight: 2 },
      ];
    default: // balanced
      return [
        { clip: breathe(), weight: 4 },
        { clip: blink, weight: 3 },
        { clip: lookAround, weight: 2 },
        { clip: idle(), weight: 2 },
        { clip: set.rest, weight: 1 },
      ];
  }
}

/**
 * The next clip to play. Never the same clip twice in a row unless it is the
 * only option, so the loop reads as `breathe → blink → idle → lookAround →
 * idle → species action` rather than one repeated effect.
 */
export function nextClip(prev: Clip | null, mood: Mood, petId: PetId, rng: Rng): Clip {
  const pool = weights(mood, petId).filter((w) => !prev || w.clip.state !== prev.state || w.clip.state === 'breathe');
  const usable = pool.length > 0 ? pool : weights(mood, petId);
  const total = usable.reduce((t, w) => t + w.weight, 0);
  let roll = rng() * total;
  for (const w of usable) {
    roll -= w.weight;
    if (roll <= 0) return w.clip;
  }
  return usable[usable.length - 1].clip;
}

/** The pose to hold when motion is reduced — never a blank, never a walk frame. */
export const REDUCED_FRAME: Record<Mood, FrameKey> = {
  unclean: 'interact',
  hungry: 'idle',
  sad: 'idle',
  balanced: 'idle',
  happy: 'happy',
  thriving: 'happy',
};

/** Where the clip is at `elapsed` ms: which frame, and the motion offset. */
export function frameAt(clip: Clip, elapsed: number): { frame: FrameKey; index: number } {
  let t = 0;
  for (let i = 0; i < clip.steps.length; i++) {
    t += clip.steps[i].ms;
    if (elapsed < t) return { frame: clip.steps[i].frame, index: i };
  }
  const last = clip.steps.length - 1;
  return { frame: clip.steps[last].frame, index: last };
}

/** Linear interpolation along the motion track; {0,0} when the clip has none. */
export function motionAt(clip: Clip, elapsed: number): { dx: number; dy: number } {
  const keys = clip.motion;
  if (!keys || keys.length === 0) return { dx: 0, dy: 0 };
  const val = (k: MotionKey) => ({ dx: k.dx ?? 0, dy: k.dy ?? 0 });
  if (elapsed <= keys[0].at) return val(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (elapsed <= keys[i].at) {
      const a = keys[i - 1];
      const b = keys[i];
      const span = b.at - a.at;
      const f = span <= 0 ? 1 : (elapsed - a.at) / span;
      const va = val(a);
      const vb = val(b);
      return { dx: va.dx + (vb.dx - va.dx) * f, dy: va.dy + (vb.dy - va.dy) * f };
    }
  }
  return val(keys[keys.length - 1]);
}

/** The largest offset any clip asks for, so the stage can reserve room. */
export const MAX_OFFSET = 24;
