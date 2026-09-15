# Supabase migrations

These `.sql` files are **run by hand in the Supabase SQL editor** — they are not
imported by the app and not applied automatically by Vercel. Run them **in the
order below** (each builds on the previous). All are idempotent (`create or
replace`, `add column if not exists`), so re-running is safe.

| # | File | What it sets up |
|---|------|-----------------|
| 1 | `supabase-schema.sql` | Base tables (profiles, tasks, pet_stats…), RLS, the first `complete_task` + time-gate + rate-limit. |
| 2 | `supabase-phase4-gamification.sql` | Points/streaks/levels/badges economy; richer `complete_task` return. |
| 3 | `supabase-phase5-admin-leaderboard.sql` | Admin views + leaderboard queries. |
| 4 | `supabase-phase6-research-metrics.sql` | **Authoritative `complete_task`** (per-difficulty award + research metrics: duration, procrastination). |
| 5 | `supabase-phase7-verification.sql` | Photo-proof verification: `submit_completion`, provisional award, `rollback_completion`, snapshots. |
| 6 | `supabase-phase8-verification-fixes.sql` | Verification columns (verification_started_at, ai_verdict_at, source…); **revokes `complete_task` from clients** so only `submit_completion` can award. |
| 7 | `supabase-saitama-and-admin-targeting.sql` | Saitama game mode + admin cheat-panel targeting helpers. |
| 8 | `supabase-phase9-pet-evolution.sql` | `evolution_seen_level`, `hatched_pet_type`, `hatched_at`, `onboarding_complete` columns. |
| 9 | `supabase-phase10-cooldown-anchoring.sql` | Removes the creation-anchored completion gate (starter quests instantly verifiable). **Full Phase 6 `complete_task` minus the time gate** — must stay in sync with the award economy. |
| 10 | `supabase-phase11-dedupe-tasks.sql` | One-time cleanup: collapses duplicate quest rows from earlier non-dedupe inserts. |
| 11 | `supabase-phase12-quest-validity.sql` | **AI quest validity check at creation.** `tasks.goal/priority/evidence_type` + participant-safe `validity_*` columns, `preset_quest_catalog` (starter quests exempt), admin-only `quest_validity_reviews`, the `tasks_validity_guard` trigger (browser can never set a validity status; un-accepted quests can't be completed), `admin_resolve_quest_validity()`. Does **not** touch any economy function. |
| 12 | `supabase-phase13-spend-points.sql` | **Server-side point spending.** `spend_points()` (atomic debit, the only way a balance goes down), `care_pet()` (feed/wash/play: cost + stat boost in one transaction), and the `profiles_economy_guard` trigger (a non-admin browser/phone write can no longer change points, streaks, level, badges or role). Does **not** touch any economy award function. Required by the web build from the commit that introduces it — run it before deploying. |
| 13 | `supabase-phase13b-signup-role.sql` | **Sign-up can never create an admin.** `handle_new_user()` no longer reads `raw_user_meta_data.role` (always `'user'`); `profiles_signup_role_guard` BEFORE INSERT trigger forces `role = 'user'` on a direct client insert. Never updates an existing row — current admins keep their role; promote future admins by hand. Touches no economy function. |

## Phase 12 and the economy
Phase 12 deliberately leaves `complete_task` / `submit_completion` /
`rollback_completion` untouched. Completion eligibility for un-checked custom
quests is enforced by a **BEFORE UPDATE trigger** on `tasks`
(`tasks_validity_guard`) that raises `quest_not_eligible` when `completed` flips
to true on a quest whose `validity_status` is not `accepted`/`exempt` — the whole
`submit_completion` transaction aborts, so nothing is awarded. Starter quests
and every pre-Phase-12 row are `exempt`, so their award path is byte-for-byte
the same as before. Note: Postgres column-level `revoke` is ineffective while
the role holds the table-level grant (Supabase's default), which is why the
guard is a trigger keyed on `current_user`.

## Economy-critical files (edit with care)
`complete_task`, `submit_completion`, and `rollback_completion` are the award /
rollback path. When changing the cooldown or gate, always diff against the
**Phase 6** `complete_task` (file #4 / #9) — an earlier draft accidentally
flattened it and zeroed `points_earned`. Do not grant `complete_task` back to
`authenticated`.
