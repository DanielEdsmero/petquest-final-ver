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

## Done this session (ALL UNCOMMITTED — nothing is live yet)
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
