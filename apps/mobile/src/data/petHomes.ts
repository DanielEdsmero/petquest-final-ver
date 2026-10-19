import type { ImageSourcePropType } from 'react-native';

import { FALLBACK_HOME, homeFor, type HomeId, type PetHome } from '@/data/petHomeModel';

/**
 * The home environment images. Written out literally because Metro cannot
 * resolve a computed `require`; the mapping itself is in petHomeModel.ts so
 * it stays testable in Node.
 *
 * Only the selected companion's image is ever rendered. `require` registers
 * the asset with the bundler; expo-image decodes it lazily on first display.
 */
const HOME_IMAGES: Record<HomeId, ImageSourcePropType> = {
  sunlit_meadow: require('@/assets/homes/sunlit_meadow.png'),
  moonlit_cottage: require('@/assets/homes/moonlit_cottage.png'),
  ember_cavern: require('@/assets/homes/ember_cavern.png'),
  crystal_cavern: require('@/assets/homes/crystal_cavern.png'),
};

export function homeImage(home: PetHome): ImageSourcePropType {
  return HOME_IMAGES[home.id] ?? HOME_IMAGES[FALLBACK_HOME];
}

/** Home + image for a stored `selected_pet_id`, with the fallback for anything unknown. */
export function homeAndImageFor(selectedPetId: string | null | undefined): { home: PetHome; image: ImageSourcePropType } {
  const home = homeFor(selectedPetId);
  return { home, image: homeImage(home) };
}
