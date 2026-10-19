import type { ImageSourcePropType } from 'react-native';

import { PET_CATALOG, stageForLevel, petIdOf, type AssetType, type StageKey } from '@/data/petModel';

/**
 * The evolution sprite table.
 *
 * Separate from petModel.ts because Metro cannot resolve a computed `require`,
 * so the table has to be written out literally — and a literal asset `require`
 * cannot run outside Metro, which would make the model untestable in Node.
 *
 * The files are the web assets, trimmed and quantised to 320px PNG-8
 * (4.6 MB → 461 KB for the set).
 */
const SPRITES: Record<AssetType, Record<StageKey, ImageSourcePropType>> = {
  arcane_dragon: {
    baby: require('@/assets/pets/arcane_dragon_lv1_baby.png'),
    juvenile: require('@/assets/pets/arcane_dragon_lv2_juvenile.png'),
    adult: require('@/assets/pets/arcane_dragon_lv3_adult.png'),
    elder: require('@/assets/pets/arcane_dragon_lv4_elder.png'),
  },
  mystic_cat: {
    baby: require('@/assets/pets/mystic_cat_lv1_baby.png'),
    juvenile: require('@/assets/pets/mystic_cat_lv2_juvenile.png'),
    adult: require('@/assets/pets/mystic_cat_lv3_adult.png'),
    elder: require('@/assets/pets/mystic_cat_lv4_elder.png'),
  },
  spirit_wolf: {
    baby: require('@/assets/pets/spirit_wolf_lv1_baby.png'),
    juvenile: require('@/assets/pets/spirit_wolf_lv2_juvenile.png'),
    adult: require('@/assets/pets/spirit_wolf_lv3_adult.png'),
    elder: require('@/assets/pets/spirit_wolf_lv4_elder.png'),
  },
};

/** The sprite for a companion at a level, or null when no pet is chosen. */
export function spriteFor(
  petType: string | null | undefined,
  level: number | null | undefined,
): ImageSourcePropType | null {
  const id = petIdOf(petType);
  if (!id) return null;
  return SPRITES[PET_CATALOG[id].assetType][stageForLevel(level)];
}

