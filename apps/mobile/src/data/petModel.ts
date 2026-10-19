/**
 * Pet evolution model — the mobile port of `src/config/pets.js` and
 * the level table in `src/data/progression.js` from the web app.
 *
 * COPIED ON PURPOSE. The mobile app is isolated (no workspace, no shared
 * package), so these constants are duplicated rather than imported across the
 * boundary — see MOBILE_MIGRATION_MAP.md §8. The Phase 8 parity test must
 * assert these thresholds against the web originals, because they also have to
 * match the `pet_level` CASE expression in supabase-phase4-gamification.sql.
 * The server is authoritative for the stored level; these are for display.
 *
 * This file is deliberately free of imports — no React Native, no `require` of
 * an asset — so the rules can be unit-tested under `node --test`. The sprite
 * table lives next door in petSprites.ts, which does need Metro.
 */

export type PetId = 'dragon' | 'cat' | 'wolf';
export type AssetType = 'arcane_dragon' | 'mystic_cat' | 'spirit_wolf';
export type StageKey = 'baby' | 'juvenile' | 'adult' | 'elder';

export const STAGES: { key: StageKey; level: number; minPts: number; label: string }[] = [
  { key: 'baby', level: 1, minPts: 0, label: 'Baby' },
  { key: 'juvenile', level: 2, minPts: 100, label: 'Juvenile' },
  { key: 'adult', level: 3, minPts: 500, label: 'Adult' },
  { key: 'elder', level: 4, minPts: 1500, label: 'Elder' },
];

/** Level 5 (Legendary, 5000+) reuses the Elder artwork — there are only 4 stages. */
export const LEGENDARY_MIN = 5000;

export const PET_CATALOG: Record<
  PetId,
  { id: PetId; assetType: AssetType; name: string; species: string; emoji: string; accent: string }
> = {
  dragon: {
    id: 'dragon',
    assetType: 'arcane_dragon',
    name: 'Ember',
    species: 'Arcane Dragon',
    emoji: '🐉',
    accent: '#c4a2ff',
  },
  cat: {
    id: 'cat',
    assetType: 'mystic_cat',
    name: 'Luna',
    species: 'Mystic Cat',
    emoji: '🐱',
    accent: '#f5d98a',
  },
  wolf: {
    id: 'wolf',
    assetType: 'spirit_wolf',
    name: 'Storm',
    species: 'Spirit Wolf',
    emoji: '🐺',
    accent: '#7dd3fc',
  },
};

/** An app id, an asset type, or anything unknown → a valid pet id. */
export function petIdOf(value: string | null | undefined): PetId | null {
  if (!value) return null;
  if (value in PET_CATALOG) return value as PetId;
  const hit = Object.values(PET_CATALOG).find((p) => p.assetType === value);
  return hit ? hit.id : null;
}

/** Clamp any progression level (including L5) into the 1–4 art range. */
export function stageForLevel(level: number | null | undefined): StageKey {
  const l = Math.max(1, Math.min(STAGES.length, level || 1));
  return STAGES[l - 1].key;
}

/** Matches levelFromPoints() on the web and the server's pet_level CASE. */
export function levelFromPoints(totalEarned: number | null | undefined): number {
  const t = Math.max(0, totalEarned || 0);
  if (t >= LEGENDARY_MIN) return 5;
  if (t >= 1500) return 4;
  if (t >= 500) return 3;
  if (t >= 100) return 2;
  return 1;
}

/** Human-readable stage name for a level (Baby…Legendary). */
export function stageName(level: number | null | undefined): string {
  if ((level ?? 1) >= 5) return 'Legendary';
  return STAGES[Math.max(1, Math.min(STAGES.length, level || 1)) - 1].label;
}

/** Points still needed for the next stage, and progress through the current one. */
export function evolutionProgress(totalEarned: number | null | undefined): {
  level: number;
  nextAt: number | null;
  remaining: number | null;
  fraction: number;
} {
  const total = Math.max(0, totalEarned || 0);
  const level = levelFromPoints(total);
  const bounds = [0, 100, 500, 1500, LEGENDARY_MIN];
  if (level >= 5) return { level, nextAt: null, remaining: null, fraction: 1 };
  const from = bounds[level - 1];
  const to = bounds[level];
  return {
    level,
    nextAt: to,
    remaining: Math.max(0, to - total),
    fraction: to === from ? 0 : Math.min(1, Math.max(0, (total - from) / (to - from))),
  };
}
