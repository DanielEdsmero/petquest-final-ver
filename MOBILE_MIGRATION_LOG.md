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
