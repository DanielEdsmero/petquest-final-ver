export const ACCESSORIES = [
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

  // Accessories / Misc
  { id: 'wings', name: 'Angel Wings', category: 'misc', emoji: '😇', displayEmoji: '✨', cost: 90, description: 'Celestial and divine radiance', rarity: 'Legendary' },
  { id: 'rainbow', name: 'Rainbow Aura', category: 'misc', emoji: '🌈', displayEmoji: '🌈', cost: 65, description: 'Radiates pure joy to all', rarity: 'Epic' },
  { id: 'star', name: 'Star Badge', category: 'misc', emoji: '⭐', displayEmoji: '⭐', cost: 30, description: 'Sheriff of the enchanted realm', rarity: 'Common' },
]

export const RARITY_COLORS = {
  Common: { text: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' },
  Rare: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)' },
  Epic: { text: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)', border: 'rgba(167, 139, 250, 0.3)' },
  Legendary: { text: '#f5a31a', bg: 'rgba(245, 163, 26, 0.1)', border: 'rgba(245, 163, 26, 0.3)' },
}

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'hat', label: 'Hats' },
  { id: 'eyewear', label: 'Eyewear' },
  { id: 'outfit', label: 'Outfits' },
  { id: 'misc', label: 'Misc' },
]
