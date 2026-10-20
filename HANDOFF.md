# PetQuest handoff — 2026-10-18

Read this first in a new session. It replaces re-reading the old chat.

## What PetQuest is
- Grade 12 research project (Liceo de La Salle – Bacolod, Group 3). Paper: "PetQuest: a gamified task management system…"
  (Google Doc `1lUujGPU4iV1R4MDGleRjnatXVM7C6Ag2`, readable via `/mobilebasic`).
- Design: one-group pretest/posttest. Main data = Google Forms Likert surveys (1–4) on **goal setting, planning & scheduling,
  prioritization, time management**, analysed with weighted mean + paired t-test. App data (completions, points) is supporting evidence.
- Paper scope **excludes leaderboards**. Ethics: no personal identifiers.
- **The Expo phone app (`apps/mobile`) is the real product** students use. **The website is for show**: the panel at the defense,
  plus students signing up before they install the app. The website also hosts the admin tools researchers need.
- Live site: https://petquest-final-ver.vercel.app/ (deploys from git push). Backend: one shared Supabase project.

## Daniel's taste (also in `C:\Users\Daniel\WebsitesBrain\Websites\design\Likes and Dislikes.md`)
- Likes the phone app's light look: ivory `#FAF8F0`, navy ink `#102A43`, one teal action colour `#3F8580`
  (full palette: `apps/mobile/src/theme.ts`), painted pet homes, ring stats.
- Dislikes the old website look (dark purple space, gold glow, neon).
- Keep forms short: he removed goal + priority inputs from the quest form twice (commits 803b7db, fdf694d). Don't re-add them without asking.

## Done this session — LIVE since 2026-10-18
Website items (1–6, 8) were cherry-picked onto `main` (commits 832a102, 19cfaff) and deployed. The working branch
`mobile-expo-migration` is pushed too but NOT merged: it also carries `GameContext.jsx` changes that need
`supabase-phase13-spend-points.sql` and `-phase13b-signup-role.sql` run in Supabase first (not confirmed run).
Merging that branch into `main` before running them would break pet care and the shop on the live site.
1. Phone layout: `.dashboard-grid` used `1fr` → `minmax(0,1fr)` so the pet card no longer overflows 375px (`src/index.css`).
2. Speed: Admin/Leaderboard/Accessories/onboarding pages lazy-loaded (`src/App.jsx`). Main JS 1,086 KB → ~611 KB (gzip 316 → 183 KB).
3. Tap targets: `.tap-target` (44px min, phone only) on quest complete/delete + dashboard header buttons. Delete asks to confirm.
4. Admin **Export CSV** button (`src/pages/AdminPage.jsx`): one row per quest, account id only, no names/quest text.
   Query verified against live data (115 rows); the download itself not tested; no unit test for the CSV quoting yet.
5. **New landing page** `src/pages/LandingPage.jsx` at `/` for logged-out visitors (approved concept "B · Showcase + front door").
   Sections: nav, hero (app screenshot over Moonlit Cottage art), how it works, pets (real names/traits from `src/data/pets.js`),
   the study panel, closing CTA, footer. Images in `public/landing/` (WebP, cleaned pet cut-outs, `app-home.webp` = real app screenshot).
6. **Login moved to `/login`** and restyled light (`src/pages/LoginPage.jsx`). Logic untouched. `/login?mode=register` opens sign-up.
7. Expo web fix: `apps/mobile/src/lib/supabase.ts` uses default storage on web (SecureStore has no web build). Phone builds unaffected.
8. Test regex loosened for the `<Suspense>` wrapper (`tests/mascot-wake-loader.test.mjs`). 198/198 tests pass. `.superpowers/` gitignored.

Checked in the browser at 1440px and 375px: landing (no sideways scroll, nothing past the edge), login, register, the empty-form error.

