# PetQuest — Mobile Migration Map (Phase 0, audit only)

**Branch:** `mobile-expo-migration` · **Phase 0 = audit only.** No application code,
dependencies, SQL, or configuration were changed. The only files this phase adds are
this map and `MOBILE_MIGRATION_LOG.md`.

The mobile client will be a **second client against the same Supabase project and the
same Vercel functions**. The Vite web app stays the production client until the mobile
app passes the regression gates in Phase 8.

---

## 1. Stack as it exists today

| Layer | What it is |
|---|---|
| Web client | Vite 5 + React 18, **plain JSX** (no TypeScript), `react-router-dom` v6, Tailwind 3, framer-motion |
| State | One context: `src/context/GameContext.jsx` (785+ lines) — auth, profile, tasks, points, pet stats, offline queue, notifications |
| Backend | Supabase (Auth + Postgres + Storage), RLS on every table |
| Server compute | Two Vercel functions: `api/verify.js`, `api/validate-quest.js` (+ `api/_lib/`) |
| AI | Gemini, **server-side only**, model auto-discovery with a fallback chain |
| Tests | `node --test tests/**/*.test.mjs` — 131 passing, no browser/DOM harness |

---

## 2. Source file → flow map

### Authentication & session

| Concern | File | Notes for mobile |
|---|---|---|
| Supabase client | `src/lib/supabase.js` | Creates the client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. **Uses browser `localStorage` implicitly** (supabase-js default) and sets `window.sb` in dev. Mobile needs its own client with a **SecureStore storage adapter**. |
| Session bootstrap | `GameContext.jsx` — `supabase.auth.getSession()` + `onAuthStateChange` | Portable as-is. |
| Login / register / logout | `GameContext.jsx` → `login()`, `register()`, `logout()`; UI in `src/pages/LoginPage.jsx` | **Email + password** (`signInWithPassword`, `signUp` with `options.data.username`). No OAuth provider is configured, so **no deep-link redirect is required for Phase 2** — `petquest://` is still needed for future password-reset / email-confirm links. |
| Sign-in gate | `src/App.jsx` — `signingIn` + `revealedFor` account-loading gate | Concept ports; the implementation is web-specific. |
| Roles | `profiles.role` (`user` \| `admin`), enforced by `is_admin()` in SQL | Mobile must gate admin routes **and** rely on RLS — never on navigation alone. |

> **Email confirmation:** `register()` handles the `data.user && !data.session` case
> ("check your email"). The confirm link opens a **web** URL. For mobile this either
> stays web-confirmed or needs a Supabase redirect-URL entry — decide in Phase 2.

### Quest lifecycle

| Stage | File(s) | Server authority |
|---|---|---|
| Create (client validation) | `src/components/TaskList.jsx` | Title ≥ 3, evidence type required, planned date required on Medium/Hard |
| Create (period caps) | `GameContext.jsx` → `addTask()` | Hard = 1/week, Medium = 3/3 days; anchored on `profiles.hard_period_start` / `medium_period_start` |
| Create (validity check) | `GameContext.jsx` → `callValidateQuest()` → `POST /api/validate-quest` | **Server decides**; the DB trigger forces any client insert to `pending_ai_review` |
| Quest list / detail | `TaskList.jsx` | Difficulty tabs, cooldown pills, validity badges |
| Progress logs | `GameContext.jsx` → `addProgressLog()` → `task_progress` | Medium/Hard only |
| Evidence capture | `src/components/VerificationModal.jsx` | **Most browser-coupled file in the repo** — see §5 |
| Completion + award | `submit_completion()` RPC → internally calls `complete_task()` | `complete_task` is **revoked from `authenticated`** (Phase 8) |
| AI verdict | `POST /api/verify` | Writes the verdict service-side; rolls back on fail |
| Admin review | `src/pages/AdminPage.jsx` → `admin_review_completion()` | Approve / reject / suspicious |
| Validity queue | `AdminPage.jsx` → `admin_resolve_quest_validity()` | Admin-only |

