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

## Economy-critical files (edit with care)
`complete_task`, `submit_completion`, and `rollback_completion` are the award /
rollback path. When changing the cooldown or gate, always diff against the
**Phase 6** `complete_task` (file #4 / #9) — an earlier draft accidentally
flattened it and zeroed `points_earned`. Do not grant `complete_task` back to
`authenticated`.
