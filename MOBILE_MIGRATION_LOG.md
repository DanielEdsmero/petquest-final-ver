# PetQuest — Mobile Migration Log

Running record of the Expo/iOS migration. One entry per phase, each with its commit,
changed files, rollback command, and the web regression result.

**Policy:** the mobile client is experimental until explicitly approved. It lives on
`mobile-expo-migration` and (from Phase 1) under `apps/mobile/`. `main` keeps serving
the Vite web app. No phase merges to `main` without a passing web regression check.

**Web regression check (run at the end of every phase):**

```bash
npm test        # expect 131 passing (baseline at Phase 0)
npm run build   # expect a clean Vite build
```

---

## Phase 0 — Repository audit and migration map

| | |
|---|---|
| **Branch** | `mobile-expo-migration` (from `main` @ `8912f99`) |
| **Commit** | `git log --oneline --grep='mobile phase 0'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete — awaiting review before Phase 1 |

### Files changed

| File | Change |
|---|---|
| `MOBILE_MIGRATION_MAP.md` | **added** — the audit |
| `MOBILE_MIGRATION_LOG.md` | **added** — this log |

**Web files changed: none.** No edits to `src/`, `api/`, `supabase/`, `public/`,
`package.json`, `vite.config.js`, `vercel.json`, or any environment file.

### Commands run

```bash
git checkout main && git pull
git checkout -b mobile-expo-migration
npm test        # 131 passed, 0 failed
npm run build   # built in 6.19s
```

### Web regression result

✅ **Pass** — 131/131 tests, clean build. Identical to the `main` baseline, as
expected for a documentation-only phase.

### Migrations / server changes

None. No SQL was added, altered, or run. No Vercel function was touched.

### Environment variables required

None new. Phase 1 will introduce `apps/mobile/.env` with **public values only**:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`.

### Risk to the existing web application

**None.** Two new Markdown files at the repository root; nothing the web build reads.

### Rollback

```bash
# Undo this phase (keep the branch). Resolved by message so it stays correct
# even if the commit is amended or rebased:
git revert $(git log --format=%H --grep='mobile phase 0' -1)

# Or drop the whole mobile effort — main is untouched:
git checkout main
git branch -D mobile-expo-migration
```

### Findings that need a decision before Phase 5

1. 🔴 **`api/verify.js` is unauthenticated.** It accepts `{ completion_id }` with no
   bearer token and no ownership check, so any caller who learns a completion id can
   force a verdict — including a `fail`, which triggers `rollback_completion` against
   another participant's points. Pre-existing on web; **must be fixed before the
   mobile client calls it** (Phase 5). Worth patching on `main` independently.
2. 🟡 **`complete_task` dead client path.** `GameContext.completeTask()` and
   `flushPending()` still call the RPC directly, but Phase 8 revoked it from
   `authenticated`. Those calls fail with *permission denied*; the live path is
   `submit_completion`. Not ported to mobile; flagged for a separate web fix.
3. 🟡 **Email confirmation is web-only.** `register()` handles the "check your email"
   case, and that link opens a web URL. Phase 2 decides whether mobile signup stays
   web-confirmed or gains a `petquest://` redirect entry in Supabase Auth.
4. 🟢 **No CORS work needed.** React Native `fetch` is not CORS-constrained, so the
   existing same-origin functions work unchanged from Expo Go. CORS would only matter
   if Expo Web became a target.

---

## Phase 1 — Isolated Expo shell

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 1'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete on the dev machine — **Expo Go / physical iPhone check is user-required** |

### What was added

`apps/mobile/` — an Expo Router + TypeScript app, scaffolded from
`create-expo-app@latest` (**Expo SDK 57**, React Native 0.86.3, React 19.2.3,
expo-router 57) and then stripped back to a PetQuest shell.

| Path | Purpose |
|---|---|
| `apps/mobile/package.json` | **Own** manifest, `name: petquest-mobile`. No workspaces. |
| `apps/mobile/app.json` | Name **PetQuest**, slug `petquest`, scheme `petquest`, bundle id `com.yourresearchgroup.petquest`, dark UI, `#06061a` splash |
| `apps/mobile/tsconfig.json` | From the template, `strict: true`, `@/*` path alias |
| `apps/mobile/src/app/_layout.tsx` | Root Stack + SafeAreaProvider + light status bar |
| `apps/mobile/src/app/index.tsx` | Branded home screen + public-config report |
| `apps/mobile/src/components/ScreenContainer.tsx` | Safe area, keyboard avoidance, gutters, max width |
| `apps/mobile/src/theme.ts` | PetQuest palette/spacing/type, **ported** from the web tokens |
| `apps/mobile/src/lib/env.ts` | Public env accessor + the written security contract |
| `apps/mobile/assets/images/*` | Icon, splash, adaptive icon, favicon — generated from the dragon art |
| `apps/mobile/.env.example` | The three public values, with an explicit never-add list |
| `apps/mobile/README.md` | Setup, isolation and **how to remove the folder** |

Template demo content removed: `explore.tsx`, all demo components/hooks/constants,
`global.css`, `scripts/reset-project.js`, `AGENTS.md`, `CLAUDE.md`, `.claude/`,
`.vscode/`, `LICENSE`, and the Expo/React logo and tab-icon assets. Four demo-only
dependencies were dropped from the template manifest (`@expo/ui`,
`expo-glass-effect`, `expo-symbols`, `expo-device`).

### Copied / duplicated from the web app, and why

Per the Phase 1 decision, isolation beats sharing: no workspaces, no shared
package. So far **no web JavaScript module has been copied verbatim**. One file is
a hand port:

| Mobile file | Derived from | Why |
|---|---|---|
| `src/theme.ts` | `src/index.css` (`:root` tokens) + `tailwind.config.js` (`theme.extend.colors`) | CSS custom properties cannot be consumed by React Native; the values are retyped as TS constants so both clients look like one product |

`config/pets.js` and `data/*.js` are **not** copied yet — they are only needed once
quest and pet screens land (Phase 4). They will be copied then, and each copy
recorded here.

> **Drift risk:** `theme.ts` now duplicates the brand palette, and Phase 4 will
> duplicate the evolution thresholds, difficulty colours and pet metadata. The
> Phase 8 parity test must assert these against the web originals so they cannot
> silently diverge.

### Styling decision (needs a nod)

React Native `StyleSheet` + `src/theme.ts`, **not NativeWind**. NativeWind needs a
Babel plugin, a Metro config and its own Tailwind config — extra moving parts in an
experimental shell — and it can be adopted later without touching screen logic.

### Email confirmation (as decided)

Unchanged and web-based. The `petquest` scheme is declared in `app.json`, but **no
Supabase Auth redirect URL was added** and the web confirmation flow was not
touched. Native deep-link confirmation is deferred until login, session
restoration and logout are proven on device.

### Commands run

```bash
npx create-expo-app@latest apps/mobile --template default --no-install
cd apps/mobile && npm install          # 605 packages
npx tsc --noEmit                       # exit 0
npx expo export --platform ios --clear # bundled: 2.4 MB Hermes bytecode
npx expo start                         # /status 200; iOS dev bundle 200, 4.2 MB
```

### Secret-leak verification (negative test)

A temporary `.env` was created containing the three public values **and** two
deliberately-marked fake private keys, then the app was exported and the shipped
Hermes bundle scanned. The temporary `.env` was deleted afterwards.

