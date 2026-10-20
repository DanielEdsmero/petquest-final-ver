// Relative, not '@/…': pure models are loaded by node --test (no Metro alias).
import { petIdOf, type PetId } from './petModel.ts';

/**
 * Pet homes — the pure half. Which environment each companion lives in, its
 * palette, and how the three care stats are described. The image `require`s
 * live in petHomes.ts because Metro cannot follow a computed require and Node
 * cannot run one at all.
 *
 * The mapping is data, not a conditional in a component: adding a fourth
 * companion is one row here plus one file under assets/homes/.
 */

export type HomeId = 'sunlit_meadow' | 'moonlit_cottage' | 'ember_cavern' | 'crystal_cavern';

export type PetHome = {
  id: HomeId;
  displayName: string;
  /** The file under assets/homes/. Kept as data so a test can check it exists. */
  file: `${HomeId}.png`;
  palette: {
    /** Behind the hero card, tinted so the card blends into the page. */
    background: string;
    /** Rings, the level bar and the home's name. */
    accent: string;
    /** Text/overlay surface on top of the image. */
    surface: string;
  };
  /** The care action this environment makes obvious (a rest area, a pool…). */
  preferredAction?: 'feed' | 'wash' | 'play';
  blurb: string;
};

export const PET_HOMES: Record<HomeId, PetHome> = {
  sunlit_meadow: {
    id: 'sunlit_meadow',
    displayName: 'Sunlit Meadow',
    file: 'sunlit_meadow.png',
    palette: { background: '#EEF3DF', accent: '#6F9F4A', surface: 'rgba(250,248,240,0.86)' },
    preferredAction: 'play',
    blurb: 'A cottage porch, a garden and a water trough in the open air.',
  },
  moonlit_cottage: {
    id: 'moonlit_cottage',
    displayName: 'Moonlit Cottage',
    file: 'moonlit_cottage.png',
    palette: { background: '#E9E4F3', accent: '#7C6FB8', surface: 'rgba(250,248,240,0.86)' },
    preferredAction: 'feed',
    blurb: 'A quiet bedroom with a fireplace, books and a round bed.',
  },
  ember_cavern: {
    id: 'ember_cavern',
    displayName: 'Ember Cavern',
    file: 'ember_cavern.png',
    palette: { background: '#F1E6DC', accent: '#C9772E', surface: 'rgba(250,248,240,0.88)' },
    preferredAction: 'wash',
    blurb: 'Warm rock, teal crystals and a horned nest beside a cool pool.',
  },
  crystal_cavern: {
    id: 'crystal_cavern',
    displayName: 'Crystal Cavern',
    file: 'crystal_cavern.png',
    palette: { background: '#E4EDF7', accent: '#5D8FC6', surface: 'rgba(250,248,240,0.86)' },
    preferredAction: 'wash',
    blurb: 'Aqua pools, pale crystals and a washing basin.',
  },
};

/** Companion → home. The fallback is deliberately NOT a companion's home. */
export const HOME_FOR_PET: Record<PetId, HomeId> = {
  wolf: 'crystal_cavern', // icy silver-blue fur and teal glow, so cool blues, not the warm meadow
  cat: 'moonlit_cottage',
  dragon: 'ember_cavern',
};

export const FALLBACK_HOME: HomeId = 'sunlit_meadow';

/**
 * Resolve a stored `selected_pet_id` (either form — `dragon` or
 * `arcane_dragon`) to its home. Unknown, null and not-yet-hatched all land on
 * the fallback so the hero never shows a broken image.
 */
export function homeFor(selectedPetId: string | null | undefined): PetHome {
  const pet = petIdOf(selectedPetId);
  const id = pet ? HOME_FOR_PET[pet] : FALLBACK_HOME;
  return PET_HOMES[id] ?? PET_HOMES[FALLBACK_HOME];
}

/* ── Care stats as the rings describe them ── */

export type StatKey = 'hunger' | 'cleanliness' | 'happiness';

export const STAT_META: {
  key: StatKey;
  label: string;
  action: 'feed' | 'wash' | 'play';
  actionLabel: string;
  /** Rings: warm gold for hunger, aqua for cleanliness, coral for happiness. */
  color: string;
}[] = [
  { key: 'hunger', label: 'Hunger', action: 'feed', actionLabel: 'Feed', color: '#D99A2B' },
  { key: 'cleanliness', label: 'Cleanliness', action: 'wash', actionLabel: 'Wash', color: '#3F8580' },
  { key: 'happiness', label: 'Happiness', action: 'play', actionLabel: 'Play', color: '#E58A73' },
];

/** Neutral wording for the state under a ring. Never a shame word. */
export function statState(value: number | null | undefined): { label: string; low: boolean } {
  if (value == null) return { label: 'Not loaded', low: false };
  if (value < 35) return { label: 'Needs attention', low: true };
  if (value < 70) return { label: 'Okay', low: false };
  return { label: 'Good', low: false };
}

/** Clamp a server value onto the ring's 0–1 scale; null stays null (an empty ring, not 0). */
export function ringFraction(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value / 100));
}
