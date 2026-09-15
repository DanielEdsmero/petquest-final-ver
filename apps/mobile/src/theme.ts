/**
 * PetQuest mobile theme — "Today's Adventure" direction.
 *
 * Warm ivory ground, ink text, muted teal as the single interaction colour,
 * small coral / green status accents. Calm and spacious rather than a game
 * dashboard: one primary action per screen, subtle borders, no neon and no
 * gradients.
 *
 * The web app keeps its dark palette; the two clients are deliberately NOT
 * pixel-matched any more (MOBILE_MIGRATION_MAP.md §8 — isolated app, no shared
 * package). What they still share is the meaning of every status colour:
 * difficulty tiers, validity states and verification outcomes map to the same
 * words on both clients, and those words are what the parity tests check.
 *
 * Styling approach: React Native `StyleSheet` + these tokens, not NativeWind.
 *
 * Naming: the new semantic keys (`background`, `ink`, `primary`, …) are the
 * ones to use. The older keys below them are kept as aliases so every screen
 * written against the dark theme still compiles and lands on the new palette —
 * they are being migrated screen by screen and will be removed afterwards.
 */

const palette = {
  ivory: '#FAF8F0',
  mist: '#F3F5F2',
  white: '#FFFFFF',
  ink: '#102A43',
  inkSoft: '#3E5165',
  inkMuted: '#667085',
  inkFaint: '#98A2B3',
  teal: '#3F8580',
  tealDeep: '#2F6F6B',
  tealTint: '#E4EFEE',
  apricot: '#EBA66E',
  apricotTint: '#FBEEDF',
  leaf: '#5EAF7B',
  leafTint: '#E6F4EA',
  coral: '#E58A73',
  coralTint: '#FBE8E3',
  line: '#E1E7E3',
  lineStrong: '#CBD5D0',
} as const;

export const Colors = {
  /* ── Semantic (use these) ── */
  background: palette.ivory,
  surface: palette.mist,
  surfaceElevated: palette.white,
  ink: palette.ink,
  inkSoft: palette.inkSoft,
  inkMuted: palette.inkMuted,
  inkFaint: palette.inkFaint,
  primary: palette.teal,
  primaryPressed: palette.tealDeep,
  primaryTint: palette.tealTint,
  onPrimary: palette.white,
  accentWarm: palette.apricot,
  accentWarmTint: palette.apricotTint,
  success: palette.leaf,
  successTint: palette.leafTint,
  warning: palette.coral,
  warningTint: palette.coralTint,
  border: palette.line,
  borderStrong: palette.lineStrong,

  /* ── Aliases for screens written against the dark theme ── */
  bgDeep: palette.ivory,
  bgVoid: palette.ivory,
  bgCard: palette.mist,
  bgCard2: palette.mist,
  cardBg: palette.white,
  cardBg2: palette.mist,
  cardBorder: palette.line,
  cardBorderHi: palette.lineStrong,
  gold: palette.teal, // the old "brand accent" role is now the primary teal
  goldLight: palette.apricot,
  arcane: palette.teal,
  teal: palette.teal,
  rose: palette.coral,
  green: palette.leaf,
  textPrimary: palette.ink,
  textSoft: palette.inkSoft,
  textMuted: palette.inkMuted,
  textPlaceholder: palette.inkFaint,
} as const;

/**
 * Per-companion accents. Muted for the ivory ground; the sprite itself carries
 * the character's colour, this is only for the soft disc behind it.
 */
export const PetAccents = {
  dragon: '#B9A7DC',
  cat: '#E3C88F',
  wolf: '#9CC5DA',
} as const;

/**
 * Difficulty colours. Same three tiers as the web (`src/data/difficulty.js`),
 * re-tuned for contrast on ivory; the words are what stay in parity.
 */
export const DifficultyColors = {
  easy: '#3E9A63',
  medium: '#C98A2B',
  hard: '#D0605A',
  boss: '#7C5CBF',
} as const;

/** 8-point scale. */
export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  display: 34,
} as const;

/** Minimum tap target. Every Pressable a participant relies on is at least this tall. */
export const TapTarget = 48;

/**
 * Widest content column. iPhone SE is 320pt, so every screen must stay readable
 * at that width — never set a minWidth above it.
 */
export const MaxContentWidth = 480;

/** One subtle elevation for cards that sit on the ivory ground. */
export const Shadow = {
  card: {
    shadowColor: palette.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

export type ThemeColor = (typeof Colors)[keyof typeof Colors];
