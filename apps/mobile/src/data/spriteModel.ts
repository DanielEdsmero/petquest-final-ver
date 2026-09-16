// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import { BEHAVIOUR, FLOURISH, type Mood } from './moodModel.ts';
import { type HomeId } from './petHomeModel.ts';
import type { PetId } from './petModel.ts';

/**
 * The walking baby sprite — the pure half.
 *
 * A small state machine plus the numbers that drive it: which frame shows in
 * which state, how fast the frames cycle, how fast the pet walks, where it
 * may walk in each home and where the home's points of interest are. The
 * component (components/PetSprite.tsx) owns the timers and the position
 * animation; everything decided here is decided with an injectable `rng` so
 * tests are deterministic.
 *
 * Cosmetic only. Nothing here knows about points, stats, quests or Supabase.
 */

/* ── Frames ── */

export const FRAME_KEYS = [
  'idle',
  'blink',
  'walkLeftA',
  'walkLeftB',
  'walkRightA',
  'walkRightB',
  'happy',
  'interact',
] as const;
export type FrameKey = (typeof FRAME_KEYS)[number];

/** File name on disk for each frame, in sheet order. */
export const FRAME_FILES: Record<FrameKey, string> = {
  idle: 'f1_idle.png',
  blink: 'f2_blink.png',
  walkLeftA: 'f3_walk_left_a.png',
  walkLeftB: 'f4_walk_left_b.png',
  walkRightA: 'f5_walk_right_a.png',
  walkRightB: 'f6_walk_right_b.png',
  happy: 'f7_happy.png',
  interact: 'f8_interact.png',
};

export const FRAME_SIZE = 128;
/** Walk frames alternate at this rate (the brief asks for 8–12). */
export const WALK_FPS = 10;
/** Idle is far slower: one tick every 500 ms is plenty for a breath. */
export const IDLE_FPS = 2;

/* ── States ── */

export type SpriteState = 'idle' | 'blink' | 'pause' | 'walkLeft' | 'walkRight' | 'happy' | 'interact' | 'rest' | 'celebrate';

export type Point = { x: number; y: number }; // normalised 0–1 within the scene

/** Where the pet may stand, as fractions of the scene. y is the FEET line. */
export type WalkArea = { xMin: number; xMax: number; yMin: number; yMax: number };

export type Interaction = {
  key: string;
  label: string;
  at: Point;
  /** What the spot is for; drives resting and hunger. */
  role?: 'rest' | 'food';
};

/**
 * Per-home walkable strip and points of interest. The strip is the bottom
 * third of the scene (the "clearing" every home has), inset from the edges so
 * the sprite never clips, and the points sit on props that exist in the
 * placeholder art and the concept paintings alike.
 */
export const HOME_LAYOUT: Record<HomeId, { area: WalkArea; interactions: Interaction[] }> = {
  sunlit_meadow: {
    area: { xMin: 0.12, xMax: 0.88, yMin: 0.66, yMax: 0.9 },
    interactions: [
      { key: 'flower', label: 'sniffs a flower', at: { x: 0.2, y: 0.86 } },
      { key: 'trough', label: 'visits the water trough', at: { x: 0.8, y: 0.68 }, role: 'food' },
      { key: 'bed', label: 'curls up on its bed', at: { x: 0.36, y: 0.84 }, role: 'rest' },
      { key: 'ball', label: 'nudges the ball', at: { x: 0.6, y: 0.88 } },
    ],
  },
  moonlit_cottage: {
    area: { xMin: 0.14, xMax: 0.86, yMin: 0.64, yMax: 0.9 },
    interactions: [
      { key: 'mirror', label: 'grooms by the mirror', at: { x: 0.82, y: 0.78 } },
      { key: 'bed', label: 'curls up on the bed', at: { x: 0.5, y: 0.66 }, role: 'rest' },
      { key: 'bowl', label: 'looks at the bowls', at: { x: 0.2, y: 0.78 }, role: 'food' },
      { key: 'fireplace', label: 'looks at the fire', at: { x: 0.76, y: 0.66 } },
    ],
  },
  ember_cavern: {
    area: { xMin: 0.14, xMax: 0.86, yMin: 0.66, yMax: 0.9 },
    interactions: [
      { key: 'basin', label: 'checks the food basin', at: { x: 0.2, y: 0.8 }, role: 'food' },
      { key: 'crystal', label: 'looks at a crystal', at: { x: 0.84, y: 0.7 } },
      { key: 'nest', label: 'curls up near the nest', at: { x: 0.74, y: 0.66 }, role: 'rest' },
    ],
  },
  crystal_cavern: {
    area: { xMin: 0.2, xMax: 0.8, yMin: 0.62, yMax: 0.84 },
    interactions: [
      { key: 'bubble', label: 'follows a bubble', at: { x: 0.3, y: 0.7 } },
      { key: 'shellbed', label: 'rests in the shell bed', at: { x: 0.24, y: 0.64 }, role: 'rest' },
      { key: 'crystal', label: 'examines a crystal', at: { x: 0.76, y: 0.74 } },
      { key: 'splash', label: 'makes a small splash', at: { x: 0.24, y: 0.84 } },
    ],
  },
};

