import type { ImageSourcePropType } from 'react-native';

import type { PetId } from '@/data/petModel';

/**
 * The four wake-up frames per companion, in play order.
 *
 * Separate from wakeModel.ts because Metro cannot resolve a computed `require`
 * and a literal asset `require` cannot run under node --test. The files are
 * the web app's already-trimmed 256px PNG-8 frames, copied as-is (248 KB for
 * all twelve). The sheets exist for the BABY stage only; every evolution stage
 * shows the baby wake frames of the SAME species — never a different one.
 */
export const WAKE_FRAMES: Record<PetId, ImageSourcePropType[]> = {
  dragon: [
    require('@/assets/pets/wake/dragon_wake_01_sleep.png'),
    require('@/assets/pets/wake/dragon_wake_02_stir.png'),
    require('@/assets/pets/wake/dragon_wake_03_spark.png'),
    require('@/assets/pets/wake/dragon_wake_04_awake.png'),
  ],
  cat: [
    require('@/assets/pets/wake/cat_wake_01_sleep.png'),
    require('@/assets/pets/wake/cat_wake_02_stir.png'),
    require('@/assets/pets/wake/cat_wake_03_stretch.png'),
    require('@/assets/pets/wake/cat_wake_04_awake.png'),
  ],
  wolf: [
    require('@/assets/pets/wake/wolf_wake_01_sleep.png'),
    require('@/assets/pets/wake/wolf_wake_02_stir.png'),
    require('@/assets/pets/wake/wolf_wake_03_listen.png'),
    require('@/assets/pets/wake/wolf_wake_04_awake.png'),
  ],
};
