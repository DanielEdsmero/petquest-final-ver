/*
 * Phase 13b — sign-up can never create an admin. Run with `npm test`.
 *
 * Postgres is not available here, so block 1 reads the role expression out of
 * the migration's handle_new_user() and evaluates it the way Postgres would
 * for a set of sign-up payloads; the rest are static guards. The real
 * database check is the acceptance block at the bottom of the SQL file.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const MIGRATION = read('supabase/supabase-phase13b-signup-role.sql')
const SCHEMA = read('supabase/supabase-schema.sql')

/** The body of handle_new_user() as defined in the migration. */
function handleNewUser() {
  const m = /create or replace function public\.handle_new_user\(\)[\s\S]*?\n\$\$;/.exec(MIGRATION)
  assert.ok(m, 'handle_new_user not defined in the migration')
  return m[0]
}

/**
 * The three expressions inside `values ( … )` of the profiles insert, split
 * at top-level commas (the username expression contains nested calls).
 */
function insertedValues(body) {
  const start = body.indexOf('values (')
  assert.ok(start >= 0)
  let depth = 0, cur = '', out = []
  for (let i = start + 'values ('.length; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(') depth++
    if (ch === ')') { if (depth === 0) break; depth-- }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.replace(/--[^\n]*/g, '').trim())
}

/**
 * Evaluate a value expression against a fake `new` auth.users row, the way
 * Postgres would. Supports exactly the constructs the migration uses; anything
 * else fails the test rather than silently passing.
 */
function evaluate(expr, row) {
  if (/^'[^']*'$/.test(expr)) return expr.slice(1, -1)
  if (expr === 'new.id') return row.id
  const meta = /^new\.raw_user_meta_data->>'(\w+)'$/.exec(expr)
  if (meta) return row.raw_user_meta_data?.[meta[1]] ?? null
  const split = /^split_part\(new\.email, '@', 1\)$/.exec(expr)
  if (split) return row.email.split('@')[0]
  const btrim = /^btrim\((.+)\)$/.exec(expr)
  if (btrim) { const v = evaluate(btrim[1], row); return v == null ? null : v.trim() }
  const nullif = /^nullif\((.+), ''\)$/.exec(expr)
  if (nullif) { const v = evaluate(nullif[1], row); return v === '' ? null : v }
  const coalesce = /^coalesce\((.+)\)$/.exec(expr)
  if (coalesce) {
    for (const part of insertedValues(`values (${coalesce[1]})`)) {
      const v = evaluate(part, row)
      if (v != null) return v
    }
    return null
  }
  assert.fail(`unsupported SQL expression in handle_new_user: ${expr}`)
}

const signUp = (email, data = {}) => ({ id: 'uuid-1', email, raw_user_meta_data: data })

describe('1. handle_new_user() always creates a normal user', () => {
  const [idExpr, usernameExpr, roleExpr] = insertedValues(handleNewUser())

  test('the role column receives the literal user, not a metadata read', () => {
    assert.equal(roleExpr, "'user'")
    assert.doesNotMatch(roleExpr, /raw_user_meta_data/)
  })

  test("sign-up metadata role='admin' still creates role='user'", () => {
    const payloads = [
      signUp('a@example.com', { username: 'a', role: 'admin' }),
      signUp('b@example.com', { role: 'admin' }),
      signUp('c@example.com', { role: 'service_role' }),
      signUp('d@example.com', { username: 'd' }),
      signUp('e@example.com'),
    ]
    for (const row of payloads) {
      assert.equal(evaluate(roleExpr, row), 'user', `payload ${JSON.stringify(row.raw_user_meta_data)} escalated`)
      assert.equal(evaluate(idExpr, row), row.id)
    }
  })

  test('the username still comes from metadata, with the e-mail local part as fallback', () => {
    assert.equal(evaluate(usernameExpr, signUp('dan@example.com', { username: 'Daniel' })), 'Daniel')
    assert.equal(evaluate(usernameExpr, signUp('dan@example.com', { username: '   ' })), 'dan')
    assert.equal(evaluate(usernameExpr, signUp('dan@example.com')), 'dan')
  })

  test('the old schema definition is the vulnerable one this replaces', () => {
    const old = /create or replace function handle_new_user\(\)[\s\S]*?\n\$\$;/.exec(SCHEMA)[0]
    const [, , oldRole] = insertedValues(old)
    assert.equal(evaluate(oldRole, signUp('x@example.com', { role: 'admin' })), 'admin', 'the schema version should still show the hole (it is superseded by 13b)')
  })

  test('re-fires cannot error the sign-up, and the trigger is re-attached to auth.users', () => {
    assert.match(handleNewUser(), /on conflict \(id\) do nothing/)
    assert.match(MIGRATION, /create trigger on_auth_user_created\s+after insert on auth\.users\s+for each row execute procedure public\.handle_new_user\(\);/)
  })
})

describe('2. a direct client insert cannot carry a role either', () => {
  const guard = /create or replace function public\.profiles_signup_role_guard\(\)[\s\S]*?\n\$\$;/.exec(MIGRATION)?.[0]

  test('defined, not security definer, forces user for non-admin clients', () => {
    assert.ok(guard)
    assert.doesNotMatch(guard, /security definer/)
    assert.match(guard, /if current_user in \('anon', 'authenticated'\) and not is_admin\(\) then\s+new\.role := 'user';/)
  })

  test('installed BEFORE INSERT on profiles', () => {
    assert.match(MIGRATION, /create trigger profiles_signup_role_guard\s+before insert on public\.profiles\s+for each row execute function public\.profiles_signup_role_guard\(\);/)
  })

  test('the RLS policy that makes this necessary is still there', () => {
    assert.match(SCHEMA, /create policy "profiles: own insert"\s+on profiles for insert\s+with check \( auth\.uid\(\) = id \)/)
  })
})

describe('3. existing admins and the economy are untouched', () => {
  test('nothing updates or deletes a profiles row', () => {
    assert.doesNotMatch(MIGRATION, /update profiles|update public\.profiles|delete from profiles/)
  })

  test('no award or spending function is redefined', () => {
    for (const f of ['complete_task', 'submit_completion', 'rollback_completion', 'spend_points', 'care_pet', 'profiles_economy_guard', 'admin_review_completion', 'admin_resolve_quest_validity', 'is_admin']) {
      assert.doesNotMatch(MIGRATION, new RegExp(`create or replace function (public\\.)?${f}\\b`), `${f} redefined`)
    }
  })

  test('no table structure changes, and points are never mentioned', () => {
    assert.doesNotMatch(MIGRATION, /alter table|create table|drop table|drop column/)
    assert.doesNotMatch(MIGRATION.replace(/--[^\n]*/g, ''), /points/)
  })

  test('the web sign-up sends only a username', () => {
    assert.match(read('src/context/GameContext.jsx'), /supabase\.auth\.signUp\(\{ email, password, options: \{ data: \{ username \} \} \}\)/)
  })
})