/* ── Timing ── */

/** Scene widths per second — a calm stroll: the full width takes ~7 s. */
export const WALK_SPEED = 0.14;
export const TIMING = {
  idleMs: [2200, 5200] as const,
  pauseMs: [700, 2200] as const,
  blinkMs: 260,
  happyMs: 1100,
  interactMs: 1600,
  restMs: [4000, 8000] as const,
  celebrateMs: 1400,
  /** Only walks this far or further, so a walk is always visibly a walk. */
  minWalk: 0.12,
};

export type Rng = () => number; // [0, 1)

const between = (rng: Rng, [a, b]: readonly [number, number]) => a + rng() * (b - a);

export const clampPoint = (p: Point, area: WalkArea): Point => ({
  x: Math.min(area.xMax, Math.max(area.xMin, p.x)),
  y: Math.min(area.yMax, Math.max(area.yMin, p.y)),
});

export const inside = (p: Point, area: WalkArea) =>
  p.x >= area.xMin && p.x <= area.xMax && p.y >= area.yMin && p.y <= area.yMax;

/** Walking time for a horizontal move, from distance — never a fixed hop. */
export const walkDurationMs = (from: Point, to: Point) => Math.max(400, Math.round((Math.abs(to.x - from.x) / WALK_SPEED) * 1000));

export const directionFor = (from: Point, to: Point): 'walkLeft' | 'walkRight' => (to.x < from.x ? 'walkLeft' : 'walkRight');

/** The frame to show for a state at a given tick (ticks advance at the state's cadence). */
export function frameFor(state: SpriteState, tick: number, petId: PetId | null = null): FrameKey {
  switch (state) {
    case 'rest':
      return 'interact'; // the sheets' fourth pose: curled / grooming / nose down
    case 'celebrate':
      return petId ? FLOURISH[petId].frame : 'happy';
    case 'blink':
      return 'blink';
    case 'walkLeft':
      return tick % 2 === 0 ? 'walkLeftA' : 'walkLeftB';
    case 'walkRight':
      return tick % 2 === 0 ? 'walkRightA' : 'walkRightB';
    case 'happy':
      return 'happy';
    case 'interact':
      return 'interact';
    default:
      return 'idle';
  }
}

export const fpsFor = (state: SpriteState) => (state === 'walkLeft' || state === 'walkRight' ? WALK_FPS : IDLE_FPS);

export const pointWithRole = (home: HomeId, role: 'rest' | 'food'): Interaction | undefined =>
  HOME_LAYOUT[home].interactions.find((i) => i.role === role);

/** How the walker should behave: the mood and the species. Both optional. */
export type MoodContext = { mood?: Mood; petId?: PetId | null };

/* ── The machine ── */

export type Step = {
  state: SpriteState;
  /** How long to stay in it. */
  durationMs: number;
  /** Where to be at the end (only differs from `from` when walking). */
  to: Point;
  /** Set when the destination is a point of interest; the arrival may `interact`. */
  interaction?: Interaction;
  /** The interaction to perform on arrival, decided when the walk was chosen. */
  pendingInteraction?: Interaction;
};

export type Machine = {
  state: SpriteState;
  at: Point;
  pendingInteraction?: Interaction;
};

/**
 * Pick where to go next: a point of interest about half the time, otherwise
 * a random spot in the strip. Always at least `minWalk` away, always inside
 * the area, so the walk is visible and never clips.
 */
export function chooseDestination(from: Point, home: HomeId, rng: Rng, foodBias = 0): { to: Point; interaction?: Interaction } {
  const { area, interactions } = HOME_LAYOUT[home];
  const food = pointWithRole(home, 'food');
  for (let attempt = 0; attempt < 8; attempt++) {
    // A hungry pet drifts to the food spot; otherwise a point of interest about half the time.
    const wantFood = food && foodBias > 0 && rng() < foodBias;
    const usePoi = !wantFood && interactions.length > 0 && rng() < 0.5;
    const poi = wantFood ? food : usePoi ? interactions[Math.floor(rng() * interactions.length)] : undefined;
    const raw: Point = poi ? poi.at : { x: between(rng, [area.xMin, area.xMax]), y: between(rng, [area.yMin, area.yMax]) };
    const to = clampPoint(raw, area);
    if (Math.abs(to.x - from.x) >= TIMING.minWalk) return { to, interaction: poi };
  }
  // Nowhere far enough was rolled — go to whichever edge is further.
  const toEdge: Point = { x: from.x - area.xMin > area.xMax - from.x ? area.xMin : area.xMax, y: from.y };
  return { to: clampPoint(toEdge, area) };
}

