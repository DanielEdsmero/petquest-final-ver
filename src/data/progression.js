/*
 * Pet evolution + streak progression.
 *
 * Thresholds here MUST match the CASE expressions in
 * supabase-phase4-gamification.sql — the server is authoritative for the
 * stored pet_level; these are for display and for animating ahead of a refetch.
 */

export const PET_LEVELS = [
  {
    level: 1, name: 'Baby', min: 0, max: 100,
    blurb: 'Newly hatched and full of curiosity.',
    scale: 0.78, glowScale: 0.6, aura: false, particles: 0,
  },
  {
    level: 2, name: 'Juvenile', min: 100, max: 500,
    blurb: 'Growing fast — the spark of magic takes hold.',
    scale: 0.88, glowScale: 0.85, aura: false, particles: 0, hue: 18,
  },
  {
    level: 3, name: 'Adult', min: 500, max: 1500,
    blurb: 'Fully grown, confident, and radiant with power.',
    scale: 1.0, glowScale: 1.1, aura: false, particles: 0, hue: 0,
  },
  {
    level: 4, name: 'Elder', min: 1500, max: 5000,
    blurb: 'Ancient wisdom burns in an unmistakable aura.',
    scale: 1.08, glowScale: 1.5, aura: true, particles: 0, hue: -12,
  },
  {
    level: 5, name: 'Legendary', min: 5000, max: null,
    blurb: 'A myth made real. The realm itself bends to its will.',
    scale: 1.16, glowScale: 1.9, aura: true, particles: 6, hue: -24,
  },
]

export function levelFromPoints(totalEarned = 0) {
  const t = Math.max(0, totalEarned || 0)
  if (t >= 5000) return 5
  if (t >= 1500) return 4
  if (t >= 500) return 3
  if (t >= 100) return 2
  return 1
}

export function getLevelMeta(level) {
  return PET_LEVELS.find(l => l.level === level) || PET_LEVELS[0]
}

/* Progress toward the next evolution, for the "340/500 pts" bar. */
export function evolutionProgress(totalEarned = 0) {
  const t = Math.max(0, totalEarned || 0)
  const level = levelFromPoints(t)
  const meta = getLevelMeta(level)

  if (meta.max === null) {
    return { level, meta, isMax: true, current: t, target: t, pct: 100, remaining: 0 }
  }

  const span = meta.max - meta.min
  const into = t - meta.min
  return {
    level,
    meta,
    isMax: false,
    current: t,
    target: meta.max,
    remaining: meta.max - t,
    pct: Math.max(0, Math.min(100, (into / span) * 100)),
  }
}

export const STREAK_MILESTONES = [7, 30, 100, 365]

export const MILESTONE_REWARDS = {
  7:   '+50 bonus points',
  30:  'a free Rare accessory',
  100: 'a free Epic accessory',
  365: 'a free Legendary accessory and a unique title',
}

export function isStreakMilestone(streak) {
  return STREAK_MILESTONES.includes(streak)
}

/* Achievement badge catalogue. IDs must match the badge_id values written by
   complete_task(). Used by the Trophy Room and the unlock modal. */
export const BADGES = {
  first_steps:   { name: 'First Steps',   emoji: '👣', desc: 'Complete your first quest',   rarity: 'Common' },
  scholar:       { name: 'Scholar',       emoji: '📚', desc: 'Complete 50 quests',          rarity: 'Epic' },
  unstoppable:   { name: 'Unstoppable',   emoji: '🔥', desc: 'Reach a 7-day streak',        rarity: 'Rare' },
  dragon_master: { name: 'Dragon Master', emoji: '🐉', desc: 'Reach a Level 3 companion',   rarity: 'Epic' },
  collector:     { name: 'Collector',     emoji: '🎁', desc: 'Own 5 accessories',           rarity: 'Rare' },
  speed_demon:   { name: 'Speed Demon',   emoji: '⚡', desc: 'Complete 5 quests in one day', rarity: 'Legendary' },
}
