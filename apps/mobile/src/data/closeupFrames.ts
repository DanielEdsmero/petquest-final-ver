import type { ImageSourcePropType } from 'react-native';

import { CLOSEUP_FRAMES, type CloseupFrame } from '@/data/closeupModel';
import { petIdOf, type PetId } from '@/data/petModel';

/**
 * The View Pet close-up frames — the supplied dedicated close-up art, one set
 * of eight per companion (assets/closeup/<pet>/). Written out literally
 * because Metro cannot resolve a computed `require`.
 *
 * These are a DIFFERENT set from the walking sprites used in the home scene
 * (assets/sprites/): larger, registered on one baseline, and drawn as the
 * real PetQuest companions — purple Arcane Dragon, cream Mystic Cat with its
 * crescent, blue Spirit Wolf with its spirit flames.
 *
 * Only the selected companion's set is ever rendered.
 */
export type CloseupFrameSet = Record<CloseupFrame, ImageSourcePropType>;

const FRAMES: Record<PetId, CloseupFrameSet> = {
  dragon: {
    idle: require('@/assets/closeup/dragon/idle.png'),
    breathe: require('@/assets/closeup/dragon/breathe.png'),
    blink: require('@/assets/closeup/dragon/blink.png'),
    idleReturn: require('@/assets/closeup/dragon/idle_return.png'),
    happy: require('@/assets/closeup/dragon/happy.png'),
    hungry: require('@/assets/closeup/dragon/hungry.png'),
    needsCleaning: require('@/assets/closeup/dragon/needs_cleaning.png'),
    careReaction: require('@/assets/closeup/dragon/care_reaction.png'),
  },
  cat: {
    idle: require('@/assets/closeup/cat/idle.png'),
    breathe: require('@/assets/closeup/cat/breathe.png'),
    blink: require('@/assets/closeup/cat/blink.png'),
    idleReturn: require('@/assets/closeup/cat/idle_return.png'),
    happy: require('@/assets/closeup/cat/happy.png'),
    hungry: require('@/assets/closeup/cat/hungry.png'),
    needsCleaning: require('@/assets/closeup/cat/needs_cleaning.png'),
    careReaction: require('@/assets/closeup/cat/care_reaction.png'),
  },
  wolf: {
    idle: require('@/assets/closeup/wolf/idle.png'),
    breathe: require('@/assets/closeup/wolf/breathe.png'),
    blink: require('@/assets/closeup/wolf/blink.png'),
    idleReturn: require('@/assets/closeup/wolf/idle_return.png'),
    happy: require('@/assets/closeup/wolf/happy.png'),
    hungry: require('@/assets/closeup/wolf/hungry.png'),
    needsCleaning: require('@/assets/closeup/wolf/needs_cleaning.png'),
    careReaction: require('@/assets/closeup/wolf/care_reaction.png'),
  },
};

/**
 * The close-up set for a stored `selected_pet_id` (either id form), or null
 * when there is no companion. A set missing a frame falls back to its own
 * idle frame for that key, so a gap can never render as nothing.
 */
export function closeupFramesFor(selectedPetId: string | null | undefined): CloseupFrameSet | null {
  const pet = petIdOf(selectedPetId);
  if (!pet) return null;
  const set = FRAMES[pet] ?? FRAMES.dragon;
  const out = { ...set };
  for (const k of CLOSEUP_FRAMES) if (!out[k]) out[k] = set.idle;
  return out;
}