| Marker | In `.env` | In bundle |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` value | yes | ✅ 1 hit (expected — public by design) |
| `EXPO_PUBLIC_SUPABASE_URL` project ref | yes | ✅ 1 hit (expected) |
| `EXPO_PUBLIC_API_BASE_URL` host | yes | ✅ 1 hit (expected) |
| `GEMINI_API_KEY` value | yes | **0 hits** |
| `SUPABASE_SERVICE_ROLE_KEY` value | yes | **0 hits** |
| the literal `service_role` | — | **0 hits** |

Un-prefixed variables are not inlined by the Expo bundler, so a private key placed
in the mobile `.env` by mistake still cannot reach the app.

### Web regression result

✅ **Pass** — 131/131 tests, clean Vite build, both before and after the phase.

| Isolation check | Result |
|---|---|
| Web files changed (`src`, `api`, `supabase`, `public`, configs) | **none** — `git diff main` is empty for those paths |
| Root `package.json` / `package-lock.json` | untouched |
| `workspaces` field at root | absent |
| `apps/mobile/node_modules` | git-ignored |

### Migrations / server changes

None. No SQL, no Supabase function, no RLS policy, no Vercel setting.

### Environment variables required

`apps/mobile/.env` (git-ignored), created from `.env.example` — public only:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_API_BASE_URL`.

### Risk to the existing web application

**None identified.** The mobile app is a sibling folder with its own manifest and
lockfile; nothing at the root resolves into it and nothing in it resolves out.

### Rollback

```bash
# Remove the mobile app, keep everything else:
git rm -r apps/mobile && git commit -m "remove mobile shell"

# Or revert the phase commit:
git revert $(git log --format=%H --grep='mobile phase 1' -1)

# Or discard the whole effort — main is untouched:
git checkout main && git branch -D mobile-expo-migration
```

### User-required verification (cannot be done from this machine)

- [ ] Scan the QR code from `npx expo start` with the iPhone camera and open in Expo Go
- [ ] Confirm the PetQuest home screen renders, with the dragon, the navy theme and the gold title
- [ ] Confirm the layout clears the notch and the home indicator
- [ ] Confirm the config card reads the project ref after `.env` is filled in

---

## Phase 2 — Supabase authentication and session foundation

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 2'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete on the dev machine — **on-device sign-in / relaunch / sign-out is user-required** |

Phase 1 was confirmed on a physical iPhone before this phase began: the home
screen rendered, safe areas cleared the notch and home indicator, and the config
card showed the right Supabase ref and API host.

### Files added

| Path | Purpose |
|---|---|
| `src/lib/chunkedStorage.ts` | Byte-aware chunking over a key/value store; pure, no RN imports |
| `src/lib/supabase.ts` | The client — public URL + anon key, SecureStore session storage, foreground-driven auto-refresh |
| `src/auth/AuthProvider.tsx` | The single source of auth truth: session, profile, role, sign-in/out |
| `src/auth/guards.ts` | Pure route-guard decisions, error mapping and credential validation |
| `src/components/LoadingScreen.tsx` | Session-restoring screen (the Phase 6 mascot loader replaces it) |
| `src/app/(auth)/login.tsx` | Email + password sign-in |
| `src/app/admin/_layout.tsx` | Role gate for the admin group |
| `src/app/admin/index.tsx` | Admin placeholder that exists to exercise the gate |
| `tests/auth.test.ts` | 36 unit tests |
| `tsconfig.tests.json` | Node-flavoured typecheck, kept out of the app's type space |

Changed: `src/app/_layout.tsx` (AuthProvider + guard), `src/app/index.tsx`
(signed-in placeholder), `package.json`, `tsconfig.json`, `README.md`.

### Dependencies added

`@supabase/supabase-js` ^2.116.0 · `expo-secure-store` ~57.0.4 ·
`react-native-url-polyfill` ^4.0.0 · dev: `@types/node`.
Installed with `npx expo install` so the versions match SDK 57. The
`expo-secure-store` config plugin was added to `app.json` automatically.

### The one non-obvious engineering problem

**A Supabase session does not fit in SecureStore.** SecureStore warns above 2048
bytes and a future SDK will throw; a real session (access JWT + refresh token +
serialised user) runs 2–4 KB. Stored naively the write is dropped and the
participant is silently logged out on every relaunch.

`createChunkedStorage` splits the value across `<key>.0`, `<key>.1`, … with a
manifest under the caller's own key. Specifics that matter:

- **Byte-aware, not character-aware** — the limit is on encoded bytes, and a
  username may be non-ASCII. Slices are measured with `TextEncoder` and never
  cut a multi-byte character or a surrogate pair in half.
- **Chunks written before the manifest** — an interrupted write leaves a stale
  or absent manifest, never one pointing at slices that do not exist.
- **A torn entry reads as `null`**, not as a truncated session, so a corrupted
  keychain lands on the login screen instead of a confusing auth error.
- **Old chunks are cleared before a rewrite**, so a shorter session cannot leave
  a stale tail behind.

### Security posture

- Client built from `EXPO_PUBLIC_SUPABASE_URL` + anon key only; a test asserts
  the file never references a service-role or Gemini key.
- `detectSessionInUrl: false` — there is no `window.location` in React Native.
- Admin access is decided by the server-sent `profiles.role`. No profile, a
  failed fetch, or an unexpected value all mean **not admin** — it fails closed.
- Route guards are documented in code as **UX, not security**: RLS and the
  server-side role checks are the actual control.
- A slow profile fetch cannot apply to a different user — the result is
  discarded unless it still matches the active user id.

### Commands run

```bash
npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill
npm install --save-dev @types/node
npm test                                  # 36 passed, 0 failed
npm run typecheck                         # app + tests, clean
npx expo export --platform ios --clear    # 3.0 MB Hermes bundle (was 2.4 MB)
npx expo start                            # /status 200; generated .expo/types
```

### Verification done here

| Check | Result |
|---|---|
| Unit tests | ✅ 36/36 — chunking round-trip, torn entries, unicode, guards, error mapping |
| TypeScript | ✅ app and tests both clean |
| iOS bundle | ✅ compiles, 3.0 MB |
| Secret scan of the shipped bundle | ✅ `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `gemini`, `generativelanguage` → **0 hits each**; the public project ref is present, as expected |
| Live auth endpoint probe | ✅ one bogus-credential POST to the real project returned HTTP 400 `invalid_credentials` / "Invalid login credentials" — confirms the URL and anon key work and that `friendlyAuthError` maps the real message |

### Web regression result

✅ **Pass** — 131/131 tests, clean Vite build. `git diff main` lists **no** web
files changed (`src`, `api`, `supabase`, `public`, root configs).

### Migrations / server changes

None. No SQL, no RPC, no RLS policy, no Supabase Auth setting (no redirect URL
was added), no Vercel change. Phase 2 only *reads* `profiles` through existing
policies.

### Environment variables required

Unchanged from Phase 1 — the same three public values in `apps/mobile/.env`.

### Risk to the existing web application

**None identified.** Nothing outside `apps/mobile/` was touched. The mobile app
authenticates as an ordinary Supabase user against the same RLS the web client
already obeys.

### Notes for later phases

- `.expo/types/router.d.ts` (typed routes) is generated by the dev server and is
  git-ignored, so a fresh clone must run `npx expo start` once before
  `npm run typecheck` compiles typed `href` values. Documented in the README.
- The tests run TypeScript directly under `node --test` (Node 24 strips types),
  so the project still carries no test framework. Anything importing React
  Native needs the Phase 8 device/integration suite.
- `LoadingScreen` is the placeholder the Phase 6 mascot wake-up loader replaces.

### Rollback

```bash
# Undo just this phase, keeping the Phase 1 shell:
git revert $(git log --format=%H --grep='mobile phase 2' -1)

