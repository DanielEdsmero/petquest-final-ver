# PetQuest — Project structure

A labeled map of every folder and file, grouped by what it's used for. Stack:
**Vite + React SPA (plain JS/JSX)**, `react-router-dom`, Tailwind, framer-motion;
**Supabase** (DB/Auth); one **Vercel serverless** function for AI verification.

---

## Root — config & entry

| Path | Used for |
|------|----------|
| `index.html` | Vite HTML entry; mounts `src/main.jsx`. |
| `package.json` / `package-lock.json` | Dependencies + scripts (`dev`, `build`, `preview`). |
| `vite.config.js` | Vite build/dev config. |
| `tailwind.config.js` | Tailwind theme (navy/gold palette, fonts). |
| `postcss.config.js` | PostCSS (Tailwind/autoprefixer) pipeline. |
| `vercel.json` | Vercel deploy config (SPA rewrites + `/api` functions). |
| `README.md` | Setup / getting-started guide. |
| `PROJECT_STRUCTURE.md` | This file — the labeled map. |
| `dist/` | Build output (generated; not edited by hand). |
| `node_modules/` | Installed dependencies (generated). |

## `public/` — static assets served at site root
| Path | Used for |
|------|----------|
| `public/pets/*.png` | Pet **evolution sprites** + **starter eggs** (512×512). Named `{type}_{lvN_stage}.png` and `egg_{type}.png`. Served at `/pets/…`. |

## `api/` — Vercel serverless (the only server-side compute)
| Path | Used for |
|------|----------|
| `api/verify.js` | **Gemini AI proof verification.** Holds the Gemini + Supabase service-role keys server-side, signs the proof photo, asks Gemini pass/fail, writes the verdict, rolls back on fail. Model auto-discovery + fallback chain live here. |

## `supabase/` — database migrations (run by hand)
See `supabase/README.md` for the full run order. These define the tables, RLS,
and the award/verification RPCs (`complete_task`, `submit_completion`,
`rollback_completion`). Not imported by the app.

---

## `src/` — application code

### Entry & top-level
| Path | Used for |
|------|----------|
| `src/main.jsx` | React entry; renders `<App>` inside providers. |
| `src/App.jsx` | **Router + route guards.** Defines `/`, `/select`, `/mode-select`, `/dashboard`, `/accessories`, `/leaderboard`, `/admin` and the onboarding/auth redirects. |
| `src/index.css` | Global styles, design tokens, keyframes (glass cards, gold shimmer, evolution overlay, gilded bar…). |

### `src/pages/` — one file per route/screen
| Path | Used for |
|------|----------|
| `LoginPage.jsx` | Login / register (cinematic backdrop). |
| `EggHatchingPage.jsx` | **New-user onboarding** — pick a mystery egg → hatch → LV1 pet (route `/select`). |
| `PetSelectPage.jsx` | Old pet picker — **superseded by EggHatchingPage**, kept for reference (unused). |
| `GameModeSelectPage.jsx` | Choose game mode + hand-pick starter quests (the quest picker modal lives here). |
| `DashboardPage.jsx` | Main screen: companion, stats, quest log, care actions, header metrics. |
| `AccessoriesPage.jsx` | Cosmetic shop — buy/equip pet accessories. |
| `LeaderboardPage.jsx` | Player rankings. |
| `AdminPage.jsx` | Admin panel: overview, verification queue, cheat/targeting tools (admin-only). |

### `src/context/` — global state
| Path | Used for |
|------|----------|
| `GameContext.jsx` | **Central store.** Auth/profile, tasks, points, pet stats + decay, offline queue, completion/verification flow, evolution watcher, onboarding/hatch actions, notifications. Most game logic flows through here. |

### `src/components/` — reusable UI
| Path | Used for |
|------|----------|
| `TaskList.jsx` | Quest log: difficulty tabs, add/complete, cooldown/period display, opens the verification modal. |
| `VerificationModal.jsx` | Photo-proof capture (camera + upload), blank-frame block, progress-log, Gilded Waypoints stepper, verdict screen. |
| `PetAvatar.jsx` | Renders the companion (glow/aura/accessories) — draws the sprite via `PetSprite`. |
| `PetSprite.jsx` | Resolves + renders the stage sprite (`image-rendering: pixelated`), emoji fallback. |
| `EvolutionBar.jsx` | Progress-to-next-evolution bar. |
| `StatBar.jsx` | Hunger/cleanliness/happiness bars. |
| `StreakCounter.jsx` | Navbar daily-streak counter with milestone pulse. |
| `PlanningStats.jsx` | Research widget: the player's planning accuracy / on-time rate. |
| `Notifications.jsx` | Toast notification host. |
| `ConnectionStatus.jsx` | Online/offline + pending-completion indicator. |
| `CinematicBackground.jsx` | Login backdrop (video + Ken Burns + dust). |
| `ErrorBoundary.jsx` | Catches render errors so one crash can't blank the app. |

### `src/components/animations/` — motion/effects
| Path | Used for |
|------|----------|
| `EvolutionOverlay.jsx` | Full-screen evolution **and** egg-hatch celebration modal. |
| `ParticleBurst.jsx` | Radial star burst (used by the hatch). |
| `CompletionFx.jsx`, `CheckDraw.jsx`, `FloatingText.jsx` | Quest-completion reward effects. |
| `PageTransition.jsx` | Per-route enter animation wrapper. |
| `PortalLoader.jsx` | Login/auth "portal" loader. |
| `EmptyStatePet.jsx`, `TypingText.jsx` | Empty-state pet + typing text effects. |

### `src/components/reactbits/` — vendored [reactbits.dev] UI (MIT)
| Path | Used for |
|------|----------|
| `CountUp.jsx` | Animated number counter (header stats; `animateOnMount={false}` avoids the 0-flash). |
| `BlurText.jsx`, `ShinyText.jsx`, `GlareHover.jsx`, `Magnet.jsx`, `SpotlightCard.jsx`, `StarBorder.jsx` | Decorative text/hover/card effects. |
| `README.md` | Attribution/notes for the vendored set. |

### `src/config/` — app configuration
| Path | Used for |
|------|----------|
| `pets.js` | **Pet sprite/egg mapping** + stage thresholds; `getStageForPoints`, `spriteFor`, `eggFor`, `PET_TYPES`. Single source for which PNG renders. |

### `src/data/` — static content & constants
| Path | Used for |
|------|----------|
| `progression.js` | Evolution levels/thresholds, streak milestones, badge catalogue. |
| `pets.js` | The three companions (dragon/cat/wolf) — names, species, colors. |
| `presetQuests.js` | Starter quest pools per mode/difficulty (fed to the picker). |
| `accessories.js` | Cosmetic shop catalogue. |
| `difficulty.js` | Single source of difficulty colors (easy/medium/hard/boss). |

### `src/hooks/` & `src/lib/`
| Path | Used for |
|------|----------|
| `hooks/useReducedMotion.js` | Respects the OS "reduce motion" setting. |
| `lib/supabase.js` | Supabase browser client (anon key). |

---

## Where things live (quick index)
- **Add/change a screen** → `src/pages/` (+ a route in `src/App.jsx`).
- **Game rules / state** → `src/context/GameContext.jsx`.
- **Points/awards (server truth)** → `supabase/` RPCs (economy-critical — see that folder's README).
- **Pet art / evolution stages** → `src/config/pets.js` + `public/pets/`.
- **AI verification** → `api/verify.js` + `src/components/VerificationModal.jsx`.
- **Starter quests** → `src/data/presetQuests.js`.
