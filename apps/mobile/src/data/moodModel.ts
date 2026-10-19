// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import type { CareStats } from './careModel.ts';
import type { PetId } from './petModel.ts';
import type { FrameKey } from './spriteModel.ts';

/**
 * Presentation state — how the companion LOOKS given the server's stats.
 *
 * Pure. The inputs are the `pet_stats` row (or the `care_pet()` reply); the
 * outputs are a mood, a sprite frame, a short line of dialogue and the
 * species-specific flourish. Nothing here feeds back into the stats: the pet
 * cannot cheer itself up, and a message never claims a point was awarded or
 * an action succeeded unless the caller passes a server-confirmed event.
 *
 * Thresholds carry hysteresis and a cooldown so a value hovering at 34/35
 * does not flip the pet between moods on every refresh.
 */

export type Mood = 'unclean' | 'hungry' | 'sad' | 'balanced' | 'happy' | 'thriving';

export const THRESHOLDS = {
  /** Below this a stat is "low" (matches statState's "Needs attention"). */
  low: 35,
  /** At or above this a stat is "high". */
  high: 80,
  /** A mood only flips back once the value has moved this far past the line. */
  hysteresis: 5,
  /** Minimum time between mood changes. */
  cooldownMs: 20_000,
  /** Minimum time between two dialogue lines. */
  messageCooldownMs: 45_000,
} as const;

/**
 * The raw mood for a set of stats, in the fixed priority the brief sets:
 *
 *   needsCleaning → hungry → lowHappiness → balanced → happy
 *
 * so when two stats are low the answer is deterministic and never depends on
 * which one is lower.
 */
export function rawMood(stats: CareStats | null): Mood {
  if (!stats) return 'balanced';
  const { hunger, cleanliness, happiness } = stats;
  if (cleanliness < THRESHOLDS.low) return 'unclean';
  if (hunger < THRESHOLDS.low) return 'hungry';
  if (happiness < THRESHOLDS.low) return 'sad';
  if (hunger >= THRESHOLDS.high && cleanliness >= THRESHOLDS.high && happiness >= THRESHOLDS.high) return 'thriving';
  if (happiness >= THRESHOLDS.high) return 'happy';
  return 'balanced';
}

export type MoodState = { mood: Mood; since: number };

/**
 * Resolve the mood to show, given the previous one. A change is accepted when
 * (a) the cooldown has elapsed, or (b) the stats changed enough that the old
 * mood is clearly wrong (a care action just landed) — measured as the new raw
 * mood still holding once the thresholds are widened by the hysteresis band.
 */
export function resolveMood(prev: MoodState | null, stats: CareStats | null, now: number): MoodState {
  const next = rawMood(stats);
  if (!prev) return { mood: next, since: now };
  if (next === prev.mood) return prev;
  const cooled = now - prev.since >= THRESHOLDS.cooldownMs;
  if (cooled || clearlyChanged(prev.mood, stats)) return { mood: next, since: now };
  return prev;
}

/** Would the old mood still be chosen with the thresholds pushed `hysteresis` in its favour? */
function clearlyChanged(prevMood: Mood, stats: CareStats | null): boolean {
  if (!stats) return prevMood !== 'balanced';
  const h = THRESHOLDS.hysteresis;
  const { hunger, cleanliness, happiness } = stats;
  switch (prevMood) {
    case 'unclean':
      return cleanliness >= THRESHOLDS.low + h;
    case 'hungry':
      return hunger >= THRESHOLDS.low + h;
    case 'sad':
      return happiness >= THRESHOLDS.low + h;
    case 'thriving':
      return hunger < THRESHOLDS.high - h || cleanliness < THRESHOLDS.high - h || happiness < THRESHOLDS.high - h;
    case 'happy':
      return happiness < THRESHOLDS.high - h || rawMood(stats) === 'thriving';
    default: // balanced
      return rawMood(stats) !== 'balanced' && (isLow(stats) || happiness >= THRESHOLDS.high + h);
  }
}

const isLow = (s: CareStats) => s.hunger < THRESHOLDS.low - THRESHOLDS.hysteresis || s.cleanliness < THRESHOLDS.low - THRESHOLDS.hysteresis || s.happiness < THRESHOLDS.low - THRESHOLDS.hysteresis;

/* ── Expression ── */

/**
 * Which sheet frame stands for a mood. The sheets carry idle, blink (eyes
 * closed, content), happy and one "interact" pose; there is no dedicated
 * worried or dusty face, so those moods use the idle frame and let the
 * overlay cue (dust, a glance) carry the meaning — never a distorted portrait.
 */
export const MOOD_FRAME: Record<Mood, FrameKey> = {
  unclean: 'idle',
  hungry: 'idle',
  sad: 'idle',
  balanced: 'idle',
  happy: 'happy',
  thriving: 'happy',
};

export type Cue = 'dust' | 'glance' | 'droop' | 'sparkle' | null;

export const MOOD_CUE: Record<Mood, Cue> = {
  unclean: 'dust',
  hungry: 'glance',
  sad: 'droop',
  balanced: null,
  happy: 'sparkle',
  thriving: 'sparkle',
};

