# PetQuest — mobile client (Expo)

The iOS/Android client for PetQuest. It talks to the **same Supabase project and
the same Vercel functions** as the Vite web app in the repository root.

> **Experimental.** The web app at the repository root is still the production
> client. This folder is developed on `mobile-expo-migration` and is not merged
> to `main` until it passes the Phase 8 regression gates.

**Current phase: 1 — isolated shell.** The app boots, renders a branded home
screen and reports its public configuration. There is no Supabase client, no
authentication and no quest data yet (Phases 2 and 4).

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
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run doctor       # expo-doctor: dependency/config sanity
```

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

Phase 2 auth · Phase 3 tabs + admin group · Phase 4 dashboard, quests, evidence ·
Phase 5 server integration · Phase 6 mascot wake-up loader · Phase 7 admin and
research views · Phase 8 tests and EAS build.

Email confirmation for new accounts stays on the **existing web flow** for now —
the confirmation link opens in a browser. Native deep-link confirmation
(`petquest://`) is deliberately deferred until login, session restoration and
logout are proven on device. The `petquest` scheme is declared in `app.json` but
**no Supabase Auth redirect URL has been added**.
