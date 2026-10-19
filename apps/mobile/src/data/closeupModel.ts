// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { Mood, Rng } from './moodModel.ts';
import type { PetId } from './petModel.ts';

/**
 * View Pet close-up — the animation clips, as data.
 *
 * The close-up is frame animation. A **clip** is an ordered list of
 * `{ frame, ms }` steps drawn from the companion's own close-up frames, plus
 * an optional motion track (a hover, a bounce, a shiver) bounded by
 * `MAX_OFFSET`. The card is never scaled or bounced to fake life, and for a
 * Baby companion there is no scaling at all — breathing is a real frame.
 *
 * THE SUPPLIED CLOSE-UP ART (assets/closeup/<pet>/, 8 frames each, already
 * registered on one baseline — see scripts/import-closeup-frames.py):
 *
 *   idle            neutral, sitting, eyes open
 *   breathe         chest/head raised — the inhale of the breathing cycle
 *   blink           eyes closed, content
 *   idle_return     a second settled pose, distinct from idle
 *   hungry          eyes lowered, looking toward its food
 *   needs_cleaning  dragon: dust motes · cat: squinting mid-groom · wolf: fur dulled
 *   happy           open smile, brighter effects
 *   care_reaction   eyes closed, blushing, sparkles
 *
 * What the set does NOT contain, so it is NOT implemented rather than faked:
 * a head-turn (look-around) pose, separate ear/tail/wing poses, and any
 * juvenile/adult/elder frame. `LOOK_AROUND_NEEDS_ART` records that.
 */

export type CloseupFrame = 'idle' | 'breathe' | 'blink' | 'idleReturn' | 'happy' | 'hungry' | 'needsCleaning' | 'careReaction';

export const CLOSEUP_FRAMES = ['idle', 'breathe', 'blink', 'idleReturn', 'happy', 'hungry', 'needsCleaning', 'careReaction'] as const;

/** File on disk for each frame. */
export const CLOSEUP_FILES: Record<CloseupFrame, string> = {
  idle: 'idle.png',
  breathe: 'breathe.png',
  blink: 'blink.png',
  idleReturn: 'idle_return.png',
  happy: 'happy.png',
  hungry: 'hungry.png',
  needsCleaning: 'needs_cleaning.png',
  careReaction: 'care_reaction.png',
};

/**
 * A head-turn pose is the one required state the supplied art cannot express.
 * Nothing simulates it with a transform; the report lists it as art to draw.
 */
export const LOOK_AROUND_NEEDS_ART = true;

export type CloseupState = 'breathe' | 'blink' | 'idle' | 'settle' | 'rest' | 'happy' | 'hungry' | 'needsCleaning' | 'careReaction';

export type FrameStep = { frame: CloseupFrame; ms: number };

/** A point on the motion track, in points relative to the resting position. */
export type MotionKey = { at: number; dx?: number; dy?: number };

export type Clip = {
  state: CloseupState;
  steps: FrameStep[];
  motion?: MotionKey[];
  /** What a screen reader should be told is happening. */
  label: string;
};

/** Animated beats run at 10 fps; poses are held longer on purpose. */
export const CLIP_FPS = 10;
export const FRAME_MS = Math.round(1000 / CLIP_FPS); // 100
/** The largest offset any clip asks for, so the stage can reserve room. */
export const MAX_OFFSET = 24;

export const clipMs = (c: Clip) => c.steps.reduce((t, s) => t + s.ms, 0);

const step = (frame: CloseupFrame, ms: number): FrameStep => ({ frame, ms });

/* ── Clips every companion shares ── */

/** A real breathing cycle: neutral → inhale → settle → neutral. No scaling. */
const BREATHE: Clip = {
  state: 'breathe',
  steps: [step('idle', 420), step('breathe', 560), step('idleReturn', 440), step('idle', 380)],
  label: 'breathing quietly',
};

/** Slower and deeper, for a pet that is low. */
const BREATHE_SLOW: Clip = {
  state: 'breathe',
  steps: [step('idle', 620), step('breathe', 820), step('idleReturn', 640), step('idle', 520)],
  label: 'breathing slowly',
};