## LIVE since 2026-10-19 (main 5078787)
- `mobile-expo-migration` merged into `main` (e10d820, conflicts only from main's cherry-picks; branch side kept) and deployed.
  Phase 13 + 13b confirmed in Supabase first (spend_points/care_pet answer; Daniel checked the 13b trigger).
- First Vercel build failed: Vite loaded `apps/mobile/tsconfig.json` (extends `expo/tsconfig.base`, not installed on Vercel).
  Fixed with `esbuild: { tsconfigRaw: '{}' }` in `vite.config.js` (5078787). Repro: hide `apps/mobile/node_modules`, run `npx vite build`.
- Checked live: `/` and `/login` render, new CSS bundle served, no console errors. Signed-in live pages not checked by Claude (Daniel signs in himself).
- All accounts are testers (no real participants yet), per Daniel.
- Work on `main` from now on; `mobile-expo-migration` is behind main by the merge + 3 small commits.

## Pet companion + first-login tour (2026-10-20, branch claude/laughing-tesla-hhbcqp, not merged)
- Mock-ups Daniel approved: art match https://claude.ai/artifact/UCKFtRUygJRN4Wg1CvhtD4, tour https://claude.ai/artifact/XWsUWhjJe82ed55yyXnqia. Website first; the phone app is not published.
- **Art match**: all three walking sprites were the wrong colour (dragon teal, cat lavender, wolf orange fox). Recoloured to the egg/portrait
  (dragon violet + pink, cat golden cream, wolf silver-blue) in `public/sprites/*` and the phone's `apps/mobile/assets/sprites/*/f1-f8.png`. Recolour, not repaint; the script is not in the repo.
  **Storm now lives in the Crystal Cavern**; the Sunlit Meadow is the pre-hatch fallback (`petHomeModel.ts`). Crystal Cavern got a food spot (`spriteModel.ts`) and the mood test covers all four homes.
- **1920 screens**: `index.css` raises the root font to 19px at >=1600px (23px at >=2300px) and the dashboard/accessories container is `max-w-[92rem]` there. Everything is rem-based so it all scales.
- **Roaming pet**: `RoamingPet.jsx` is a fixed overlay (dashboard, accessories, leaderboard). It announces a walk, poofs out of its room, walks to `data-pet-spot` elements, lights them up, speaks, walks home. Auto-walks every 40-80 s; "Let <pet> out", "Do not disturb" (this browser), reduced motion = no walking. Stays home while `[data-pet-quiet]`/`[role=dialog]` is open.
- **Tour (visual novel)**: `PetGuide.jsx`. Big pet (cleaned portraits in `public/guide/`) talks in a dialogue bar coloured per pet; the small pet runs (fast, no announcement) to the real quest form and care card, which are lit up. The lit area stays clickable; everything else is blocked. Steps: hello, quests, practice selfie, care, done. Keyboard: Enter/Space/right arrow, Esc skips. Phones: no big pet, a small avatar on the dialogue.
  The tour never creates data: the quest form is real and the student may use it, but Next works without. Selfie is PRACTICE ONLY (`SelfiePractice.jsx`): memory only, camera off after, a test greps both files for network/storage use.
  Done flag is per account per browser (`pq_guide_done:<id>`), no migration. "Replay the tour" on the dashboard.
- Logic in `src/data/petCompanion.js`, state in `src/context/CompanionContext.jsx`. New spot: add `data-pet-spot` + a case in `lineForSpot`.
- Checked in a browser with Supabase stubbed: full tour at 1920x1080 for wolf, dragon and cat, and at 375px. NOT checked: real login, the 40-80 s auto-walk, walking on accessories/leaderboard, the camera on a real device.
- Known unrelated failure: `apps/mobile/tests/auth.test.ts` "sessions persist and auto-refresh" expects `sessionStorage` (the Expo web storage change broke that regex). Fails without these changes too.

## Restyle progress (2026-10-18, local, not committed)
- **Dashboard done** (approved layout A): `.theme-light` scope in `src/index.css` re-points the dark tokens; pages opt in with
  `className="theme-light ... relative z-10"`. Dashboard grid = `.dash-layout` (phone: pet → quests → care → evolution → shop).
- `src/components/PetRoom.jsx`: painted home + wandering pet. It imports the phone app's pure models
  (`apps/mobile/src/data/spriteModel.ts`, `moodModel.ts`, `petHomeModel.ts`) so habits live in one place. Assets: `public/homes/*.webp`,
  `public/sprites/{cat,dragon,wolf}/*.webp` (converted from `apps/mobile/assets`). Older stages: evolution art moves, no walk frames.
- `StatBar.jsx` deleted (rings in the Dashboard instead). TaskList uses local light difficulty/validity colours (comment says why).
- **Accessories done** (approved layout B: room banner + one sideways shelf per category). Equipped glyphs float over the pet (PetRoom `accessories` prop), on Dashboard too. `PetAvatar.jsx` deleted; `RARITY_COLORS` now light.
- **Admin Verification queue done** (approved list + detail; "verification panel" = the admin queue, not the student modal). Light only while on that tab: `light` flag in `AdminPage` (shortcut comment).
- **Admin panel done** (approved B): whole page light, Overview = research only, testing tools on a 🧪 Testing tab, Quest Validity = list + detail. `light` flag removed; VALIDITY_META colours now light (shared).
- **Egg hatching done** (approved A: three egg cards → "Meet <pet>" card with PetRoom). Dragon/wolf egg PNGs de-hazed.
  Checked via a temporary mock-data preview (`.preview/` + `preview-egg.html`, launch entry `petquest-preview`; not committed — delete when done).
- **Mode select done** (approved B: three steps mode → difficulty → quests). Shared light `DIFFICULTY_TEXT` in `src/data/difficulty.js`.
- **Loader done** (approved B: pet wakes up in its home, `inHome` prop on MascotWakeLoader). Tests updated (Skip 44px, size 96).
- **Toasts + evolution done** (toasts B: navy pill bottom-centre; celebration A: white reveal card).
- **Leaderboard done** (Daniel keeps it despite the paper; approved B: podium + list, own row pinned past rank 8).
- **Every signed-in page is now light.** Temporary mock preview harness removed.
- **Dead code removed**: PetSelectPage, CinematicBackground, PlanningStats, TypingText, reactbits StarBorder/ShinyText/SpotlightCard/GlareHover/Magnet,
  31 unused CSS rules + 3 orphan keyframes (index.css 687 → 441 lines, CSS bundle 34.8 → 28.2 KB), star-movement in tailwind.config.js.
  The dark `:root` tokens stay: `.theme-light` overrides them and the pre-theme fallbacks still read them.
  `PetSelectPage.jsx` is not routed anywhere (dead code; delete with Daniel's OK).

## Next task: restyle the signed-in website pages to match the app
- Pages: Dashboard, Accessories, Leaderboard, EggHatching, GameModeSelect, PetSelect, Admin (+ components: TaskList, StatBar,
  EvolutionBar, PetAvatar, Notifications, VerificationModal, MascotWakeLoader). All built on the dark theme in `src/index.css`
  (`--bg-deep`, `.glass-card`, `.btn-gold`, `.input-field`, Cinzel font).
- Suggested approach: swap the CSS variables/classes in `src/index.css` to the light palette first (one place), then fix pages one by one.
- Daniel approved this as the second step but no detailed design yet: brainstorm briefly, show a mockup, then build.

## Open decisions for Daniel
- **Commit + push** to deploy all of the above (he hasn't approved yet).
- **Leaderboard** is in the website nav but the paper excludes leaderboards (research confound). The app has none.
- **Quest delete is a hard delete**: removes research data. A soft delete needs a Supabase migration he runs himself.
- Keep or drop the CSV export (Supabase dashboard can export too).
- App: "Overdue" labels on a new student's first day may discourage; review the Quests/Pet/Profile tabs (only Home was reviewed).

## Gotchas
- `body::before` in `src/index.css` is a fixed dark layer at z-index 0. New light pages need `relative z-10` on their root or they render dark.
- Claude must not type passwords into the live site or local dev (both hit the real Supabase). Daniel signs in himself in the browser pane.
- Run the site: `.claude/launch.json` in `C:\Users\Daniel\WebsitesBrain` has `petquest-web` (Vite, :5173) and
  `petquest-mobile-web` (Expo web, :8081). The Expo web dev overlay shows a harmless `collapsable` warning from `StatusRing.tsx`.
- Some tests assert exact source text (e.g. `LoginPage.jsx` strings like "Invalid email or password", the ⚙️ spinner). Run `npm test` after edits.
- Review notes: `C:\Users\Daniel\WebsitesBrain\Websites\design\reviews\2026-10-18 PetQuest review.md`.
