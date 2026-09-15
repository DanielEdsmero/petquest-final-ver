/**
 * Accessories — the pure half.
 *
 * The catalogue is COPIED from the web's `src/data/accessories.js` on purpose
 * (MOBILE_MIGRATION_MAP.md §8: isolated app, no shared package). A parity
 * test reads the web file and fails if the ids, categories or costs drift.
 *
 * Ownership lives in `owned_accessories`, what is worn in
 * `equipped_accessories` (one per category). Both are the participant's own
 * rows under RLS. Nothing here decides what is owned — `canEquip` only checks
 * the fetched list, and the screen only ever equips something that list
 * contains.
 */

export type AccessoryCategory = 'hat' | 'eyewear' | 'outfit' | 'misc';
export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type Accessory = {
  id: string;
  name: string;
  category: AccessoryCategory;
  emoji: string;
  displayEmoji: string;
  cost: number;
  description: string;
  rarity: Rarity;
};

export const ACCESSORIES: Accessory[] = [
  // Hats
  { id: 'wizard_hat', name: 'Wizard Hat', category: 'hat', emoji: '🧙', displayEmoji: '🪄', cost: 50, description: 'Channel the arcane arts', rarity: 'Epic' },
  { id: 'crown', name: 'Royal Crown', category: 'hat', emoji: '👑', displayEmoji: '👑', cost: 120, description: 'Rule the enchanted realm', rarity: 'Legendary' },
  { id: 'cowboy_hat', name: 'Cowboy Hat', category: 'hat', emoji: '🤠', displayEmoji: '🎩', cost: 40, description: 'Ride into the sunset', rarity: 'Common' },
  { id: 'party_hat', name: 'Party Hat', category: 'hat', emoji: '🎉', displayEmoji: '🎊', cost: 25, description: 'Every day is a celebration', rarity: 'Common' },
  { id: 'santa_hat', name: 'Santa Hat', category: 'hat', emoji: '🎅', displayEmoji: '🎁', cost: 35, description: 'Spreading seasonal joy', rarity: 'Rare' },
  { id: 'witch_hat', name: 'Witch Hat', category: 'hat', emoji: '🧙‍♀️', displayEmoji: '🌙', cost: 60, description: 'Brew up some mischief', rarity: 'Epic' },

  // Eyewear
  { id: 'sunglasses', name: 'Cool Shades', category: 'eyewear', emoji: '🕶️', displayEmoji: '🕶️', cost: 30, description: 'Too cool for the mortal realm', rarity: 'Common' },
  { id: 'monocle', name: 'Monocle', category: 'eyewear', emoji: '🧐', displayEmoji: '🔎', cost: 45, description: 'Very distinguished indeed', rarity: 'Rare' },
  { id: 'heart_glasses', name: 'Heart Glasses', category: 'eyewear', emoji: '🥰', displayEmoji: '💕', cost: 35, description: 'See the world with love', rarity: 'Common' },

  // Outfits
  { id: 'cape', name: 'Hero Cape', category: 'outfit', emoji: '🦸', displayEmoji: '🦸', cost: 80, description: 'Every hero needs a cape', rarity: 'Epic' },
  { id: 'bowtie', name: 'Bow Tie', category: 'outfit', emoji: '🎀', displayEmoji: '🎀', cost: 20, description: 'Dapper and distinguished', rarity: 'Common' },
  { id: 'armor', name: 'Battle Armor', category: 'outfit', emoji: '⚔️', displayEmoji: '🛡️', cost: 100, description: 'Forged in dragon fire', rarity: 'Legendary' },
  { id: 'tuxedo', name: 'Tuxedo', category: 'outfit', emoji: '🤵', displayEmoji: '🤵', cost: 70, description: 'Bond. Pet Bond.', rarity: 'Rare' },

  // Misc
  { id: 'wings', name: 'Angel Wings', category: 'misc', emoji: '😇', displayEmoji: '✨', cost: 90, description: 'Celestial and divine radiance', rarity: 'Legendary' },
  { id: 'rainbow', name: 'Rainbow Aura', category: 'misc', emoji: '🌈', displayEmoji: '🌈', cost: 65, description: 'Radiates pure joy to all', rarity: 'Epic' },
  { id: 'star', name: 'Star Badge', category: 'misc', emoji: '⭐', displayEmoji: '⭐', cost: 30, description: 'Sheriff of the enchanted realm', rarity: 'Common' },
];

export const CATEGORIES: { id: AccessoryCategory; label: string }[] = [
  { id: 'hat', label: 'Hats' },
  { id: 'eyewear', label: 'Eyewear' },
  { id: 'outfit', label: 'Outfits' },
  { id: 'misc', label: 'Misc' },
];

export const RARITY_COLORS: Record<Rarity, string> = {
  Common: '#667085',
  Rare: '#3F8580',
  Epic: '#7C6FB8',
  Legendary: '#C98A2B',
};

export const accessoryById = (id: string): Accessory | undefined => ACCESSORIES.find((a) => a.id === id);

/** category → accessory id, straight from `equipped_accessories`. */
export type EquippedMap = Partial<Record<AccessoryCategory, string>>;

export type AccessoryRow = Accessory & { owned: boolean; equipped: boolean };

/** Decorate the catalogue with the fetched ownership and equipped state. */
export function decorate(owned: string[] | null, equipped: EquippedMap | null): AccessoryRow[] {
  const own = new Set(owned ?? []);
  return ACCESSORIES.map((a) => ({
    ...a,
    owned: own.has(a.id),
    equipped: (equipped ?? {})[a.category] === a.id,
  }));
}

/** Equipped first, then owned, then locked — within each, the catalogue order. */
export function sortForDisplay(rows: AccessoryRow[]): AccessoryRow[] {
  const rank = (r: AccessoryRow) => (r.equipped ? 0 : r.owned ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

export function groupByCategory(rows: AccessoryRow[]): { category: AccessoryCategory; label: string; items: AccessoryRow[] }[] {
  return CATEGORIES.map((c) => ({ category: c.id, label: c.label, items: sortForDisplay(rows.filter((r) => r.category === c.id)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Only something the server says is owned may be worn. */
export const canEquip = (row: Pick<AccessoryRow, 'owned'>): boolean => row.owned;

/** The glyphs to show beside the pet — the same `displayEmoji` the web overlays. */
export function equippedGlyphs(equipped: EquippedMap | null): string[] {
  return CATEGORIES.map((c) => (equipped ?? {})[c.id])
    .map((id) => (id ? accessoryById(id)?.displayEmoji : undefined))
    .filter((g): g is string => !!g);
}

export const countOwned = (rows: AccessoryRow[]) => rows.filter((r) => r.owned).length;
