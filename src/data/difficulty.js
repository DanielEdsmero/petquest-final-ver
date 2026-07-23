/*
 * Single source of truth for difficulty colours. Both DIFF_CONFIG
 * (src/components/TaskList.jsx) and DIFF_META (src/data/presetQuests.js) pull
 * from here so a difficulty never renders two different colours across the app.
 *
 * Boss is included for consistency and for the Stage 2 boss-battle UI; the
 * difficulty tabs only render easy/medium/hard until that lands.
 */
export const DIFFICULTY_COLORS = {
  easy:   '#22c55e', // green
  medium: '#f59e0b', // amber
  hard:   '#ef4444', // red
  boss:   '#7c3aed', // purple
}
