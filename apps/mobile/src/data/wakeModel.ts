// Relative, not '@/…': the pure models are loaded by node --test, which has no
// Metro alias. Everything under src/data that a test imports must stay this way.
import { PET_CATALOG, petIdOf, type PetId } from './petModel.ts';

/**
 * The account-loading wake-up sequence — the mobile port of the wake section of
 * `src/config/pets.js` on the web.
 *
 * COPIED ON PURPOSE (see MOBILE_MIGRATION_MAP.md §8). A parity test reads the
 * web file and compares phases, timings, messages and the reveal rule, so the
 * two clients cannot drift apart silently.
 *
 * Pure — no React Native, no asset requires — so it is unit-testable under
 * `node --test`. The frame table lives in wakeSprites.ts.
 *
 * The sequence is a loading BUFFER a participant is meant to notice, not a
 * spinner: four drawn poses, each held long enough to read, then the awake
 * pose holds until the account data has arrived. It never blocks a request —
 * the caller starts auth and data fetching first and reports readiness — and
 * an always-visible Skip drops the duration requirement on demand.
 */

export type WakePhase = 'sleeping' | 'waking' | 'personalityAction' | 'awake';
export type WakeTerminalPhase = 'waitingForAccount' | 'skipped' | 'error';
export type WakeState = WakePhase | WakeTerminalPhase;

export const WAKE_PHASES: WakePhase[] = ['sleeping', 'waking', 'personalityAction', 'awake'];
export const WAKE_TERMINAL_PHASES: WakeTerminalPhase[] = ['waitingForAccount', 'skipped', 'error'];

/** Per-species action frame suffix and the line shown while waking. */
export const WAKE_PETS: Record<PetId, { action: string; waking: string }> = {
  dragon: { action: 'spark', waking: 'Waking your Dragon…' },
  cat: { action: 'stretch', waking: 'The Mystic Cat is stretching awake…' },
  wolf: { action: 'listen', waking: 'The Spirit Wolf is listening…' },
};

/** Lines that read the same whichever companion is on screen. */
export const WAKE_PHASE_MESSAGES: Partial<Record<WakeState, string>> = {
  sleeping: 'Your pet is resting…',
  personalityAction: 'Getting ready for your quests…',
  awake: 'Finishing your setup…',
  waitingForAccount: 'Finishing your setup…',
  skipped: 'Finishing your setup…',
};

export const WAKE_FALLBACK_MESSAGE = 'Preparing your adventure…';

/** How long each pose holds, in ms. Deliberately slow — see the header. */
export const WAKE_TIMINGS: Record<WakePhase, number> = {
  sleeping: 1200,
  waking: 900,
  personalityAction: 1200,
  awake: 900,
};

/** Minimum time the loader is shown before the account may be revealed. */
export const MIN_MASCOT_LOADER_MS = WAKE_PHASES.reduce((t, p) => t + WAKE_TIMINGS[p], 0); // 4200

/** Start offset of each phase, in ms. */
export function wakePhaseStarts(): Record<WakePhase, number> {
  const out = {} as Record<WakePhase, number>;
  let t = 0;
  for (const phase of WAKE_PHASES) {
    out[phase] = t;
    t += WAKE_TIMINGS[phase];
  }
  return out;
}

/** Which phase the sequence is in `ms` after it started. */
export function wakePhaseAt(ms: number): WakePhase {
  const t = Number(ms) || 0;
  let acc = 0;
  for (const phase of WAKE_PHASES) {
    acc += WAKE_TIMINGS[phase];
    if (t < acc) return phase;
  }
  return 'awake';
}

/** Which frame (0–3) a state shows. Every terminal state holds the awake frame. */
export function wakeFrameForPhase(state: WakeState): number {
  const i = WAKE_PHASES.indexOf(state as WakePhase);
  return i === -1 ? WAKE_PHASES.length - 1 : i;
}

/**
 * The reveal rule, in one place so it can be reasoned about and tested.
 * Reveal once the data is ready AND (the minimum played OR the participant
 * skipped). An error never reveals — the caller swaps in its own error state.
 */
export function shouldRevealAccount({
  accountDataReady,
  minimumDone,
  skipped,
  error,
}: {
  accountDataReady?: boolean;
  minimumDone?: boolean;
  skipped?: boolean;
  error?: boolean;
}): boolean {
  if (error) return false;
  return !!accountDataReady && (!!minimumDone || !!skipped);
}

/**
 * The caption for a state. Only `waking` is species-specific; `known` false
 * (the companion is a random stand-in) falls back to the neutral line rather
 * than claiming a pet the participant may not own.
 */
export function wakeMessageFor(petType: string | null | undefined, state: WakeState = 'waking', known = true): string {
  const fixed = WAKE_PHASE_MESSAGES[state];
  if (fixed) return fixed;
  const id = petIdOf(petType);
  if (!id || !known) return WAKE_FALLBACK_MESSAGE;
  return WAKE_PETS[id].waking;
}

/**
 * Which companion a loading instance should show: the participant's real pet
 * when known, otherwise a random one picked ONCE per instance (the component
 * locks it for the whole run).
 */
export function resolveWakePet(petType: string | null | undefined, rand: () => number = Math.random): { id: PetId; random: boolean } {
  const known = petIdOf(petType);
  if (known) return { id: known, random: false };
  const ids = Object.keys(PET_CATALOG) as PetId[];
  return { id: ids[Math.floor(rand() * ids.length) % ids.length], random: true };
}
