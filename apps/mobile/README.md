# PetQuest — mobile client (Expo)

The iOS/Android client for PetQuest. It talks to the **same Supabase project and
the same Vercel functions** as the Vite web app in the repository root.

> **Experimental.** The web app at the repository root is still the production
> client. This folder is developed on `mobile-expo-migration` and is not merged
> to `main` until it passes the Phase 8 regression gates.

**Current phase: 3 — navigation.** Bottom tabs (Home, Quests, Pet, Profile), a
quest stack (create, detail, verify) pushed over them, and a role-gated admin
group with its two queues. The screens are structural: they own their loading,
empty and error states but fetch nothing yet. Real data lands in Phase 4.

---

## Isolation

This folder is **self-contained**:

- Its own `package.json`, `tsconfig.json`, `.env` and `node_modules/`.
- **No npm/pnpm workspaces, no Turborepo, no shared-package resolution.** The
  repository root has no workspace field, so the web app's module resolution is
  exactly what it was before this folder existed.
- Nothing in `src/`, `api/`, `supabase/` or `public/` imports from here, and
  nothing here imports from them.

### Removing the mobile app

Deleting this folder removes the entire mobile client and nothing else:

```bash
# From the repository root:
rm -rf apps/mobile        # or: git rm -r apps/mobile
```

The web app keeps building (`npm test && npm run build` at the root). To drop the
whole effort instead, the branch is disposable:

```bash
git checkout main
git branch -D mobile-expo-migration
```

No database migration, Supabase function, RLS policy or Vercel setting was added
or changed for the mobile app, so there is nothing to undo on the server.

---

## Setup

```bash
cd apps/mobile
npm install
cp .env.example .env      # then fill in the three public values
npx expo start
```

Scan the QR code with the iPhone camera and open it in **Expo Go**. If the phone
cannot reach the dev server (different networks, or a restrictive Wi-Fi):

```bash
npm run start:tunnel
```

After changing `.env` or dependencies, restart with a cleared cache:

```bash
npm run start:clear
```

### Environment variables

Only three, all public by design — see `src/lib/env.ts` for the full contract.

| Variable | What it is |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public; RLS is the control) |
| `EXPO_PUBLIC_API_BASE_URL` | Origin of the deployed Vercel app |

`SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must **never** appear here, in
any form. They live only in Vercel's server-side environment. The mobile app
reaches Gemini exclusively through `/api/validate-quest` and `/api/verify`,
which verify the caller's Supabase access token.

---

## Checks

```bash
npm test             # pure-logic unit tests (node --test, no extra tooling)
npm run typecheck    # app types, then test types
npm run lint         # expo lint
npm run doctor       # expo-doctor: dependency/config sanity
```

`npm test` runs TypeScript directly — Node 24 strips types natively, so the
project carries no test framework or transpiler. Only dependency-free modules
are covered (`src/lib/chunkedStorage.ts`, `src/auth/guards.ts`); anything that
imports React Native is device/integration territory in Phase 8.

> **Run `npx expo start` once before `npm run typecheck` on a fresh clone.**
> Expo generates `.expo/types/router.d.ts` (the typed-routes union) at dev-server
> start, and it is git-ignored. Without it, typed `href` values fail to compile.

## Authentication

- Email + password, the same flow as the web client. No OAuth provider is
  configured, so no deep link is involved in signing in.
- The session lives in the iOS keychain / Android keystore via
  `expo-secure-store`. SecureStore rejects values over 2048 bytes and a Supabase
  session is larger than that, so `src/lib/chunkedStorage.ts` splits it across
  entries — byte-aware, so multi-byte characters are never cut in half, and a
  torn entry reads back as absent rather than as a truncated session.
- Token auto-refresh follows the app's foreground state (`AppState`), so a phone
  that has been locked comes back with a fresh token instead of a stale one.
- `src/auth/AuthProvider.tsx` is the single source of auth truth; screens use
  `useAuth()`.
- Route guards live in `src/auth/guards.ts` (pure and unit-tested) and are
  applied once, in the root layout.

> **Guards are UX, not security.** They stop a participant *reaching* an admin
> screen. What actually protects admin data is Supabase RLS (`is_admin()` on
> `quest_validity_reviews`, `user_snapshots`, `cheat_events`) plus the role
> checks inside the Vercel functions.

### Registration and email confirmation

Sign-up stays on the **web** for now, per the Phase 1 decision: a new
participant registers in a browser, confirms by email there, then signs in on
the phone. The `petquest` scheme is declared in `app.json` but **no Supabase Auth
redirect URL has been added**, and the web confirmation flow is untouched. Native
deep-link confirmation is deferred to a later phase.

## Navigation

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

Safe-area contract — `ScreenContainer` applies both insets by default:

- **Tab screens pass `insetBottom={false}`.** The tab bar already clears the
  home indicator and the scene is laid out above the bar, so applying the inset
  again would pad twice.
- **Screens under a native header pass `insetTop={false}`**, for the same reason
  at the other end.
- List screens pass `scroll={false}` and own a `FlatList`; nesting one inside the
  container's `ScrollView` would break virtualisation.

> **`.expo/types/router.d.ts` is generated by a *running* dev server.** If Metro
> fails to start, a partial file is left behind and `tsc` reports phantom routes
> and a missing `/`. If typed-route errors look nonsensical, delete `.expo/`,
> run `npx expo start -c`, and confirm Metro is actually up before re-checking.

## Conventions

- **Expo Router** file-based routing under `src/app/`.
- **TypeScript**, `strict: true`.
- Styling is React Native `StyleSheet` + the tokens in `src/theme.ts`, which are
  ported from the web app's CSS custom properties. NativeWind was deliberately
  deferred — it needs a Babel plugin, a Metro config and its own Tailwind config,
  and can be adopted later without changing screen logic.
- Every screen wraps its content in `ScreenContainer` (safe areas, keyboard
  avoidance, side gutters, max width).
- Long lists use `FlatList`, never `.map()` inside a `ScrollView`.
- Layouts must stay readable at **320 pt** (iPhone SE) with no horizontal scroll.

## Not yet implemented

Phase 4 dashboard, quests, evidence · Phase 5 server integration · Phase 6 mascot
wake-up loader · Phase 7 admin and research views · Phase 8 tests and EAS build.

Every screen is currently a structural placeholder. Where a figure would go it
shows a dash rather than a plausible-looking number, so nothing on screen can be
mistaken for real research data.
