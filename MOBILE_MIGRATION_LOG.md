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
