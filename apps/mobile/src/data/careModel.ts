/**
 * Care actions — the pure half (Phase 8).
 *
 * The numbers are the server's (`care_pet()` in
 * supabase/supabase-phase13-spend-points.sql): 10 points, +30 on the stat,
 * capped at 100. They are repeated here ONLY for the pre-check that gives an
 * instant "not enough points" message and for the labels; the server
 * re-checks atomically and its answer is the one shown.
 */

export type CareAction = 'feed' | 'wash' | 'play';

export const CARE_COST = 10;
export const CARE_BOOST = 30;

export const CARE_ACTIONS: {
  key: CareAction;
  label: string;
  emoji: string;
  stat: 'hunger' | 'cleanliness' | 'happiness';
  /** Success toast — same words the web shows. `{name}` is the pet's name. */
  success: string;
}[] = [
  { key: 'feed', label: 'Feed', emoji: '🍖', stat: 'hunger', success: '{name} loved the meal! 🍖' },
  { key: 'wash', label: 'Wash', emoji: '🛁', stat: 'cleanliness', success: '{name} is sparkling clean! 🛁' },
  { key: 'play', label: 'Play', emoji: '🎉', stat: 'happiness', success: '{name} is overjoyed! 🎉' },
];

export type CareStats = { hunger: number; cleanliness: number; happiness: number };

/** The shape `care_pet()` returns. */
export type CareResult =
  | { ok: true; action: CareAction; cost: number; points: number; stats: CareStats }
  | { ok: false; error: string; points?: number };

/** Can the client even try? `null` balance means "not loaded" — let the server decide. */
export const canAfford = (points: number | null | undefined): boolean => points == null || points >= CARE_COST;

export function careErrorMessage(error: string | null | undefined): string {
  switch (error) {
    case 'insufficient_points':
      return `Not enough points! Need ${CARE_COST} 💸`;
    case 'no_pet':
      return 'Hatch your companion on the PetQuest website first.';
    case 'unauthenticated':
      return 'Your session expired — please sign in again.';
    case 'network':
      return 'Cannot reach the server. Check your connection and try again.';
    default:
      return 'Could not care for your pet — please try again.';
  }
}

export const careSuccessMessage = (action: CareAction, petName: string | null | undefined): string =>
  (CARE_ACTIONS.find((a) => a.key === action)?.success ?? 'Done!').replace('{name}', petName ?? 'Your companion');

/** What the stats will be once the server confirms; only used for the optimistic bar. */
export function previewStats(stats: CareStats, action: CareAction): CareStats {
  const stat = CARE_ACTIONS.find((a) => a.key === action)!.stat;
  return { ...stats, [stat]: Math.min(100, stats[stat] + CARE_BOOST) };
}