# Remove the mobile app entirely:
git rm -r apps/mobile && git commit -m "remove mobile client"

# Or discard the whole effort — main is untouched:
git checkout main && git branch -D mobile-expo-migration
```

Nothing to undo on the server.

### User-required verification (cannot be done from this machine)

- [ ] Sign in on the iPhone with a **non-production test account**
- [ ] Force-quit and reopen Expo Go — the session restores without a re-login
- [ ] Sign out — the app returns to login and does not restore on relaunch
- [ ] As an ordinary user, confirm no "Admin area" button appears
- [ ] As an admin, confirm the button appears and `/admin` opens
- [ ] Wrong password shows "Invalid email or password." and does not crash
- [ ] Airplane mode shows the connection message rather than hanging

---

## Phase 3 — Mobile shell and navigation

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 3'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete on the dev machine — **on-device navigation walk-through is user-required** |

Phase 2 was confirmed on a physical iPhone before this phase began: sign-in,
relaunch session restore, sign-out and the admin gate all worked.

### Route tree

```
src/app/
  _layout.tsx            root: SafeAreaProvider, AuthProvider, guard, Stack
  (auth)/login.tsx       signed out only
  (tabs)/                the signed-in app
    _layout.tsx          bottom tabs: Home, Quests, Pet, Profile
    index.tsx  quests.tsx  pet.tsx  profile.tsx
  quest/                 pushed over the tabs, native header
    _layout.tsx  create.tsx  [id].tsx  verify.tsx
  admin/                 role-gated, deliberately NOT a tab
    _layout.tsx  index.tsx  validity.tsx  verification.tsx