const BLINK: Clip = { state: 'blink', steps: [step('idle', 200), step('blink', 150), step('idleReturn', 240)], label: 'blinking' };

const IDLE: Clip = { state: 'idle', steps: [step('idle', 900)], label: 'sitting' };

/** The second settled pose — a genuine shift of weight, not a transform. */
const SETTLE: Clip = { state: 'settle', steps: [step('idleReturn', 820), step('idle', 620)], label: 'settling' };

/** Dozing: eyes closed for a long beat, with a small stir. Frames only. */
const REST: Clip = {
  state: 'rest',
  steps: [step('blink', 1900), step('idleReturn', 260), step('blink', 1900), step('idle', 320)],
  label: 'resting with its eyes closed',
};

/** A look toward the food, held, then back. Its own dedicated pose. */
const HUNGRY: Clip = {
  state: 'hungry',
  steps: [step('idle', 260), step('hungry', 1100), step('idleReturn', 340)],
  label: 'looking toward its food',
};

/* ── Per species ── */

type ClipSet = { needsCleaning: Clip; happy: Clip; feed: Clip; wash: Clip };

/** The grooming/uncomfortable beat, with a blink partway through. */
const cleaning = (label: string, wobble: boolean): Clip => ({
  state: 'needsCleaning',
  steps: [step('idle', 220), step('needsCleaning', 1150), step('blink', 200), step('needsCleaning', 780), step('idleReturn', 300)],
  motion: wobble
    ? [{ at: 0, dx: 0 }, { at: 1500, dx: 0 }, { at: 1620, dx: -3 }, { at: 1740, dx: 3 }, { at: 1860, dx: -2 }, { at: 1980, dx: 2 }, { at: 2100, dx: 0 }, { at: 2650, dx: 0 }]
    : undefined,
  label,
});

