/*
 * Phase 13 — server-side point spending. Run with `npm test`.
 *
 * The property under test lives in Postgres, so this file is static guards:
 * the migration defines the functions and the guard trigger the way the
 * economy needs them, and the web client no longer writes its own balance.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const MIGRATION = read('supabase/supabase-phase13-spend-points.sql')
const GAME = read('src/context/GameContext.jsx')

const fn = (name) => {
  const m = new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`).exec(MIGRATION)
  assert.ok(m, `${name} not defined`)
  return m[0]
}

describe('1. spend_points is the only way a balance goes down', () => {
  test('security definer, pinned search_path, authenticated only', () => {
    const f = fn('spend_points')
    assert.match(f, /security definer/)
    assert.match(f, /set search_path = public/)
    assert.match(MIGRATION, /revoke all on function public\.spend_points\(integer, text\) from public, anon;/)
    assert.match(MIGRATION, /grant execute on function public\.spend_points\(integer, text\) to authenticated;/)
  })

  test('the balance check is inside the UPDATE (atomic), not a read-then-write', () => {
    const f = fn('spend_points')
    assert.match(f, /update profiles\s+set points = points - p_amount\s+where id = v_uid\s+and points >= p_amount\s+returning points/)
    assert.match(f, /if not found then[\s\S]*?'insufficient_points'/)
  })

  test('rejects anonymous, zero, negative and absurd amounts', () => {
    const f = fn('spend_points')
    assert.match(f, /if v_uid is null then[\s\S]*?'unauthenticated'/)
    assert.match(f, /p_amount is null or p_amount <= 0 or p_amount > 100000[\s\S]*?'invalid_amount'/)
  })

  test('only debits the caller — never takes a target user id', () => {
    assert.match(MIGRATION, /function public\.spend_points\(p_amount integer, p_reason text default null\)/)
    assert.match(MIGRATION, /function public\.care_pet\(p_action text\)/)
    assert.doesNotMatch(fn('spend_points'), /p_user|p_target/)
  })
})

describe('2. care_pet keeps cost and stat in one transaction', () => {
  const f = fn('care_pet')

  test('same numbers as the web has always used', () => {
    assert.match(f, /c_cost\s+constant integer := 10;/)
    assert.match(f, /c_boost\s+constant numeric := 30;/)
    assert.match(f, /least\(100, hunger \+ c_boost\)/)
  })

  test('debits with the same atomic pattern and stops before touching the stat', () => {
    assert.match(f, /update profiles\s+set points = points - c_cost\s+where id = v_uid\s+and points >= c_cost/)
    const debit = f.indexOf('points >= c_cost')
    const stat = f.indexOf('insert into pet_stats')
    assert.ok(debit < stat, 'debit must come before the stat write so a failed debit returns early')
  })

  test('accepts exactly feed / wash / play', () => {
    assert.match(f, /when 'feed' then 'hunger'/)
    assert.match(f, /when 'wash' then 'cleanliness'/)
    assert.match(f, /when 'play' then 'happiness'/)
    assert.match(f, /'invalid_action'/)
    assert.match(f, /'no_pet'/)
  })

  test('seeds a missing pet_stats row at the web baseline', () => {
    assert.match(f, /values \(v_uid, 80, 78, 72, now\(\)\)\s+on conflict \(user_id\) do nothing/)
    assert.match(GAME, /INITIAL_STATS = \{ hunger: 80, cleanliness: 78, happiness: 72 \}/)
  })
})

describe('3. the guard trigger closes the direct write', () => {
  const guard = fn('profiles_economy_guard')

  test('not security definer — it must see the real caller', () => {
    assert.doesNotMatch(guard, /security definer/)
    assert.match(guard, /current_user in \('anon', 'authenticated'\)/)
  })

  test('guards every award column, and role', () => {
    for (const c of ['points', 'total_points_earned', 'current_streak', 'longest_streak', 'last_completion_date', 'pet_level', 'badges', 'boss_battles_unlocked', 'role']) {
      assert.match(guard, new RegExp(`'${c}'`), `${c} not guarded`)
    }
  })

  test('lets admins through (cheat panel) and raises for everyone else', () => {
    assert.match(guard, /if is_admin\(\) then\s+return new;/)
    assert.match(guard, /raise exception 'economy_column_locked: % is managed by the server'/)
  })

  test('installed as a BEFORE UPDATE row trigger on profiles', () => {
    assert.match(MIGRATION, /drop trigger if exists profiles_economy_guard on public\.profiles;\s+create trigger profiles_economy_guard\s+before update on public\.profiles\s+for each row execute function public\.profiles_economy_guard\(\);/)
  })

  test('the cheat panel really does write as the admin user, so the bypass is needed', () => {
    assert.match(read('src/pages/AdminPage.jsx'), /supabase\.from\('profiles'\)\.update\(fields\)\.eq\('id', targetId\)/)
  })
})

describe('4. nothing else in the economy changed', () => {
  test('the award functions are not redefined', () => {
    for (const f of ['complete_task', 'submit_completion', 'rollback_completion', 'admin_review_completion', 'admin_resolve_quest_validity']) {
      assert.doesNotMatch(MIGRATION, new RegExp(`create or replace function (public\\.)?${f}\\b`), `${f} redefined`)
    }
  })

  test('the migration touches no table structure', () => {
    assert.doesNotMatch(MIGRATION, /alter table|create table|drop table|drop column/)
  })

  test('the migration lists its own rollback', () => {
    assert.match(MIGRATION, /drop trigger if exists profiles_economy_guard on public\.profiles;\s*\n--\s+drop function if exists public\.profiles_economy_guard\(\);/)
  })
})

describe('5. the web client no longer writes its own balance', () => {
  test('no direct write to profiles.points anywhere in src/', () => {
    assert.doesNotMatch(GAME, /\.update\(\{ points/)
    assert.doesNotMatch(GAME, /points: next/)
  })

  test('spend and care go through the RPCs', () => {
    assert.match(GAME, /supabase\.rpc\('spend_points', \{ p_amount: amount, p_reason: reason \}\)/)
    assert.match(GAME, /supabase\.rpc\('care_pet', \{ p_action: action \}\)/)
    assert.match(GAME, /carePet\('feed'/)
    assert.match(GAME, /carePet\('wash'/)
    assert.match(GAME, /carePet\('play'/)
    assert.match(GAME, /spendPoints\(accessory\.cost, `accessory:\$\{accessory\.id\}`\)/)
  })

  test('the balance shown is the one the server returned', () => {
    assert.match(GAME, /applyBalance\(data\?\.points\)/)
    assert.match(GAME, /if \(data\.stats\) \{ setPetStats\(data\.stats\)/)
  })

  test('care stats come from the server, not a local +30', () => {
    assert.doesNotMatch(GAME, /updateStat\(/)
    assert.doesNotMatch(GAME, /prev\[stat\] \+ delta/)
  })

  test('the "not enough points" wording survives for the instant toast', () => {
    assert.match(GAME, /Not enough points! Need \$\{amount\} 💸/)
  })
})