```

`src/app/index.tsx` was **moved** into `(tabs)/index.tsx`, not copied — two files
claiming `/` would be an ambiguous route.

### Files added

`(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/quests.tsx`, `(tabs)/pet.tsx`,
`(tabs)/profile.tsx`, `quest/_layout.tsx`, `quest/create.tsx`, `quest/[id].tsx`,
`quest/verify.tsx`, `admin/validity.tsx`, `admin/verification.tsx`,
`src/components/states.tsx`, `tests/navigation.test.ts`.

Changed: `src/app/_layout.tsx` (route groups declared), `src/app/admin/_layout.tsx`
and `admin/index.tsx` (headers + queue links), `src/components/ScreenContainer.tsx`
(per-edge inset control), `tests/auth.test.ts`, `README.md`.
Removed: `src/app/index.tsx` (moved into the tab group).

### Dependencies added

`@expo/vector-icons` ~15.1.1 only, via `npx expo install`. The bottom-tab
navigator comes from `expo-router` itself — no separate React Navigation install.

### Design decisions

- **Admin is not a tab.** It is a separate route group so an ordinary
  participant never sees it in the chrome, and so the role gate has exactly one
  entry point (`app/admin/_layout.tsx`).
- **Native headers on the pushed stacks** rather than custom back buttons, so
  the iOS swipe-back gesture and system back behaviour work without being
  reimplemented.
- **Per-edge safe-area control.** `ScreenContainer` gained `insetTop` and
  `insetBottom`. Tab screens pass `insetBottom={false}` (the tab bar already
  clears the home indicator and the scene sits above the bar — applying the
  inset again pads twice); headered screens pass `insetTop={false}`.
- **FlatList from the start** on the quest log and both admin queues, with
  `scroll={false}` on the container. A mapped `ScrollView` would have to be
  rewritten in Phase 4, and nesting a list inside a scroll view breaks
  virtualisation.
- **Four explicit states** in `src/components/states.tsx` (loading / empty /
  error / card). An empty list and a failed load are separate components on
  purpose: telling a participant "no quests yet" when the request actually
  failed would send them to create a quest they may already have.
- **Placeholders show a dash, never a plausible number.** Nothing on screen can
  be mistaken for real research data before Phase 4 wires Supabase.

### A trap worth recording

Mid-phase, `tsc` reported a phantom route `/../components/states` and a missing
`/`, which looked like an Expo Router bug. It was not. Two of my `expo start`
invocations wrote their log to `$TMPDIR/...` with `TMPDIR` unset, so the
redirect failed, **Metro never started**, and a partial `.expo/types/router.d.ts`
was left behind. With Metro actually running and the cache cleared, the
generated union is correct — `/` present, phantom gone.

Lesson for later phases: `.expo/types/router.d.ts` is only trustworthy if the
dev server is confirmed up. If typed-route errors look nonsensical, delete
`.expo/`, run `npx expo start -c`, and verify `/status` returns 200 before
believing `tsc`. Documented in the README.

One real bug was found the same way: `"scroll-outline"` is not a valid Ionicons
glyph (now `"reader-outline"`) — it would have rendered nothing on device.

### Commands run

```bash
npx expo install @expo/vector-icons
npm test                                  # 65 passed, 0 failed
npm run typecheck                         # app + tests, clean
npx expo start -c                         # /status 200, dev bundle 200
npx expo export --platform ios --clear    # 3.5 MB Hermes bundle (was 3.0 MB)
```

### Verification done here

| Check | Result |
|---|---|
| Unit tests | ✅ 65/65 (36 auth + 29 navigation) |
| TypeScript | ✅ app and tests clean, against freshly generated typed routes |
| Metro | ✅ `/status` 200 and the iOS dev bundle serves 200 |
| iOS production bundle | ✅ compiles, 3.5 MB |
| Secret scan of the bundle | ✅ `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `generativelanguage` → 0 hits each |

The navigation tests assert the things that break silently and are tedious to
catch by hand: the route tree, every screen having a default export, tab order,
the safe-area contract per screen, FlatList + `scroll={false}` on list screens,
that every pushed route is reachable from a tab, that both admin queues are
linked, and that no screen declares a `minWidth` or a fixed width above 288pt
(320 minus the gutters) which would force a horizontal scroll on an iPhone SE.

### Web regression result

✅ **Pass** — 131/131 tests, clean Vite build. `git diff main` lists **no** web
files changed.

### Migrations / server changes

None. Phase 3 adds no query, no RPC call and no server request at all.

### Environment variables required

Unchanged — the same three public values in `apps/mobile/.env`.

### Risk to the existing web application

**None identified.** Nothing outside `apps/mobile/` was touched.

### Rollback

```bash
# Undo just this phase, keeping phases 0-2:
git revert $(git log --format=%H --grep='mobile phase 3' -1)

# Remove the mobile app entirely:
git rm -r apps/mobile && git commit -m "remove mobile client"

# Or discard the whole effort — main is untouched:
git checkout main && git branch -D mobile-expo-migration
```

### User-required verification (cannot be done from this machine)

- [ ] All four tabs open, and the active tab is highlighted in gold
- [ ] Tab labels and content sit **above** the home indicator, not under it
- [ ] Quests → **+** → New quest, and the header back arrow returns to the list
- [ ] The iOS swipe-from-left-edge gesture also goes back
- [ ] Quest detail → Submit evidence → back, twice, returns to the tabs
- [ ] Profile → Admin area (admins only) → each queue → back
- [ ] As a non-admin, the Admin row is absent
- [ ] The empty quest log shows "No quests yet" with a working Create button
- [ ] Pull-to-refresh on the quest log spins and stops
- [ ] Sign out from Profile still returns to login
- [ ] Nothing scrolls sideways on the smallest device you have

---

## Phase 4A/4B — Dashboard, quest list and quest creation

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 4a/4b'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete on the dev machine — **on-device verification is user-required**. Phase 4C–4F not started. |

Phase 3 was confirmed on a physical iPhone before this phase began.

Phase 4 was split deliberately: **4A (dashboard) and 4B (quest list + creation)**
are done and reviewable. 4C (quest detail + completion), 4D (evidence), 4E
(verification progress) and 4F (pet) follow after review, because 4C onwards
touch the award path and deserve their own pass.

### ⚠️ One decision that changes what the study collects

The Phase 4 brief asks the create form to collect a **goal statement** and a
**P1/P2/P3 priority**. The mobile form does **not**, because the web form does
not any more: they were removed in commit `fdf694d` ("Remove goal statement +
priority inputs from the quest form") and are optional server-side.

Collecting them on mobile would mean the two clients gather **different fields
for the same study**, which is worse than either choice on its own. The columns
still exist and the endpoint still accepts them, so adding them back is additive
and non-breaking — **but it should be done on both clients at once.** Say the
word and I will add them to web and mobile together.

### Files added

| Path | Purpose |
|---|---|
| `src/data/petModel.ts` | Evolution stages, thresholds, progress — **no imports**, so it is unit-testable |
| `src/data/petSprites.ts` | The literal `require()` sprite table + `spriteFor()` |
| `src/data/quests.ts` | Difficulties, evidence types, validity badges, period caps, draft validation |
| `src/data/taskModel.ts` | The `Task` row shape + `summariseTasks()` — pure |
| `src/data/tasks.ts` | Supabase reads over `tasks` |
| `src/lib/questApi.ts` | `POST /api/validate-quest` with the bearer token |
| `src/lib/useAsyncData.ts` | Loading / error / refetch-on-focus helper |
| `assets/pets/*.png` | The 12 evolution sprites |
| `tests/quests.test.ts` | 34 tests, including the parity block |

Changed: `(tabs)/index.tsx` (live dashboard), `(tabs)/quests.tsx` (live log),
`quest/create.tsx` (the real form), `ScreenContainer.tsx` (`refreshControl`
prop), `AuthProvider.tsx` (progression columns).

### Copied from the web app — the running list

| Mobile file | Copied from | Guarded by |
|---|---|---|
| `src/theme.ts` | `src/index.css` + `tailwind.config.js` | (visual only) |
| `src/data/quests.ts` | `src/data/questValidity.js`, `src/data/difficulty.js`, the caps inside `GameContext.addTask()` | parity tests |
| `src/data/petModel.ts` | `src/config/pets.js`, `src/data/progression.js` | parity tests |
| `assets/pets/*.png` | `public/pets/*_lv*.png` | asset-existence test |

**The parity tests are the payoff of this phase.** They read the *web* files at
test time and compare: difficulty colours, evidence-type ids (against both the
web copy **and** the server enum in `api/_lib/quest-validity.js`), validity
labels, the check explainer word-for-word, the check steps, the eligibility
rule, the period windows, and the evolution thresholds — the last of these
against `supabase-phase6-research-metrics.sql`, since the server's `pet_level`
CASE is the real authority. If anyone edits a constant on one side only, mobile
`npm test` fails.

### Assets

The 12 evolution sprites were trimmed, quantised to 320px PNG-8 and copied:
**4.6 MB → 461 KB** (the largest on-screen use is ~140pt, and they are pixel art
that upscales cleanly). Eggs were not copied — hatching stays on the web.

### Architecture note

Each data area is split into a **pure model** and a **thin IO layer**
(`petModel` / `petSprites`, `taskModel` / `tasks`). That was forced by a real
constraint: `node --test` cannot resolve Metro's `@/` alias or run an asset
`require()`, so anything importing React Native is untestable here. Splitting
made the rules testable and left the IO layer thin enough to read at a glance.

No `@tanstack/react-query`. `useAsyncData` is ~60 lines and covers what a tabbed
app needs — refetch on focus, drop responses that arrive after unmount or after
a newer request, and keep old data on screen when a refresh fails rather than
blanking the list. If the data layer grows past that, react-query slots in
behind the same hook shape.

### Server authority

Nothing here decides an outcome:

- Quest creation is **only** `POST /api/validate-quest` with the participant's
  access token; the server derives the user id from the token and writes the row
  with the service role. A direct insert would be forced to `pending_ai_review`
  by the `tasks_validity_guard` trigger anyway.
- The `tasks` module has **no insert or update path at all** — only reads and a
  delete of the participant's own row.
- Points, streak and level are rendered straight from the `profiles` row.
- Admin-only validity columns (`validity_admin_reason`, risk flags, model
  version) are never requested.
- Tests assert each of these, including that an unloaded figure renders as a
  **dash, never a zero** — "0 points" and "not loaded yet" mean very different
  things in a study.

### Commands run

```bash
npx expo install @react-native-community/datetimepicker
npm test                                  # 100 passed, 0 failed
npm run typecheck                         # app + tests, clean
npx expo export --platform ios --clear    # 3.6 MB Hermes bundle
```

### Verification done here

| Check | Result |
|---|---|
| Unit tests | ✅ 100/100 (36 auth + 29 navigation + 35 quest/parity) |
| TypeScript | ✅ app and tests clean |
| iOS bundle | ✅ compiles, 3.6 MB |
| Secret scan | ✅ 0 hits for every private-key marker |
| Sprite assets | ✅ all 12 referenced files exist and are bundled |

### Web regression result

✅ **Pass** — 131/131 tests, clean Vite build, **no** web files changed.

### Migrations / server changes

None. Phase 4A/4B only reads existing tables and calls the existing
`/api/validate-quest`.

> The `/api/verify` authentication gap recorded in Phase 0 is **still open**. It
> is not reached by 4A/4B, but 4D/4E will call it — it must be fixed before then
> (it is Phase 5's first item).

### Environment variables required

`EXPO_PUBLIC_API_BASE_URL` now genuinely matters: without it, quest creation
reports "not configured on this device" instead of calling the endpoint.

### Risk to the existing web application

**None identified.** Read-only against shared tables, plus the same endpoint the
web client already calls. Quests created on the phone are ordinary rows the web
app shows without changes.

### Rollback

```bash
git revert $(git log --format=%H --grep='mobile phase 4a/4b' -1)
# or remove the client entirely:
git rm -r apps/mobile && git commit -m "remove mobile client"
```

### User-required verification (cannot be done from this machine)

**Use a non-production test account.** Creating a quest writes a real row and
spends a real Gemini call.

- [ ] Dashboard shows your real companion sprite, points and streak
- [ ] The evolution bar shows "N points to <next stage>"
- [ ] Pull-to-refresh updates both the profile and the quest counts
- [ ] Quest log lists your real quests; the Easy/Medium/Hard tabs filter
- [ ] A quest with a validity status shows its badge
- [ ] Create a good Easy quest → accepted → appears in the log
- [ ] Create a vague quest ("study a bit") → "Almost there", nothing saved, draft kept
- [ ] Medium/Hard without a planned date → the submit button stays disabled
- [ ] The date picker opens and the chosen date sticks
- [ ] Create a second Hard quest in the same week → the cap message appears
- [ ] Airplane mode → "Cannot reach the quest check", no crash, draft kept
- [ ] A quest created on the phone is visible on the **web** app, and vice versa

---

## Phase 4C — Quest detail and verification state

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 4c'` |
| **Date** | 2026-09-13 |
| **Status** | ✅ Complete on the dev machine — **on-device verification is user-required**. 4D/4E are **blocked**, see below. |

Phase 4A/4B was confirmed on a physical iPhone before this phase began,
including the cross-client check (a quest created on the phone appears on the
web app and vice versa).

### 🚧 Why this phase stops where it does

4C was scoped to "quest detail and completion". **Completion cannot be built
yet**, and the reason is structural rather than a matter of effort:

1. `complete_task` is revoked from clients (supabase-phase8), so the only way to
   complete a quest is `submit_completion()`.
2. `submit_completion()` **requires a photo path and a ≥20-character progress
   log**. Completion is therefore inseparable from evidence capture, which is
   4D.
3. 4D's flow ends by calling `/api/verify` — and that endpoint still accepts
   `{ completion_id }` with **no bearer token and no ownership check** (the
   Phase 0 finding). Anyone who learns a completion id can force a verdict,
   including a `fail`, which triggers `rollback_completion` against another
   participant's points.

So the order has to be: **fix `/api/verify` (Phase 5) → then 4D/4E**. Shipping
evidence submission against the unauthenticated endpoint would mean building on
a known hole.

Note that fixing it is **not** a mobile-only change: all three web callers
(`VerificationModal.jsx` and two in `AdminPage.jsx`) currently send no auth
header, so they must be updated in the same pass. That is a web change with
real regression risk and belongs in its own reviewed phase — which is exactly
what Phase 5 is for.

The detail screen's "Submit evidence" button therefore **explains that it is not
available yet and points at the website**, rather than navigating to a screen
that cannot finish the job.

### What this phase delivers

A complete, read-only quest detail screen driven entirely by server data:

- The quest row: title, difficulty and its award, evidence type, created and
  planned dates (overdue highlighted), completion time and measured duration.
- The validity badge plus the check's own participant-safe words.
- **The verification pipeline for the latest submission**, from the real
  `quest_completions` row: Submitted → AI check → Admin review → Outcome.
- Eligibility and cooldown messaging.
- Delete, with a confirmation.

### Files added

| Path | Purpose |
|---|---|
| `src/data/completionModel.ts` | The stage machine — pure, unit-tested |
| `src/data/completions.ts` | The `quest_completions` read |
| `tests/completion.test.ts` | 21 tests |

Changed: `src/app/quest/[id].tsx` (the real screen), `src/data/quests.ts`
(`DIFF_POINTS`, `DIFF_MIN_COMPLETE_MS`, `cooldownRemainingMs`),
`tests/navigation.test.ts` (one stale assertion, see below).

### The distinction the stage machine exists to get right

Points land **provisionally** at submission and are reversed by
`rollback_completion` on an AI fail or an admin rejection. "AI passed" is
therefore *not* "your points are safe". The screen says
*"Points for this attempt are provisional until a study admin confirms them"*
until `status = 'verified'`, and `pointsAreProvisional()` is tested for each
state.

Two related decisions:

- **An AI error is not a failure.** `ai_verdict = 'error'` means the check could
  not run; the award stands and a human decides. It renders as "Awaiting admin
  review", never as a rejection.
- **`admin_reason` is never read.** RLS would return it — a participant owns the
  row — but it holds internal reviewer notes. The participant-facing text is
  `ai_reason`, which `api/verify.js` deliberately writes in friendly language
  ("AI service busy — queued for manual review") and never with a model name or
  HTTP code. A test asserts the column is absent from the select string.

### A test that was deliberately changed, not deleted

`navigation.test.ts` asserted that quest detail links to `/quest/verify`. It no
longer does, on purpose. The assertion was replaced with one that pins the
current intent — the button must say "Not available yet" and the route must
still exist — and carries an explicit note:

> **WHEN 4D LANDS: re-link detail → /quest/verify and restore the assertion that
> this test replaced.**

### Commands run

```bash
npm test                                  # 125 passed, 0 failed
npm run typecheck                         # app + tests, clean
npx expo export --platform ios --clear    # 3.6 MB Hermes bundle
```

### Verification done here

| Check | Result |
|---|---|
| Unit tests | ✅ 125/125 (36 auth + 30 navigation + 38 quest/parity + 21 completion) |
| TypeScript | ✅ app and tests clean |
| iOS bundle | ✅ compiles, 3.6 MB |
| Secret scan | ✅ private-key markers **and `admin_reason`** → 0 hits each |

The completion tests also assert the constraints this phase depends on, read
from the migrations themselves: that `submit_completion` demands a photo and a
20-character log, that `complete_task` is revoked, that `quest_completions` is
client-read-only, and that the award amounts match
`supabase-phase10-cooldown-anchoring.sql`.

### Web regression result

✅ **Pass** — 131/131 tests, clean Vite build, **no** web files changed.

### Migrations / server changes

None.

### Environment variables required

Unchanged.

### Risk to the existing web application

**None identified.** Read-only against shared tables.

### Rollback

```bash
git revert $(git log --format=%H --grep='mobile phase 4c' -1)
```

### User-required verification (cannot be done from this machine)

Use a **non-production test account**. Open a quest that has been submitted on
the web, so there is a `quest_completions` row to render.

- [ ] Tapping a quest in the log opens its detail
- [ ] Title, difficulty + award, evidence type and dates are correct
- [ ] An overdue planned date is highlighted
- [ ] A quest with a validity badge shows the check's reason
- [ ] A submitted quest shows the four stages with the right one marked active
- [ ] An approved quest reads "Approved" and drops the provisional note
- [ ] A rejected quest reads "Not approved" and says the points were reversed
- [ ] **No internal admin note appears anywhere on the screen**
- [ ] "Submit evidence" explains it is not available yet
- [ ] A not-yet-accepted quest says it cannot be completed
- [ ] Delete asks for confirmation and returns to the log
- [ ] Pull-to-refresh updates both the quest and its verification state

### Recommended next step

**Phase 5 — server integration**, starting with the `/api/verify`
authentication fix (web callers included), then 4D/4E on top of it.

---

## Phase 5 — Server integration: `/api/verify` hardened

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 5'` |
| **Date** | 2026-09-14 |
| **Status** | ✅ Complete on the dev machine — **needs a Vercel redeploy to take effect**, then on-device verification |

### ⚠️ THIS IS THE FIRST PHASE THAT CHANGES WEB FILES

Every previous phase left `git diff main` empty outside `apps/mobile/`. This one
does not, and it cannot: the endpoint being hardened is shared, and all three
existing web callers send no auth header today, so they change in the same
commit or the web app breaks.

**Web files changed (5):**

| File | Change |
|---|---|
| `api/_lib/verify.js` | **new** — the endpoint logic, moved here and hardened |
| `api/verify.js` | reduced to thin wiring (`createVerifyHandler({ createClient })`) |
| `src/lib/authHeaders.js` | **new** — one shared bearer-header helper |
| `src/components/VerificationModal.jsx` | sends the token |
| `src/pages/AdminPage.jsx` | both re-run paths send the token |
| `src/context/GameContext.jsx` | uses the shared helper instead of its private copy |
| `tests/helpers/fakeSupabase.mjs` | extended: storage signed URLs, recordable rpc |
| `tests/verify.test.mjs` | **new** — 34 tests |

No SQL, no RLS policy, no migration, no Supabase setting. `rollback_completion`,
`submit_completion` and `complete_task` are untouched.

### The vulnerability, confirmed against production

`/api/verify` accepted `{ completion_id }` with **no token and no ownership
check**. A `fail` verdict calls `rollback_completion()`, so any caller who
learned a completion id could reverse another participant's points — and every
call spent a Gemini request.

This was not theoretical. During this phase, an unauthenticated POST to the
**live deployment** with a random completion id returned:

```
HTTP 404  {"error":"completion_not_found"}
```

That is the database lookup answering — i.e. the request was processed, and a
*real* id would have produced a verdict and a possible rollback.

### What the endpoint now enforces

1. **A Supabase access token is required**, verified with the service client.
   The uid comes from the token, never the body.
2. **Ownership** — you may verify your own completion; an admin may verify any.
3. **Idempotency** — a completion already holding a *final* verdict (pass/fail)
   is not re-judged for a participant; the stored verdict is returned with
   `reused: true` and no Gemini call. `pending` and `error` stay retryable,
   because the admin "re-run stuck" button depends on that. An admin may force
   a fresh run on any verdict.
4. **A per-user cooldown** (4 s). Honest about its limits: it lives in the warm
   instance's memory, so a cold start resets it. It is defence-in-depth — the
   durable controls are ownership, idempotency, and the 3-completions-in-60s
   burst lock inside `complete_task()`. A persistent counter would need a
   migration, which was out of scope.

### What was deliberately NOT changed

The failure posture, which is the part most easily broken by a refactor:

- Gemini outage, missing key, unreachable photo, unparseable reply → verdict
  `error`. The provisional award **stands** and a human decides. Never an
  auto-approve, never an auto-reject.
- A blank/tiny image (< 3000 bytes) is still a `fail` with a rollback — and it
  matters more now, because a native client cannot do the web's canvas check, so
  this server-side guard is the only one covering every client.
- Reasons stay participant-safe. Model names and HTTP codes are logged, never
  returned. A test asserts the response never contains `AIza`,
  `generativelanguage`, `gemini`, `service_role` or `flash`.

### CORS

No change needed. React Native's `fetch` is not CORS-constrained, so native
callers work against the same-origin functions unchanged. Adding permissive
headers would have widened the surface for no benefit. Recorded rather than
implemented.

### Mobile side

`apps/mobile/src/lib/verifyApi.ts` — an authenticated client for the endpoint,
added now so Phase 4D has it. **Not yet called by any screen.** It maps a
`verdict` of `error` to "queued for review", never to a rejection.

### Commands run

```bash
npm test            # web: 165 passed (131 existing + 34 new), 0 failed
npm run build       # web: clean
cd apps/mobile && npm test && npm run typecheck   # 125 passed, clean
```

### Verification done here

| Check | Result |
|---|---|
| Web unit tests | ✅ 165/165 — the 131 pre-existing ones unchanged |
| Web build | ✅ clean |
| Mobile tests + typecheck | ✅ 125/125, clean |
| Live vulnerability | ✅ **confirmed present** on the current deployment (see above) |
| New module loads under the Vercel-style path | ✅ local `/api/verify` returns `server_not_configured` (the config gate), proving the module imports and runs |
| 401 / 403 / 429 / idempotency paths | ✅ unit-tested against the real handler with an injected client |

The retry backoff was made injectable so the transient-error tests exercise the
full model fallback chain without waiting out the real delays — one test had
been taking 17 s.

### Web regression result

✅ **Pass** — 165/165 tests (the 131 that existed before this phase all still
pass), clean Vite build.

### 🔴 Deployment step required

**The fix is inert until Vercel redeploys.** Until then the live endpoint is
still the unauthenticated version. Nothing else is needed — no new env var, no
migration.

Because this phase changes the production client, it is also the first one worth
considering for an early merge to `main` on its own: the hardening benefits the
web app regardless of whether the mobile client ever ships. The commit is
self-contained and cherry-pickable.

### Risk to the existing web application

**Low but non-zero — this is the phase to watch.** The web verification flow now
depends on a bearer token being attached. If a caller were missed, its verdict
request would 401 and the completion would sit at `ai_verdict: 'pending'` for
manual review — degraded, not broken, and no points move incorrectly. A test
asserts no bare `/api/verify` call remains in either web file.

### Rollback

```bash
git revert $(git log --format=%H --grep='mobile phase 5' -1)
```

That restores the unauthenticated endpoint **and** the un-authenticated web
callers together, so the web app keeps working either way.

### User-required verification (after redeploy)

- [ ] Redeploy Vercel (push the branch, or cherry-pick this commit to `main`)
- [ ] Repeat the probe — an unauthenticated POST must now return **401**:
      `curl -sL -X POST https://petquest-final-ver.vercel.app/api/verify -H "Content-Type: application/json" -d '{"completion_id":"00000000-0000-4000-8000-0000000000ff"}'`
- [ ] **On the web app**, complete a quest with a photo — the verdict must still
      arrive (this is the regression that matters most)
- [ ] **Admin → Verification queue → Re-run AI** on a stuck row still works
- [ ] **Admin → Re-run stuck** batch still works
- [ ] Re-running a row that already passed returns the same verdict without a
      new Gemini call

### Next

**Phase 4D/4E** — evidence capture and live verification progress on mobile, now
that there is a safe endpoint to call.

---

## Phase 5 follow-up — the hardening reached `main`

Before Phase 4D/4E began, the web-only version of the Phase 5 hardening was
rebuilt as `a56b83f` ("Require auth and ownership on /api/verify") directly on
`main`, deployed, and verified: production returns **401** to an unauthenticated
POST, a signed-in test user completed a quest with a photo and reached the
pipeline, and both admin re-run paths worked. `main` was then merged into this
branch (`f38c810`); the only conflict was `tests/verify.test.mjs`, resolved by
taking `main`'s version (a strict superset — two `existsSync` guards so the suite
stands alone without the mobile tree).

---

## Phase 4D/4E — Evidence submission and live verification progress

| | |
|---|---|
| **Branch** | `mobile-expo-migration` |
| **Commit** | `git log --oneline --grep='mobile phase 4d/4e'` |
| **Date** | 2026-09-15 |
| **Status** | ✅ Complete on the dev machine — **on-device verification is user-required** and is the real test of this phase |

This closes the loop that 4C had to leave open. A participant can now complete a
quest from the phone: capture → upload → `submit_completion()` → `/api/verify` →
outcome, with the real pipeline state shown afterwards.

### Files added

| Path | Purpose |
|---|---|
| `src/data/evidenceModel.ts` | Rules, storage path, RPC error wording, the step machine, outcome mapping — pure, tested |
| `src/lib/evidence.ts` | Camera/library capture, compression, upload, the `submit_completion` call |
| `tests/evidence.test.ts` | 30 tests |

Changed: `src/app/quest/verify.tsx` (the real screen), `src/app/quest/[id].tsx`
(re-linked to verify; the 4C placeholder alert removed), `app.json` (image
picker plugin + permission strings), `tests/navigation.test.ts` (the assertion
4C replaced is restored, as its note required).

### Dependencies added

`expo-image-picker` ~57.0.17 · `expo-image-manipulator` ~57.0.17 (via
`npx expo install`; both work in Expo Go). The first install attempt failed on a
network reset after writing `package.json`, so the plugin was added by hand with
the iOS permission strings — a test asserts they are present and say "evidence".

### What replaced the web's browser-only capture

The web `VerificationModal` used `getUserMedia`, a `<canvas>` frame grab and a
pixel-level blank-frame check. None of that exists in React Native:

| Web | Mobile |
|---|---|
| `getUserMedia` + `<video>` frame grab | `expo-image-picker` camera |
| `<input type="file">` | `expo-image-picker` library |
| canvas `toBlob(0.85)` | `expo-image-manipulator` — long edge ≤ 1600 px, JPEG 0.8 |
| canvas `getImageData` blank check | **byte-size floor** = the server's own `MIN_PROOF_BYTES` (3000) |
| `File`/`Blob` upload | **`ArrayBuffer`** — a RN `Blob` can reach Supabase as zero bytes |

The blank-frame guard is weaker than the web's pixel check, and that is
acceptable *because the server runs the same byte check on every client*
(`api/_lib/verify.js`). The mobile check exists only to save a doomed upload.

### The rule this phase exists to get right

Once `submit_completion()` has returned OK, **the submission exists server-side
whatever happens next.** So:

- A `/api/verify` reply of `error`, or no reply at all (network, 429, timeout),
  is shown as **"Submitted — queued for review"** with the points marked
  provisional. It is *never* shown as a rejection, and it never re-submits.
  `outcomeFromVerdict()` is tested for each case.
- The verdict is requested **even if the participant navigates away** between
  submit and verify. The web client learned this the hard way: bailing early
  orphaned rows at `pending` until an admin re-ran them. A test asserts there is
  no `if (!alive.current) return` between the two calls; only the screen's own
  state updates are guarded.
- The three progress steps (Uploading → Submitting → AI checking) advance
  **only on a real response** — never a timer. A test asserts each `setStep` is
  immediately followed by its `await`.

### Server authority, again

- `submit_completion()` is the only completion path (tests assert no
  `rpc('complete_task'` call and no direct write to `tasks`,
  `quest_completions` or `profiles`).
- The RPC is called with all six Phase-8 arguments, including
  `p_verification_started_at` (when the screen opened — the research "active
  time") and `p_source` (`camera` vs `upload`, so a reviewer sees which).
- No local point total anywhere; after the flow the profile is refetched.
- Upload goes to the private `quest-proofs` bucket under `<uid>/…` — the
  bucket's INSERT policy requires that first segment, so a wrong path is
  refused by the database, not by this code. `upsert: false`, and
  `getPublicUrl` is never called.
- EXIF is stripped from picked images (`exif: false`).

### One parity fix the tests caught

My first wording for the `locked` RPC error was *"Completion is locked for 5
minutes"*; the web says *"Completion locked for 5 minutes"*. A test compares the
mobile strings against `GameContext.jsx`, and it failed. Fixed to match — the
two clients now explain the same server rule in the same words.

### Commands run

```bash
npx expo install expo-image-picker expo-image-manipulator
npm test                                  # mobile: 155 passed
npm run typecheck                         # clean
npx expo export --platform ios --clear    # 3.6 MB Hermes bundle
```

### Verification done here

| Check | Result |
|---|---|
| Mobile unit tests | ✅ 155/155 (+30 evidence) |
| TypeScript | ✅ clean |
| iOS bundle | ✅ compiles, 3.6 MB |
| Secret scan | ✅ 0 hits for private keys and `admin_reason` |
| Web regression (merged branch) | ✅ 165/165, clean build |
| Web files changed by this phase | **none** — `git diff main` is empty for `src/`, `api/`, `supabase/` |

### Migrations / server changes

None. Phase 5 already put the authenticated endpoint on `main`.

### Environment variables required

Unchanged.

### Risk to the existing web application

**None.** Mobile-only; the shared endpoint was hardened and deployed separately.

### Rollback

```bash
git revert $(git log --format=%H --grep='mobile phase 4d/4e' -1)
```

### User-required verification (cannot be done from this machine)

**This is the phase where on-device testing actually matters** — camera
permissions, the picker, the upload and the real Gemini round trip cannot be
exercised here. Use a **non-production test account**; every run creates a real
completion row and spends a real Gemini call.

- [ ] iOS asks for **camera** permission with the "evidence" wording, once
- [ ] Take photo → preview appears with "📷 Live photo · N KB"
- [ ] Choose photo → asks for **photo** permission, preview says "🖼️ From library"
- [ ] Retake clears the preview
- [ ] Submit stays disabled until a photo *and* a 20-char log are present; the counter turns green at 20
- [ ] Submit → the three steps light up in order, each waiting on its request
- [ ] A good photo → "+N points earned", reason shown, "provisional" note
- [ ] Back to quest → the detail card shows the four-stage pipeline with the real state
- [ ] **Home tab points went up** by the difficulty's award (server-side)
- [ ] A clearly wrong photo (e.g. a blank wall) → "Evidence not accepted", points reversed, detail shows "Not approved"
- [ ] Airplane mode *during* the AI check → "Submitted — queued for review", **not** a rejection; the row appears in Admin → Verification queue as stuck
- [ ] Submitting the same quest again after completion is refused
- [ ] The photo appears in the **web** Admin → Verification queue, with "File upload" flagged for a library pick
- [ ] Nothing sideways-scrolls at 320 pt; the preview keeps its 4:3 box

### Next

**Phase 4F** — the pet screen with the real sprite and evolution progress, then
**Phase 6** (the mandatory-but-skippable wake-up loader).

---

## Phase 4F — Pet tab: real sprite, evolution stage, stats

| | |
|---|---|
| **Commit** | `git log --oneline --grep='mobile phase 4f'` |
| **Date** | 2026-09-15 |
| **Status** | ✅ Complete — on-device check user-required |

The companion tab shows the actual PetQuest sprite for the stored `pet_level`,
the four evolution stages with the current one marked, a progress bar to the
next stage from `total_points_earned` (same thresholds as the server's
`pet_level` CASE), current/longest streak, and the care stats from `pet_stats`.
Every value is server-sourced; an unloaded one renders as a dash.

### Care actions were deliberately NOT ported — decision needed

On the web, feed / wash / play raise a stat **and debit 10 points by writing
`profiles.points` directly from the browser**. `supabase-schema.sql` documents
this as a known hole:

> *profiles.points is deliberately still client-writable because spendPoints()
> debits it directly. Until that is also moved into an RPC, a determined user
> can still award themselves points by writing profiles.points… Closing that
> hole requires a matching spend_points() RPC plus
> `revoke update (points) on profiles from authenticated, anon;`*

Reproducing that client-side write on a second client would double the surface
of a known weakness, and the fix is a **migration**, which the policy says needs
approval first. So mobile shows the stats read-only with a note sending care to
the website, and tests assert no mobile file writes `profiles` or `pet_stats`
or debits points locally.

**Recommendation:** approve a small migration adding `spend_points(p_amount)`
(SECURITY DEFINER, checks balance, debits atomically) and revoking client
update on `profiles.points`. It closes the web hole *and* unblocks mobile care
actions and the accessories shop. Not economy-award logic — it is the missing
half of the economy. Reversible: drop the function, re-grant the column.

Also recorded: the web decays `pet_stats` client-side on a 30-minute timer
while logged in; mobile does not run that timer.

Files: `src/data/petStats.ts` (new), `(tabs)/pet.tsx` (real screen),
`tests/quests.test.ts` (+5). No web files, no SQL.

---

## Phase 6 — Mandatory, skippable mascot wake-up loader

| | |
|---|---|
| **Commit** | `git log --oneline --grep='mobile phase 6'` |
| **Date** | 2026-09-15 |
| **Status** | ✅ Complete on the dev machine — **on-device verification is user-required**, especially timing and Skip |

The mobile port of the web's account-loading buffer. The participant's
companion sleeps → stirs → performs its flourish → settles awake, for a
mandatory **4.2 s** minimum (1200 / 900 / 1200 / 900), with an always-visible
**Skip animation →** button. The account is revealed only when the data is
ready AND the minimum has played, or straight away on Skip.

### Files added

| Path | Purpose |
|---|---|
| `src/data/wakeModel.ts` | Phases, timings, captions, reveal rule, pet lock — pure, tested for parity with the web |
| `src/data/wakeSprites.ts` | The 12 frame `require`s |
| `src/hooks/useReducedMotion.ts` | `AccessibilityInfo.isReduceMotionEnabled` + change listener |
| `src/components/MascotWakeLoader.tsx` | The component |
| `assets/pets/wake/*.png` | The 12 frames, **byte-identical** to the web's (a test compares them) |
| `tests/wake.test.ts` | 34 tests |

Changed: `src/app/_layout.tsx` (the gate), `src/auth/AuthProvider.tsx`
(`signingIn`), `tsconfig.json` (see below).

### How the gate works (mirrors `App.jsx` on the web, formula asserted equal)

```
accountDataReady = status settled && !signingIn && !(signedIn && profile still loading)
accountId        = signedIn ? profile.id : null
gated            = !accountDataReady || (accountId && revealedFor !== accountId)
```

- `signingIn` flips **before** `signInWithPassword` is called, so the loader
  mounts at request start and the two run in parallel. A failure clears it
  immediately — nobody is held behind an animation with nothing to reveal.
- A signed-out visitor has no `accountId`, so the login screen is never held.
- A failed profile load drops the gate: the participant lands in the app with no
  role (no admin) — degraded, not stuck.
- Sign-out forgets `revealedFor`, so the same account signing back in gets the
  full sequence rather than an instant reveal (a case the web version misses).
- `loadId` bumps only when the gate turns on, never while it is up — keying off
  the account id would restart the animation right as the profile lands.

The loader is an **absolute overlay above the Stack**, not a replacement for
it. That keeps the navigator mounted, so `router.replace` never fires before a
navigator exists and a redirect underneath can never tear the animation down —
the same lesson the web version learned in its Phase 5.

### Reduced motion

Keeps the **full mandatory sequence** — every state is still shown for its
readable minimum — and drops only the glow pulse and the cross-fade. Read from
`AccessibilityInfo` on mount and kept in sync with the system setting.

### Skip

A real `Pressable` with `accessibilityRole="button"`,
`accessibilityLabel="Skip pet wake-up animation"`, a hint, 44 pt minimum height
and hit-slop. Rendered outside the live region so it is not re-announced.
Idempotent: `onSkip` fires once; `onComplete` is a one-shot. It drops only the
*duration* requirement — a skip before the data lands still waits for the data.
Keyboard: not applicable on iOS touch; the button is fully reachable by
VoiceOver.

### A build-tooling detail worth knowing

`wakeModel.ts` imports `petModel.ts` with an **explicit `.ts` extension** and a
relative path. `node --test` has no Metro alias and uses strict ESM resolution,
so `@/data/petModel` cannot load there. Metro resolves the explicit extension
fine; `tsc` needed `allowImportingTsExtensions` (+ `noEmit`) in `tsconfig.json`.
Rule going forward, now written into the file: **pure models under `src/data/`
that a test imports use relative `.ts` imports, never `@/`.** The bundle was
exported afterwards to prove Metro accepts it.

### Commands run

```bash
npm test                                  # 194 passed (+34)
npm run typecheck                         # clean
npx expo export --platform ios --clear    # 3.7 MB Hermes; 67 assets
```

### Verification done here

| Check | Result |
|---|---|
| Mobile unit tests | ✅ 194/194 |
| TypeScript | ✅ clean |
| iOS bundle | ✅ compiles with the explicit `.ts` import, 3.7 MB |
| Secret scan | ✅ 0 hits |
| Wake frames | ✅ 12/12 present and byte-identical to the web copies |
| Web regression | ✅ 165/165, clean build, **no web files changed** |

### Migrations / server changes

None (the `spend_points` proposal above is a recommendation, not done).

### Rollback

```bash
git revert $(git log --format=%H --grep='mobile phase 6' -1)     # loader
git revert $(git log --format=%H --grep='mobile phase 4f' -1)    # pet tab
```

### User-required verification (cannot be done from this machine)

**Pet tab (4F)**
- [ ] Your real companion sprite at the right stage; species and stage named
- [ ] Evolution row marks the current stage; bar and "N to <next>" match your lifetime points
- [ ] Streak current/longest match the web
- [ ] Stats show percentages (or dashes for a brand-new account)
- [ ] The care note points at the website; no feed/wash/play buttons

**Wake-up loader (6)** — the one to test carefully
- [ ] **Cold open, signed in:** your own pet sleeps → stirs → flourish → awake, captions change, about **4 s** before the tabs appear
- [ ] **Cold open, signed out:** the login screen appears almost immediately — no 4 s hold
- [ ] **Sign in:** the loader appears the moment you tap Sign in, plays the full sequence, then the tabs
- [ ] **Skip** during the sleeping frame → tabs as soon as the account has loaded (typically instant)
- [ ] **Skip** while airplane mode is on mid-sign-in → the loader stays on "Finishing your setup…" until the data arrives; it never reveals a blank app
- [ ] **Wrong password:** the loader drops straight back to the form with the error — no 4 s trap
- [ ] **Sign out, sign back in as the same account:** the full sequence plays again
- [ ] **Reduce Motion on** (Settings → Accessibility → Motion): all four frames still play for the same ~4 s; no pulsing glow
- [ ] VoiceOver reads "Loading your PetQuest account. Your pet is waking up." and can reach Skip
- [ ] Nothing behind the loader flashes before it appears; nothing sideways-scrolls at 320 pt

### Next

**Phase 7** — admin queues (validity + verification) on mobile, role-gated and
RLS-backed. Then **Phase 8** — tests, performance, EAS build configuration.
