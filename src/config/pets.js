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

import { levelFromPoints } from '../data/progression.js'

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


/* ============================================================
 * Wake-up loading animation (sleeping → awake)
 *
 * Four frames per companion, split from the supplied PetQuest wake-up sprite
 * sheets, which were drawn from the real baby-stage mascot art — so the Dragon
 * stays purple/gold-eyed, the Mystic Cat cream with its crescent + violet
 * sparkles, and the Spirit Wolf white-blue with cyan wisps.
 *
 * The sheets exist for the BABY stage only. `wakeFramesFor` therefore takes an
 * evolution stage but currently resolves every stage to the baby sheet of the
 * SAME species — never a different companion (see WAKE_STAGE_SHEETS). When
 * stage-specific sheets are added, list them there and the lookup picks them up.
 * ============================================================ */

/* app id / assetType / unknown → 'dragon' | 'cat' | 'wolf'. */
export function petIdOf(petType) {
  if (!petType) return 'dragon'
  if (PET_CATALOG[petType]) return petType                      // already an app id
  const hit = Object.values(PET_CATALOG).find(c => c.assetType === petType)
  return hit ? hit.id : 'dragon'
}

/* The four wake poses, in play order. Frame 3 is the pet's own flourish. */
export const WAKE_SEQUENCE = ['sleep', 'stir', 'action', 'awake']

/* Per-species file suffixes + the loading caption. */
export const WAKE_PETS = {
  dragon: { action: 'spark',   accent: '#c4a2ff', message: 'Waking your Dragon…' },
  cat:    { action: 'stretch', accent: '#f5d98a', message: 'The Mystic Cat is stretching awake…' },
  wolf:   { action: 'listen',  accent: '#7dd3fc', message: 'The Spirit Wolf is listening for your next quest…' },
}

export const WAKE_FALLBACK_MESSAGE = 'Preparing your adventure…'

/* Which sheet each evolution stage uses. Only the baby sheet exists today, so
   every stage maps to it — deliberately keyed by stage so adding a juvenile /
   adult / elder sheet is a one-line change and never falls back to a different
   species. */
export const WAKE_STAGE_SHEETS = { baby: 'baby', juvenile: 'baby', adult: 'baby', elder: 'baby' }

/* How long each pose holds, in ms. 'awake' is open-ended — it stays on screen
   until loading finishes, so a fast load never waits on a fake timer. */
export const WAKE_TIMINGS = { sleep: 700, stir: 400, action: 500 }

/** Total ms from the sleeping frame to the awake frame. */
export const WAKE_TOTAL_MS = WAKE_TIMINGS.sleep + WAKE_TIMINGS.stir + WAKE_TIMINGS.action

/** Which frame (0–3) should be showing `ms` into the sequence. */
export function wakeFrameIndexAt(ms) {
  const t = Number(ms) || 0
  if (t < WAKE_TIMINGS.sleep) return 0
  if (t < WAKE_TIMINGS.sleep + WAKE_TIMINGS.stir) return 1
  if (t < WAKE_TOTAL_MS) return 2
  return 3
}

/**
 * The four wake frame paths for a companion, in play order.
 * `petType` accepts an app id (dragon) or an assetType (arcane_dragon);
 * `stage` is a STAGES key (baby/juvenile/adult/elder) or a 1–5 level.
 */
export function wakeFramesFor(petType, stage = 'baby') {
  const id = petIdOf(petType)
  const { action } = WAKE_PETS[id]
  const key = typeof stage === 'number' ? artStage(stage).key : String(stage || 'baby')
  const sheet = WAKE_STAGE_SHEETS[key] || 'baby'
  const names = ['01_sleep', '02_stir', `03_${action}`, '04_awake']
  // `sheet` selects the art set; today there is one, so it is not in the path.
  return names.map(n => `/pets/wake/${id}_wake_${n}.png`)
}

/** The caption for a companion (or the neutral fallback when unknown). */
export function wakeMessageFor(petType) {
  if (!petType) return WAKE_FALLBACK_MESSAGE
  return WAKE_PETS[petIdOf(petType)].message
}

/**
 * Which companion a loading instance should show.
 * Rule: the user's real pet when it is known; otherwise a random one, picked
 * once per loading instance (the caller locks it for the whole animation).
 */
export function resolveWakePet(petType, rand = Math.random) {
  if (petType) return { id: petIdOf(petType), random: false }
  const ids = Object.keys(WAKE_PETS)
  return { id: ids[Math.floor(rand() * ids.length) % ids.length], random: true }
}
