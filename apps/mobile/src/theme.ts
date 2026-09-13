/**
 * PetQuest mobile theme.
 *
 * Ported by hand from the web app's design tokens (`src/index.css` `:root` and
 * `tailwind.config.js` `theme.extend.colors`) so the two clients look like the
 * same product. Values are duplicated deliberately — see MOBILE_MIGRATION_MAP.md
 * §8: the mobile app is isolated, with no workspace or shared package. A parity
 * test (Phase 8) will guard against drift.
 *
 * Styling approach: React Native `StyleSheet` + these tokens, not NativeWind.
 * NativeWind needs a Babel plugin, a Metro config and its own Tailwind config;
 * that is extra moving parts during an experimental shell, and it can be added
 * later without touching screen logic. Flagged for approval in the phase report.
 */

export const Colors = {
  /** Page backgrounds, darkest → lightest. */
  bgDeep: '#06061a',
  bgVoid: '#09092b',
  bgCard: '#0e0e2e',
  bgCard2: '#13133a',

  /** Solid card system (the web app's de-glassed cards). */
  cardBg: '#141a2e',
  cardBg2: '#182039',
  cardBorder: '#26314e',
  cardBorderHi: '#33406a',

  /** Brand accents. */
  gold: '#f5a31a',
  goldLight: '#ffd166',
  arcane: '#7c3aed',
  teal: '#06b6d4',
  rose: '#f43f5e',
  green: '#4ade80',

  /** Text tiers (contrast measured against bgCard on web). */
  textPrimary: '#e2e2ff',
  textSoft: '#b8b8cc',
  textMuted: '#8080aa',
  textPlaceholder: '#8f8fb8',
} as const;

/** Per-companion accents, matching src/config/pets.js on the web. */
export const PetAccents = {
  dragon: '#c4a2ff',
  cat: '#f5d98a',
  wolf: '#7dd3fc',
} as const;

/** Difficulty colours, matching src/data/difficulty.js on the web. */
export const DifficultyColors = {
  easy: '#4ade80',
  medium: '#f5a31a',
  hard: '#f43f5e',
  boss: '#a855f7',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  display: 34,
} as const;

/**
 * Widest content column. iPhone SE is 320pt, so every screen must stay readable
 * at that width — never set a minWidth above it.
 */
export const MaxContentWidth = 480;

export type ThemeColor = (typeof Colors)[keyof typeof Colors];