export const CLIPS: Record<PetId, ClipSet> = {
  dragon: {
    needsCleaning: cleaning('shaking dust from its scales', true),
    // Alternating the two joyful poses, lifting into a held hover: the dragon
    // is the only one that leaves the ground.
    happy: {
      state: 'happy',
      steps: [step('happy', 160), step('careReaction', 160), step('happy', 160), step('careReaction', 160), step('happy', 520), step('idleReturn', 300)],
      motion: [{ at: 0, dy: 0 }, { at: 320, dy: -12 }, { at: 640, dy: -20 }, { at: 1160, dy: -18 }, { at: 1360, dy: -6 }, { at: 1460, dy: 0 }],
      label: 'flapping its wings and hovering',
    },
    feed: { state: 'careReaction', steps: [step('hungry', 300), step('careReaction', 700), step('happy', 520), step('idle', 260)], label: 'eating happily' },
    wash: {
      state: 'careReaction',
      steps: [step('needsCleaning', 260), step('careReaction', 520), step('happy', 600), step('idleReturn', 240)],
      motion: [{ at: 0, dx: 0 }, { at: 300, dx: -4 }, { at: 420, dx: 4 }, { at: 540, dx: -3 }, { at: 660, dx: 3 }, { at: 780, dx: 0 }, { at: 1620, dx: 0 }],
      label: 'shaking off the water',
    },
  },
  cat: {
    needsCleaning: cleaning('grooming, a little embarrassed', false),
    // A stretch into a paw-up beat: one lift, softer than the dragon's hover.
    happy: {
      state: 'happy',
      steps: [step('careReaction', 260), step('happy', 300), step('careReaction', 240), step('happy', 460), step('idle', 280)],
      motion: [{ at: 0, dy: 0 }, { at: 300, dy: -10 }, { at: 620, dy: -2 }, { at: 900, dy: -7 }, { at: 1260, dy: 0 }],
      label: 'stretching and waving a paw',
    },
    feed: { state: 'careReaction', steps: [step('hungry', 280), step('careReaction', 680), step('happy', 500), step('idle', 260)], label: 'eating happily' },
    wash: {
      state: 'careReaction',
      steps: [step('needsCleaning', 300), step('careReaction', 520), step('happy', 560), step('idleReturn', 240)],
      motion: [{ at: 0, dx: 0 }, { at: 340, dx: -3 }, { at: 460, dx: 3 }, { at: 580, dx: -2 }, { at: 700, dx: 2 }, { at: 820, dx: 0 }, { at: 1620, dx: 0 }],
      label: 'shaking off the water',
    },
  },
  wolf: {
    needsCleaning: cleaning('shaking out its fur', true),
    // Grounded: a quick bounce on the spot with a slight side-to-side drift.
    happy: {
      state: 'happy',
      steps: [step('happy', 140), step('careReaction', 140), step('happy', 140), step('careReaction', 140), step('happy', 140), step('careReaction', 140), step('happy', 420), step('idle', 260)],
      motion: [
        { at: 0, dy: 0, dx: 0 },
        { at: 200, dy: -7, dx: 2 },
        { at: 400, dy: 0, dx: 0 },
        { at: 600, dy: -7, dx: -2 },
        { at: 800, dy: 0, dx: 0 },
        { at: 1000, dy: -5, dx: 1 },
        { at: 1200, dy: 0, dx: 0 },
        { at: 1520, dy: 0, dx: 0 },
      ],
      label: 'bouncing on the spot',
    },
    feed: { state: 'careReaction', steps: [step('hungry', 300), step('careReaction', 660), step('happy', 520), step('idle', 260)], label: 'eating happily' },
    wash: {
      state: 'careReaction',
      steps: [step('needsCleaning', 260), step('careReaction', 500), step('happy', 620), step('idleReturn', 240)],
      motion: [{ at: 0, dx: 0 }, { at: 280, dx: -4 }, { at: 400, dx: 4 }, { at: 520, dx: -3 }, { at: 640, dx: 3 }, { at: 760, dx: 0 }, { at: 1620, dx: 0 }],
      label: 'shaking off the water',
    },
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

type Weighted = { clip: Clip; weight: number };

function weights(mood: Mood, petId: PetId): Weighted[] {
  const set = CLIPS[petId];
  switch (mood) {
    case 'unclean':
      return [
        { clip: set.needsCleaning, weight: 3 },
        { clip: BREATHE_SLOW, weight: 3 },
        { clip: BLINK, weight: 2 },
        { clip: REST, weight: 2 },
        { clip: SETTLE, weight: 1 },
      ];
    case 'hungry':
      return [
        { clip: HUNGRY, weight: 3 },
        { clip: BREATHE_SLOW, weight: 3 },
        { clip: BLINK, weight: 2 },
        { clip: SETTLE, weight: 1 },
        { clip: IDLE, weight: 1 },
      ];
    case 'sad':
      return [
        { clip: BREATHE_SLOW, weight: 4 },
        { clip: REST, weight: 3 },
        { clip: BLINK, weight: 2 },
        { clip: SETTLE, weight: 2 },
      ];
    case 'happy':
      return [
        { clip: set.happy, weight: 2 },
        { clip: BREATHE, weight: 3 },
        { clip: BLINK, weight: 2 },
        { clip: SETTLE, weight: 2 },
        { clip: IDLE, weight: 1 },
      ];
    case 'thriving':
      return [
        { clip: set.happy, weight: 3 },
        { clip: BREATHE, weight: 2 },
        { clip: BLINK, weight: 2 },
        { clip: SETTLE, weight: 2 },
      ];
    default: // balanced
      return [
        { clip: BREATHE, weight: 4 },
        { clip: BLINK, weight: 3 },
        { clip: SETTLE, weight: 2 },
        { clip: IDLE, weight: 2 },
        { clip: REST, weight: 1 },
      ];
  }
}

/**
 * The next clip to play. Never the same clip twice in a row unless it is the
 * only option, so the loop reads `breathe → blink → settle → breathe →
 * species action` rather than one repeated effect.
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

/** The pose to hold when motion is reduced — the mood still reads at a glance. */
export const REDUCED_FRAME: Record<Mood, CloseupFrame> = {
  unclean: 'needsCleaning',
  hungry: 'hungry',
  sad: 'idleReturn',
  balanced: 'idle',
  happy: 'happy',
  thriving: 'happy',
};

/** Where the clip is at `elapsed` ms: which frame, and its index. */
export function frameAt(clip: Clip, elapsed: number): { frame: CloseupFrame; index: number } {
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
