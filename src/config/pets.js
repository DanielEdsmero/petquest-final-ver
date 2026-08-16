/*
 * Pet sprite / evolution asset mapping — the SINGLE source of truth for which
 * PNG renders for a given companion at a given evolution stage, plus the starter
 * egg art and hatching riddles.
 *
 * Assets live in /public/pets/ (served from the site root) and are named
 * `{assetType}_{lvN_stage}.png`, e.g. arcane_dragon_lv1_baby.png.
 *
 * IMPORTANT — pet id vs assetType: the app stores pet ids as dragon/cat/wolf
 * (see src/data/pets.js), but the sprite files are named for the species:
 * arcane_dragon / mystic_cat / spirit_wolf. Every lookup here normalizes the
 * incoming id through `assetTypeOf` so callers can pass EITHER form (and any
 * unknown/4th type falls back to arcane_dragon rather than a broken image).
 *
 * Thresholds (0/100/500/1500) match levelFromPoints in src/data/progression.js,
 * which is itself aligned with the server's pet_level CASE expression. There are
 * 5 progression levels but only 4 art stages — Legendary (L5) reuses Elder.
 */

import { levelFromPoints } from '../data/progression'

/* ---- Stage table (matches the app's existing evolution thresholds) ---- */
export const STAGES = [
  { key: 'baby',     level: 1, minPts: 0,    label: 'Baby',     file: 'lv1_baby' },
  { key: 'juvenile', level: 2, minPts: 100,  label: 'Juvenile', file: 'lv2_juvenile' },
  { key: 'adult',    level: 3, minPts: 500,  label: 'Adult',    file: 'lv3_adult' },
  { key: 'elder',    level: 4, minPts: 1500, label: 'Elder',    file: 'lv4_elder' },
]

/* ---- The three known asset types + display names ---- */
export const PET_TYPES = ['arcane_dragon', 'mystic_cat', 'spirit_wolf']

export const PET_NAMES = {
  arcane_dragon: 'Arcane Dragon',
  mystic_cat: 'Mystic Cat',
  spirit_wolf: 'Spirit Wolf',
}

/* ---- Rich per-companion catalog (app id → everything else) ---- */
export const PET_CATALOG = {
  dragon: { id: 'dragon', assetType: 'arcane_dragon', name: 'Ember', species: 'Arcane Dragon',
    emoji: '🐉', eggRiddle: 'Whispers of ancient flame…',  egg: '/pets/egg_arcane_dragon.png' },
  cat:    { id: 'cat',    assetType: 'mystic_cat',    name: 'Luna',  species: 'Mystic Cat',
    emoji: '🐱', eggRiddle: 'A moonlit guardian awaits…',  egg: '/pets/egg_mystic_cat.png' },
  wolf:   { id: 'wolf',   assetType: 'spirit_wolf',   name: 'Storm', species: 'Spirit Wolf',
    emoji: '🐺', eggRiddle: 'Frost and starlight beckon…', egg: '/pets/egg_spirit_wolf.png' },
}

/* app id (dragon) OR assetType (arcane_dragon) OR unknown → a valid assetType. */
export function assetTypeOf(petType) {
  if (!petType) return 'arcane_dragon'
  if (PET_TYPES.includes(petType)) return petType             // already an assetType
  const c = PET_CATALOG[petType]
  return c ? c.assetType : 'arcane_dragon'                     // app id, or graceful fallback
}

/* Clamp any progression level (incl. L5 Legendary) into the 1–4 art range. */
const artStage = (level) => STAGES[Math.max(0, Math.min(STAGES.length - 1, (level || 1) - 1))]

/** Sprite path for an explicit evolution level (1–5). */
export function spriteFor(petType, level) {
  return `/pets/${assetTypeOf(petType)}_${artStage(level).file}.png`
}

/** Sprite path derived from total points earned (uses the shared thresholds). */
export function spriteForPoints(petType, totalEarned = 0) {
  return spriteFor(petType, levelFromPoints(totalEarned))
}

/**
 * Requested contract: given petType + current points, return the resolved stage.
 * petType accepts an app id (dragon) or an assetType (arcane_dragon).
 */
export function getStageForPoints(petType, points = 0) {
  const at = assetTypeOf(petType)
  let stage = STAGES[0]
  for (const s of STAGES) if ((points || 0) >= s.minPts) stage = s
  return { stageKey: stage.key, label: stage.label, level: stage.level, sprite: `/pets/${at}_${stage.file}.png` }
}

/** Egg art for the hatching onboarding. */
export function eggFor(petType) {
  return `/pets/egg_${assetTypeOf(petType)}.png`
}

/** Human-readable stage name for a level (Baby/Juvenile/Adult/Elder). */
export function stageName(level) {
  return artStage(level).label
}

/** Rich catalog entry for an app pet id (dragon/cat/wolf), with fallback. */
export function petMeta(petId) {
  return PET_CATALOG[petId] || PET_CATALOG.dragon
}

/** The three mystery eggs offered to brand-new users, in display order. */
export const EGG_CHOICES = ['dragon', 'cat', 'wolf'].map(id => PET_CATALOG[id])
