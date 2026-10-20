/**
 * The roaming companion and its first-login tour — the pure half.
 *
 * Mirrors the web's src/data/petCompanion.js (the mobile app is isolated, so this
 * is a copy on purpose, like petModel.ts). Everything here takes an injectable `rng`
 * and plain numbers, so it runs under `node --test` with no React Native.
 *
 * Cosmetic only. Nothing here touches points, quests or Supabase; the tour's
 * "done" flag lives on this phone, not in the research data.
 */

export type Rng = () => number;
export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

const pick = <T,>(list: readonly T[], rng: Rng = Math.random): T => list[Math.floor(rng() * list.length) % list.length];

/* ── Speech ── */

export const LEAVE_LINES = ["I'm going for a walk!", 'Back soon. Going to look around!', "I'll go see what's on your screen."] as const;
export const RETURN_LINES = ['Home sweet home.', 'That was fun!', "I'm back."] as const;
export const PAT_LINES = ["I'm here!", 'Hi!', 'Need a hand?', 'You can do it!'] as const;

export const leaveLine = (rng?: Rng) => pick(LEAVE_LINES, rng);
export const returnLine = (rng?: Rng) => pick(RETURN_LINES, rng);
export const patLine = (rng?: Rng) => pick(PAT_LINES, rng);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type Facts = { activeQuests?: number; streak?: number | null; hunger?: number; cleanliness?: number; happiness?: number };

/** What the pet says at a spot. Spots are marked in a screen with <PetSpot id="…">. */
export function lineForSpot(id: string, facts: Facts = {}): string {
  const { activeQuests = 0, streak = 0, hunger = 100, cleanliness = 100, happiness = 100 } = facts;
  switch (id) {
    case 'next-quest':
      return activeQuests > 0
        ? `You have ${plural(activeQuests, 'active quest', 'active quests')}. Start with an easy one?`
        : 'No quests yet. Add one in the Quests tab and I will cheer you on.';
    case 'care':
      if (hunger < 30) return "I'm hungry! Food costs 10 points.";
      if (cleanliness < 30) return 'I need a wash. It costs 10 points.';
      if (happiness < 30) return 'Can we play? It costs 10 points.';
      return 'Feed, wash or play with me. 10 points each.';
    case 'streak':
      return (streak ?? 0) > 0 ? `${streak}-day streak. Keep it going!` : 'Finish a quest today to start a streak.';
    default:
      return '';
  }
}

/* ── Choosing where to walk ── */

/**
 * Pick 1–2 spots for one walk from the ones on screen (in screen order), preferring
 * spots not visited recently. A phone screen has few spots, so walks are short.
 */
export function planWalk(present: string[], rng: Rng = Math.random, recent: string[] = []): string[] {
  const fresh = present.filter((id) => !recent.includes(id));
  const pool = fresh.length >= 1 ? fresh : present;
  const want = Math.min(pool.length, rng() < 0.5 ? 1 : 2);
  const chosen = new Set<string>();
  const bag = [...pool];
  while (chosen.size < want && bag.length) chosen.add(bag.splice(Math.floor(rng() * bag.length) % bag.length, 1)[0]);
  return present.filter((id) => chosen.has(id));
}

/** Milliseconds of calm before the pet decides to go for a walk by itself. */
export const nextWalkDelay = (rng: Rng = Math.random) => 40000 + Math.floor(rng() * 40000);

/* ── Movement ── */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Where the feet go to stand on top of an element: `frac` along its top edge, kept
 * inside the screen and below `topInset` (the status bar / safe area).
 */
export function standPoint(rect: Rect, vw: number, vh: number, petSize: number, frac = 0.5, topInset = 0): Point {
  const half = petSize / 2;
  return {
    x: clamp(rect.x + rect.w * frac, half + 4, vw - half - 4),
    y: clamp(rect.y, petSize + topInset + 8, vh - 8),
  };
}

/** Walking time for a straight line, at `speed` px per ms, never under 250 ms. */
export const walkMs = (from: Point, to: Point, speed: number) => Math.max(250, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / speed));

/* ── First-login tour ── */

export type GuideStep = {
  id: 'hello' | 'quests' | 'selfie' | 'care' | 'done';
  /** The PetSpot the small pet runs to and the screen lights up (null = no target). */
  spot: 'next-quest' | 'care' | null;
  hint?: string;
  line: string;
  /** Button label; null when the step has its own buttons (the practice window). */
  primary: string | null;
};

export const GUIDE_STEPS = (petName = 'your pet'): GuideStep[] => [
  { id: 'hello', spot: null, line: `Hi, I'm ${petName}! I'll show you around. Two minutes, tops.`, primary: 'Next' },
  {
    id: 'quests',
    spot: 'next-quest',
    hint: 'Your next quest',
    line: 'Every task is a quest. Add them in the Quests tab, and the next one to do shows up right here.',
    primary: 'Next',
  },
  {
    id: 'selfie',
    spot: null,
    line: "To get points, you show proof, like a photo of your work. Let's practice with a selfie. It is only practice, so nothing is sent.",
    primary: null,
  },
  {
    id: 'care',
    spot: 'care',
    hint: 'How I am doing',
    line: 'Points from finished quests buy me food, a wash and playtime. These rings show how I am doing.',
    primary: 'Next',
  },
  { id: 'done', spot: null, line: "That's it! Finish quests and I grow. See you out there!", primary: 'Start playing' },
];

/** Each pet speaks in its own colour. All pass 4.5:1 with white text. */
export const PET_ACCENT: Record<string, string> = { dragon: '#6C3CB4', cat: '#9A5B0C', wolf: '#3B6EA5' };
export const accentFor = (petId: string | null | undefined) => (petId && PET_ACCENT[petId]) || '#3F8580';

/* Keys: expo-secure-store allows only letters, digits, '.', '-' and '_' (no ':'). */
export const guideKey = (userId: string) => `pq_guide_done.${userId}`;
export const DND_KEY = 'pq_pet_dnd';