### Pet, progression, onboarding

| Concern | File |
|---|---|
| Sprite/stage resolution | `src/config/pets.js` — `spriteFor`, `getStageForPoints`, `eggFor`, wake-frame helpers |
| Thresholds | `src/data/progression.js` (0 / 100 / 500 / 1500 / 5000) — must match the server `pet_level` CASE |
| Evolution celebration | `GameContext.jsx` watcher + `src/components/animations/EvolutionOverlay.jsx` (auto-dismiss 9 s) |
| Egg hatching onboarding | `src/pages/EggHatchingPage.jsx` → `reserveHatch()` / `commitHatch()` |
| Mode + starter quests | `src/pages/GameModeSelectPage.jsx`, `src/data/presetQuests.js` → `bulkAddPresets()` |
| Account-loading animation | `src/components/animations/MascotWakeLoader.jsx` + gate in `App.jsx` (Phase 6 target) |

---

## 3. Supabase surface the mobile client will use

### Tables / views (RLS on all)

`profiles` (15 refs) · `tasks` (14) · `pet_stats` (6) · `owned_accessories` (5) ·
`quest_validity_reviews` (3, **admin-read-only**) · `quest_completions` (3) ·
`equipped_accessories` (3) · `task_progress` (2) · `user_analytics` (view, 1) ·
`user_snapshots` + `cheat_events` (admin-read only, server-written) ·
`preset_quest_catalog` (public read)

### RPCs

| RPC | Called from | Grant | Defined in |
|---|---|---|---|
| `break_streak` | `GameContext.checkStreak()` | authenticated | phase4 |
| `submit_completion` | `GameContext.submitCompletion()` | authenticated | phase7 → **phase8 (6-arg)** |
| `complete_task` | `GameContext.completeTask()` / `flushPending()` | **REVOKED from authenticated** (phase8) | schema → phase4 → **phase6** → phase10 |
| `rollback_completion` | `api/verify.js` | `service_role` only | phase7 |
| `admin_review_completion` | `AdminPage` | authenticated + `is_admin()` | phase7 → phase8 |
| `admin_resolve_quest_validity` | `AdminPage` | authenticated + `is_admin()` | phase12 |
| `get_leaderboard` | `LeaderboardPage` | authenticated | phase5 |
| `get_research_analytics` | (available) | authenticated + `is_admin()` | phase6 |

> ⚠️ `GameContext.completeTask()` and `flushPending()` still call `complete_task`
> directly, but Phase 8 revoked it from `authenticated` — those paths now fail with
> *permission denied* and the real path is `submit_completion`. **Do not port this
> dead path to mobile.** Flagged as a web bug; out of scope for the migration.

### Storage

Bucket `quest-proofs` (**private**). Policies: a user may INSERT only under
`{uid}/…`; SELECT own or admin. Admin reads via `createSignedUrl(path, 300)`.
Mobile uploads to the same `${profile.id}/${task.id}-${Date.now()}.jpg` convention.

### Economy-critical SQL — do not touch

`complete_task`, `submit_completion`, `rollback_completion`, and the
`tasks_validity_guard` trigger. The mobile app calls them; it must not redefine them.
`supabase/README.md` documents the run order and the Phase 6 regression warning.

---

## 4. Environment variables

| Variable | Where it lives | Safe in the mobile bundle? |
|---|---|---|
| `VITE_SUPABASE_URL` → `EXPO_PUBLIC_SUPABASE_URL` | web `.env.local` / Vercel | ✅ public by design |
| `VITE_SUPABASE_ANON_KEY` → `EXPO_PUBLIC_SUPABASE_ANON_KEY` | web `.env.local` / Vercel | ✅ public; RLS is the control |
| *(new)* `EXPO_PUBLIC_API_BASE_URL` | mobile only | ✅ just the Vercel origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server env only | ❌ **never** |
| `GEMINI_API_KEY` | Vercel server env only | ❌ **never** |
| `SUPABASE_URL` (server copy) | Vercel server env only | ❌ not needed on mobile |
| `GEMINI_MODEL` (optional) | Vercel server env only | ❌ not needed on mobile |

