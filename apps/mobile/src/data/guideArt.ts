import type { ImageSourcePropType } from 'react-native';

import { PET_CATALOG, stageForLevel, petIdOf, type AssetType, type StageKey } from '@/data/petModel';

/**
 * The big portraits for the first-login tour. The same art as petSprites.ts but
 * cropped tight with the faint haze around the edges removed, so a pet standing
 * over the dimmed screen has a clean outline. Written out literally for Metro.
 */
const ART: Record<AssetType, Record<StageKey, ImageSourcePropType>> = {
  arcane_dragon: {
    baby: require('@/assets/guide/arcane_dragon_lv1_baby.png'),
    juvenile: require('@/assets/guide/arcane_dragon_lv2_juvenile.png'),
    adult: require('@/assets/guide/arcane_dragon_lv3_adult.png'),
    elder: require('@/assets/guide/arcane_dragon_lv4_elder.png'),
  },
  mystic_cat: {
    baby: require('@/assets/guide/mystic_cat_lv1_baby.png'),
    juvenile: require('@/assets/guide/mystic_cat_lv2_juvenile.png'),
    adult: require('@/assets/guide/mystic_cat_lv3_adult.png'),
    elder: require('@/assets/guide/mystic_cat_lv4_elder.png'),
  },
  spirit_wolf: {
    baby: require('@/assets/guide/spirit_wolf_lv1_baby.png'),
    juvenile: require('@/assets/guide/spirit_wolf_lv2_juvenile.png'),
    adult: require('@/assets/guide/spirit_wolf_lv3_adult.png'),
    elder: require('@/assets/guide/spirit_wolf_lv4_elder.png'),
  },
};

/** The portrait for a companion at a level, or null when no pet is chosen. */
export function guideArtFor(petType: string | null | undefined, level: number | null | undefined): ImageSourcePropType | null {
  const id = petIdOf(petType);
  if (!id) return null;
  return ART[PET_CATALOG[id].assetType][stageForLevel(level)];
}