export const MOOD_LABEL: Record<Mood, string> = {
  unclean: 'Needs a bath',
  hungry: 'Hungry',
  sad: 'Feeling low',
  balanced: 'Content',
  happy: 'Happy',
  thriving: 'Thriving',
};

/* ── Behaviour tuning for the walker ── */

export type Behaviour = {
  /** Multiplier on idle durations (sad pets linger; happy pets do not). */
  idleScale: number;
  /** Chance (0–1) that an idle turns into a rest at the bed/nest. */
  restChance: number;
  /** Chance that an idle turns into the species flourish. */
  celebrateChance: number;
  /** Chance that the next destination is the food point when one exists. */
  foodBias: number;
  /** Whether ordinary walks happen at all. */
  walks: boolean;
};

export const BEHAVIOUR: Record<Mood, Behaviour> = {
  unclean: { idleScale: 1.4, restChance: 0.55, celebrateChance: 0, foodBias: 0, walks: true },
  hungry: { idleScale: 1.0, restChance: 0.15, celebrateChance: 0, foodBias: 0.8, walks: true },
  sad: { idleScale: 1.8, restChance: 0.4, celebrateChance: 0, foodBias: 0, walks: true },
  balanced: { idleScale: 1.0, restChance: 0.2, celebrateChance: 0, foodBias: 0, walks: true },
  happy: { idleScale: 0.8, restChance: 0.1, celebrateChance: 0.3, foodBias: 0, walks: true },
  thriving: { idleScale: 0.8, restChance: 0.1, celebrateChance: 0.45, foodBias: 0, walks: true },
};

/* ── Species flourish ── */

export type Flourish = {
  key: string;
  label: string;
  /** Hops as [heightPx, upMs] pairs, played in order. */
  hops: [number, number][];
  /** Hold at the top of the LAST hop (a hover) before coming down. */
  hoverMs: number;
  /** Frame while airborne. */
  frame: FrameKey;
};

export const FLOURISH: Record<PetId, Flourish> = {
  dragon: { key: 'hover', label: 'flaps its wings and hovers', hops: [[10, 220], [22, 320]], hoverMs: 500, frame: 'happy' },
  cat: { key: 'stretch', label: 'jumps and stretches', hops: [[18, 260]], hoverMs: 0, frame: 'interact' },
  wolf: { key: 'bounce', label: 'bounces and wags its tail', hops: [[12, 180], [12, 180], [16, 220]], hoverMs: 0, frame: 'happy' },
};

/* ── Dialogue ── */

export type Line = { mood: Mood | 'verified' | 'greet' | 'resting'; text: string; pet?: PetId };

/** Short, original, never a claim about points or approval. */
export const LINES: Line[] = [
  { mood: 'unclean', text: 'Could I have a wash?' },
  { mood: 'unclean', text: 'I’m feeling a little dusty.' },
  { mood: 'unclean', text: 'My scales feel gritty.', pet: 'dragon' },
  { mood: 'unclean', text: 'My fur is all tangled.', pet: 'cat' },
  { mood: 'hungry', text: 'My tummy is rumbling.' },
  { mood: 'hungry', text: 'A snack would be lovely.' },
  { mood: 'hungry', text: 'Is that the food basin?', pet: 'dragon' },
  { mood: 'sad', text: 'Can we spend time together?' },
  { mood: 'sad', text: 'I could use some playtime.' },
  { mood: 'sad', text: 'I miss chasing wisps with you.', pet: 'wolf' },
  { mood: 'balanced', text: 'It’s a peaceful day.' },
  { mood: 'balanced', text: 'I’m comfortable here.' },
  { mood: 'balanced', text: 'The fire is nice and warm.', pet: 'cat' },
  { mood: 'happy', text: 'This is the best day!' },
  { mood: 'happy', text: 'I love spending time with you!' },
  { mood: 'thriving', text: 'I feel amazing!' },
  { mood: 'thriving', text: 'Nothing could be better than this.' },
  { mood: 'resting', text: 'I’m having a little rest.' },
  { mood: 'resting', text: 'Just resting my eyes.' },
  { mood: 'verified', text: 'You did it! I’m proud of you.' },
  { mood: 'greet', text: 'Hello again!' },
];

export type Rng = () => number;

/** Lines that fit a mood for a species, species-specific ones first. */
export function linesFor(mood: Line['mood'], pet: PetId | null): string[] {
  const fit = LINES.filter((l) => l.mood === mood && (!l.pet || l.pet === pet));
  return [...fit.filter((l) => l.pet), ...fit.filter((l) => !l.pet)].map((l) => l.text);
}

export type Dialogue = { text: string; at: number } | null;

/**
 * Pick the next line to show, honouring the message cooldown and never
 * repeating the line that is already up. Returns the previous dialogue
 * unchanged when nothing should change — so a re-render or a focus event
 * cannot spam the bubble.
 */
export function nextDialogue(prev: Dialogue, mood: Line['mood'], pet: PetId | null, now: number, rng: Rng, force = false): Dialogue {
  if (prev && !force && now - prev.at < THRESHOLDS.messageCooldownMs) return prev;
  const options = linesFor(mood, pet).filter((t) => t !== prev?.text);
  if (options.length === 0) return prev;
  const text = options[Math.floor(rng() * options.length)] ?? options[0];
  return { text, at: now };
}