**Confirmed:** no mobile code will contain a service-role or Gemini secret. Both
server keys are read only in `api/_lib/*.js` and `api/verify.js` via `process.env`,
are un-prefixed (so Vite cannot bundle them), and `.env.local` is git-ignored.
The mobile app talks to Gemini **only** through `/api/validate-quest` and `/api/verify`.

---

## 5. Browser-only APIs that must be replaced

| File | Browser API | Mobile replacement |
|---|---|---|
| `VerificationModal.jsx` | `navigator.mediaDevices.getUserMedia`, `<video>` frame grab, `document.createElement('canvas')`, `canvas.toBlob`, `getImageData` blank-frame guard, `URL.createObjectURL`, `<input type="file" capture>`, `fileRef.click()`, `createPortal` | `expo-image-picker` (camera + library) → `expo-image-manipulator` for compression → upload the URI. **The blank-frame guard has no canvas equivalent** — rely on the server-side `< 3000 bytes` check in `api/verify.js`, and optionally add a client size check. Modal → Expo Router modal route. |
| `GameContext.jsx` | `localStorage` (×7, via `lsGet`/`lsSet`, prefix `pq_`), `navigator.onLine`, `window.addEventListener('online'/'offline')` | `AsyncStorage` (or SecureStore for the session) + `@react-native-community/netinfo`. `lsGet/lsSet` are **synchronous**; RN storage is async — the cache layer needs restructuring (hydrate once on boot). |
| `GameModeSelectPage.jsx` | `localStorage` (×3) | same |
| `CinematicBackground.jsx` | `window` (×16), `<canvas>`, `<video>` | Drop or replace with a static/`expo-video` backdrop. Low priority. |
| `EvolutionOverlay.jsx`, `CompletionFx.jsx` | `createPortal(document.body)` | RN `<Modal>` / absolute overlay |
| `TaskList.jsx` | `window.innerWidth/innerHeight` for FX anchoring | `useWindowDimensions()` |
| `reactbits/Magnet.jsx`, `ErrorBoundary.jsx` | `window`, mouse events | Drop (pointer-hover has no mobile analogue) |
| Routing | `react-router-dom` | Expo Router |
| Styling | Tailwind + `src/index.css` custom properties/keyframes | NativeWind; CSS keyframes → `react-native-reanimated` / framer-motion equivalents |

**`src/config/pets.js` and `src/data/*.js` are pure logic + constants and port
essentially unchanged** — the highest-value shared code. `api/_lib/quest-validity.js`
already exports pure validators that mobile could reuse for client-side pre-checks.

---

## 6. Server endpoint contracts

### `POST /api/validate-quest`

