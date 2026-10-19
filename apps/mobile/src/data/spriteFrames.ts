import type { ImageSourcePropType } from 'react-native';

import { petIdOf, type PetId } from '@/data/petModel';
import { FRAME_KEYS, type FrameKey } from '@/data/spriteModel';

/**
 * The eight walking frames per companion. Written out literally because
 * Metro cannot resolve a computed `require`. Only the selected companion's
 * set is ever mounted (the component takes one `FrameSet`).
 *
 * Frames come from scripts/slice-sprite-sheets.py — 128 × 128, feet on a
 * common baseline. See assets/sprites/manifest.json for whether a set was
 * sliced from the supplied sheet or derived from the baby portrait.
 */
export type FrameSet = Record<FrameKey, ImageSourcePropType>;

const FRAMES: Record<PetId, FrameSet> = {
  dragon: {
    idle: require('@/assets/sprites/dragon/f1_idle.png'),
    blink: require('@/assets/sprites/dragon/f2_blink.png'),
    walkLeftA: require('@/assets/sprites/dragon/f3_walk_left_a.png'),
    walkLeftB: require('@/assets/sprites/dragon/f4_walk_left_b.png'),
    walkRightA: require('@/assets/sprites/dragon/f5_walk_right_a.png'),
    walkRightB: require('@/assets/sprites/dragon/f6_walk_right_b.png'),
    happy: require('@/assets/sprites/dragon/f7_happy.png'),
    interact: require('@/assets/sprites/dragon/f8_interact.png'),
  },
  cat: {
    idle: require('@/assets/sprites/cat/f1_idle.png'),
    blink: require('@/assets/sprites/cat/f2_blink.png'),
    walkLeftA: require('@/assets/sprites/cat/f3_walk_left_a.png'),
    walkLeftB: require('@/assets/sprites/cat/f4_walk_left_b.png'),
    walkRightA: require('@/assets/sprites/cat/f5_walk_right_a.png'),
    walkRightB: require('@/assets/sprites/cat/f6_walk_right_b.png'),
    happy: require('@/assets/sprites/cat/f7_happy.png'),
    interact: require('@/assets/sprites/cat/f8_interact.png'),
  },
  wolf: {
    idle: require('@/assets/sprites/wolf/f1_idle.png'),
    blink: require('@/assets/sprites/wolf/f2_blink.png'),
    walkLeftA: require('@/assets/sprites/wolf/f3_walk_left_a.png'),
    walkLeftB: require('@/assets/sprites/wolf/f4_walk_left_b.png'),
    walkRightA: require('@/assets/sprites/wolf/f5_walk_right_a.png'),
    walkRightB: require('@/assets/sprites/wolf/f6_walk_right_b.png'),
    happy: require('@/assets/sprites/wolf/f7_happy.png'),
    interact: require('@/assets/sprites/wolf/f8_interact.png'),
  },
};

/**
 * Frames for a stored `selected_pet_id` (either id form). Unknown ids get the
 * dragon set — a wrong companion beats a missing image — and a set that is
 * somehow missing a frame falls back to its own idle frame for that key.
 */
export function framesFor(selectedPetId: string | null | undefined): FrameSet {
  const pet = petIdOf(selectedPetId) ?? 'dragon';
  const set = FRAMES[pet] ?? FRAMES.dragon;
  const out = { ...set };
  for (const k of FRAME_KEYS) if (!out[k]) out[k] = set.idle;
  return out;
}