/**
 * The next step from the current state. Pure: same machine + same rng
 * sequence → same step. `ctx.mood` (from moodModel) bends the odds — a sad
 * pet lingers, a hungry one drifts to the food spot, a happy one flourishes,
 * an unclean one rests more — but never changes what is possible.
 *
 *   idle → blink (30 %) | celebrate | rest (walking to the bed first) | pause
 *   blink → idle
 *   pause → walkLeft | walkRight  (destination chosen here; hunger biases it)
 *   walk* → rest (at the bed) | interact (at a point of interest) | idle
 *   happy / interact / rest / celebrate → idle
 */
export function nextStep(m: Machine, home: HomeId, rng: Rng, reduceMotion = false, ctx: MoodContext = {}): Step {
  const mood = ctx.mood ?? 'balanced';
  const b = BEHAVIOUR[mood];
  const stay = (state: SpriteState, durationMs: number): Step => ({ state, durationMs, to: m.at });
  const idleFor = () => between(rng, TIMING.idleMs) * b.idleScale;
  switch (m.state) {
    case 'idle': {
      if (rng() < 0.3) return stay('blink', TIMING.blinkMs);
      // Reduce Motion: no walking at all — the pet stands, breathes and blinks.
      if (reduceMotion) return stay('idle', idleFor());
      // A flourish happens in place, from idle, and only for a happy pet.
      if (b.celebrateChance > 0 && ctx.petId && rng() < b.celebrateChance) return stay('celebrate', TIMING.celebrateMs);
      // Resting: walk to the bed/nest if there is one and we are not already on it.
      const bed = pointWithRole(home, 'rest');
      if (bed && rng() < b.restChance) {
        if (Math.abs(bed.at.x - m.at.x) < TIMING.minWalk) return { ...stay('rest', between(rng, TIMING.restMs)), interaction: bed };
        return { state: directionFor(m.at, bed.at), durationMs: walkDurationMs(m.at, bed.at), to: bed.at, pendingInteraction: bed };
      }
      if (!b.walks) return stay('idle', idleFor());
      return stay('pause', between(rng, TIMING.pauseMs));
    }
    case 'blink':
      return stay('idle', idleFor());
    case 'pause': {
      const { to, interaction } = chooseDestination(m.at, home, rng, b.foodBias);
      return { state: directionFor(m.at, to), durationMs: walkDurationMs(m.at, to), to, pendingInteraction: interaction };
    }
    case 'walkLeft':
    case 'walkRight': {
      const poi = m.pendingInteraction;
      // Arrived at the bed: rest. Arrived at food while hungry: look at it. Otherwise 70 % interact.
      if (poi?.role === 'rest') return { ...stay('rest', between(rng, TIMING.restMs)), interaction: poi };
      if (poi && (poi.role === 'food' && mood === 'hungry' ? true : rng() < 0.7)) {
        return { ...stay('interact', TIMING.interactMs), interaction: poi };
      }
      return stay('idle', idleFor());
    }
    default: // happy, interact, rest, celebrate
      return stay('idle', idleFor());
  }
}

/** Apply a step: where the machine is once the step has run. */
export const applyStep = (m: Machine, s: Step): Machine => ({
  state: s.state,
  at: s.to,
  pendingInteraction: s.state === 'walkLeft' || s.state === 'walkRight' ? s.pendingInteraction : undefined,
});

/** The flourish to play for a species, for the component. */
export const flourishFor = (petId: PetId | null | undefined) => (petId ? FLOURISH[petId] : null);

/** Starting point: centre of the strip. */
export const startPoint = (home: HomeId): Point => {
  const a = HOME_LAYOUT[home].area;
  return { x: (a.xMin + a.xMax) / 2, y: (a.yMin + a.yMax) / 2 };
};

/** Reactions to things the participant did. Cosmetic, and only after the server said yes. */
export type Reaction = 'tap' | 'feed' | 'wash' | 'play';

export const reactionStep = (r: Reaction, at: Point): Step =>
  r === 'wash' || r === 'feed' ? { state: 'interact', durationMs: TIMING.interactMs, to: at } : { state: 'happy', durationMs: TIMING.happyMs, to: at };

export const REACTION_TEXT: Record<Reaction, string> = {
  tap: "I'm here!",
  feed: 'Yum!',
  wash: 'So fresh!',
  play: 'Again!',
};

/** A tiny deterministic generator for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