```
Headers: Content-Type: application/json
         Authorization: Bearer <supabase access_token>      ← REQUIRED
Body (create):  { text, goal, priority, difficulty, evidence_type, planned_completion_date }
Body (recheck): { task_id }
```

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ decision, validity_score, reason, recommended_evidence_type, task? , task_id? }` | `accept` \| `clarify` \| `reject` \| `pending` |
| 400 | `{ error:'validation', field, message }` | field-level rejection |
| 401 | `{ error:'unauthenticated' }` | missing/invalid token |
| 403 | `{ error:'forbidden' }` | recheck of someone else's quest |
| 404 / 409 | `{ error:'not_found' \| 'not_recheckable' }` | |
| 429 | `{ error, message }` | 15 s cooldown / 8 per 10 min |
| 500 / 503 | `{ error, message }` | not configured / AI unavailable |

Auth model: the token is verified with `admin.auth.getUser(token)`; **the uid comes
from the token, never the body**. Client timeout is 45 s (`AbortController`).
Admin-only fields (`admin_reason`, `risk_flags`, `model_version`) are stripped by
`participantView()` and stored in the admin-read-only `quest_validity_reviews`.

### `POST /api/verify`

```
Body: { completion_id }
→ 200 { verdict: 'pass'|'fail'|'error', confidence, reason }
```

> 🔴 **Gap found during the audit:** `api/verify.js` performs **no token check and no
> ownership check**. Any caller who knows a `completion_id` can trigger a verdict
> (and a rollback) for someone else's completion. It is currently shielded only by
> obscurity. **Phase 5 must add `Authorization: Bearer` + ownership/admin checks to
> this endpoint**, matching `validate-quest`. This is a pre-existing web bug, not one
> introduced by mobile — but mobile must not ship against the unauthenticated shape.

### CORS

Neither function sets CORS headers; the web app is same-origin so none are needed.
**React Native's `fetch` is not subject to CORS**, so native Expo Go requests work
without any change. CORS headers would only become necessary for **Expo Web**. No
CORS change is required for the Phase 1–8 targets; document the decision rather than
adding permissive headers.

### Failure behaviour to preserve

- AI down → quest saved as `pending_ai_review`, **never** `accepted`; not completable.
- Verify down → verdict `error`, provisional award **stays** pending manual review.
- Neither path awards points on the client.

---

## 7. Assets

| Path | Contents |
|---|---|
| `public/pets/*.png` | 12 evolution sprites (`{arcane_dragon\|mystic_cat\|spirit_wolf}_lv{1-4}_{stage}.png`) + 3 eggs, ~490 KB each |
| `public/pets/wake/*.png` | 12 wake frames, 256×256 PNG-8, 214 KB total — already mobile-sized |

Web references them by absolute URL (`/pets/…`). RN needs **static `require()`** —
`src/config/pets.js` builds paths as strings, so the mobile port needs an explicit
`Record<string, ImageSourcePropType>` map. The 512 px evolution sprites should be
resized for mobile; the wake frames can be copied as-is.

---

## 8. Proposed layout

```
petquest-final-ver/
├── src/  api/  supabase/  public/      ← web app, UNCHANGED
├── apps/mobile/                        ← Expo Router + TypeScript (Phase 1)
├── MOBILE_MIGRATION_MAP.md
└── MOBILE_MIGRATION_LOG.md
```

`apps/mobile/` gets its own `package.json`, `tsconfig.json`, `.env`, and `.gitignore`
entries. **No workspaces, no root `package.json` change** — the web build must not
gain a new resolution path. Deleting `apps/mobile/` removes the entire mobile client
and nothing else.

Reuse strategy: **copy** the pure modules (`config/pets.js`, `data/*.js`) into
`apps/mobile/src/` rather than importing across the boundary. A shared package would
require workspaces and would couple the web build to the mobile one — explicitly
against the isolation policy. Cost: two copies of the constants; mitigated by a
Phase 8 test asserting the thresholds match.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `api/verify.js` is unauthenticated | **High** | Fix in Phase 5 before mobile calls it; add a regression test |
| Sync `localStorage` cache → async RN storage | Medium | Restructure `lsGet/lsSet` into a hydrate-once boot step |
| Camera blank-frame guard is canvas-based | Medium | Rely on the server byte-size check; add a client size floor |
| Root `package.json` accidentally shared | Medium | Separate `package.json` under `apps/mobile/`, no workspaces |
| Sprite paths are strings, not `require()` | Low | Explicit asset map in the mobile config |
| `complete_task` dead client path | Low | Do not port; use `submit_completion` |
| Duplicated constants drift | Low | Phase 8 parity test |

---

## 10. Phase 0 acceptance

- [x] Migration map lists the source file for every major web flow (§2)
- [x] Identifies what stays server-side (§3 economy SQL, §6 endpoints)
- [x] Lists endpoint/CORS changes needed for native requests (§6 — no CORS change; **auth fix required on `/api/verify`**)
- [x] Confirms no mobile code will hold service-role or Gemini secrets (§4)
- [x] Web app untouched — verified by build + test run (see `MOBILE_MIGRATION_LOG.md`)
