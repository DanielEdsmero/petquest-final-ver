/*
 * Phase 2 — session storage and route guards.
 *
 * Run with `npm test` in apps/mobile. Node 24 strips TypeScript types natively,
 * so these import the real modules with no test framework, transpiler or mocking
 * library added to the project. Only dependency-free logic is covered here;
 * anything importing React Native belongs in the Phase 8 device/integration
 * suite.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createChunkedStorage,
  splitByBytes,
  byteLength,
  CHUNK_BYTES,
  type KeyValueStore,
} from '../src/lib/chunkedStorage.ts';
import {
  resolveRedirect,
  shouldShowRestoring,
  friendlyAuthError,
  validateCredentials,
  isAdminRoute,
  isAuthRoute,
  Routes,
} from '../src/auth/guards.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** Every .ts/.tsx file under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** In-memory stand-in for SecureStore that enforces its 2048-byte limit. */
function fakeStore(limit = 2048) {
  const map = new Map<string, string>();
  const rejected: string[] = [];
  const store: KeyValueStore = {
    async getItemAsync(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItemAsync(key, value) {
      if (byteLength(value) > limit) {
        rejected.push(key);
        throw new Error(`value for ${key} exceeds ${limit} bytes`);
      }
      map.set(key, value);
    },
    async deleteItemAsync(key) {
      map.delete(key);
    },
  };
  return { store, map, rejected };
}

/**
 * A realistic Supabase session: two JWTs plus a user object. Real ones run
 * roughly 2-4 KB, which is what makes chunking necessary at all.
 */
function fakeSession(padding = 1800) {
  const jwt = (n: number) => `eyJhbGciOiJIUzI1NiJ9.${'A'.repeat(n)}.sig`;
  return JSON.stringify({
    access_token: jwt(padding),
    refresh_token: jwt(64),
    expires_at: 1893456000,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'participant@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'Daniel' },
    },
  });
}

describe('1. chunked session storage', () => {
  test('a real-sized session exceeds the SecureStore limit unchunked', () => {
    // If this ever stops being true the chunking is still correct, but the
    // reason it exists would have changed.
    assert.ok(byteLength(fakeSession()) > 2048, 'sample session should be over 2048 bytes');
  });

  test('round-trips a session that is far larger than one entry', async () => {
    const { store, map, rejected } = fakeStore();
    const storage = createChunkedStorage(store);
    const session = fakeSession(4000);

    await storage.setItem('sb-proj-auth-token', session);
    assert.deepEqual(rejected, [], 'no individual write may exceed the limit');
    assert.ok(map.size > 2, 'should have split into a manifest plus several chunks');

    assert.equal(await storage.getItem('sb-proj-auth-token'), session);
  });

  test('every stored entry stays under the limit', async () => {
    const { store, map } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', fakeSession(6000));
    for (const [key, value] of map) {
      assert.ok(byteLength(value) <= 2048, `${key} is ${byteLength(value)} bytes`);
    }
  });

  test('a short value is stored whole, with no chunk keys', async () => {
    const { store, map } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'hello');
    assert.deepEqual([...map.keys()], ['k']);
    assert.equal(await storage.getItem('k'), 'hello');
  });

  test('a missing key reads back as null', async () => {
    const { store } = fakeStore();
    assert.equal(await createChunkedStorage(store).getItem('nope'), null);
  });

  test('removeItem deletes the manifest and every chunk', async () => {
    const { store, map } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', fakeSession(4000));
    await storage.removeItem('k');
    assert.equal(map.size, 0, 'no orphaned chunks may survive sign-out');
    assert.equal(await storage.getItem('k'), null);
  });

  test('overwriting with a shorter value leaves no stale chunks behind', async () => {
    const { store, map } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', fakeSession(8000));
    const many = map.size;
    await storage.setItem('k', fakeSession(1200));
    assert.ok(map.size < many, 'chunk count should shrink');
    assert.equal(await storage.getItem('k'), fakeSession(1200));
    // A stale chunk from the longer value would corrupt a later read.
    const indexes = [...map.keys()].filter((k) => k.startsWith('k.')).length;
    assert.equal(map.size, indexes + 1, 'exactly the manifest plus current chunks');
  });

  test('a torn entry reads as absent rather than truncated', async () => {
    const { store, map } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', fakeSession(4000));
    map.delete('k.1'); // simulate a partial write / keychain eviction
    assert.equal(await storage.getItem('k'), null, 'must not return a half session');
  });

  test('a value that itself looks like a manifest is not mistaken for one', async () => {
    const { store } = fakeStore();
    const storage = createChunkedStorage(store);
    const tricky = JSON.stringify({ __chunks: 3, len: 999 });
    await storage.setItem('k', tricky);
    assert.equal(await storage.getItem('k'), tricky);
  });

  test('multi-byte characters are never split mid-character', () => {
    const value = '🐉'.repeat(400) + 'ünïcodé';
    for (const size of [8, 16, 64, CHUNK_BYTES]) {
      const chunks = splitByBytes(value, size);
      for (const c of chunks) assert.ok(byteLength(c) <= size, `chunk over ${size} bytes`);
      assert.equal(chunks.join(''), value, `lossless at ${size} bytes`);
    }
  });

  test('a unicode-heavy session round-trips intact', async () => {
    const { store, rejected } = fakeStore();
    const storage = createChunkedStorage(store);
    const value = JSON.stringify({ user: { username: '🐉'.repeat(900) } });
    await storage.setItem('k', value);
    assert.deepEqual(rejected, []);
    assert.equal(await storage.getItem('k'), value);
  });

  test('the empty string round-trips', async () => {
    const { store } = fakeStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', '');
    assert.equal(await storage.getItem('k'), '');
  });
});

describe('2. route guards', () => {
  test('while loading, nobody is redirected', () => {
    assert.equal(resolveRedirect({ status: 'loading', isAdmin: false, segments: [] }), null);
    assert.equal(
      resolveRedirect({ status: 'loading', isAdmin: false, segments: ['admin'] }),
      null,
    );
    assert.equal(shouldShowRestoring('loading'), true);
    assert.equal(shouldShowRestoring('signedOut'), false);
    assert.equal(shouldShowRestoring('signedIn'), false);
  });

  test('a signed-out user is sent to login from anywhere else', () => {
    for (const segments of [[], ['index'], ['admin'], ['quest', 'create']]) {
      assert.equal(
        resolveRedirect({ status: 'signedOut', isAdmin: false, segments }),
        Routes.login,
        `not redirected from ${JSON.stringify(segments)}`,
      );
    }
  });

  test('a signed-out user already on login stays there (no redirect loop)', () => {
    assert.equal(
      resolveRedirect({ status: 'signedOut', isAdmin: false, segments: ['(auth)', 'login'] }),
      null,
    );
  });

  test('a signed-in user is pushed off the login screen', () => {
    assert.equal(
      resolveRedirect({ status: 'signedIn', isAdmin: false, segments: ['(auth)', 'login'] }),
      Routes.home,
    );
  });

  test('a non-admin cannot stay on an admin route', () => {
    assert.equal(
      resolveRedirect({ status: 'signedIn', isAdmin: false, segments: ['admin'] }),
      Routes.home,
    );
    assert.equal(
      resolveRedirect({ status: 'signedIn', isAdmin: false, segments: ['admin', 'validity'] }),
      Routes.home,
    );
  });

  test('an admin may stay on an admin route', () => {
    assert.equal(
      resolveRedirect({ status: 'signedIn', isAdmin: true, segments: ['admin'] }),
      null,
    );
  });

  test('a signed-in user is left alone on ordinary routes', () => {
    assert.equal(resolveRedirect({ status: 'signedIn', isAdmin: false, segments: [] }), null);
    assert.equal(
      resolveRedirect({ status: 'signedIn', isAdmin: false, segments: ['quest', 'create'] }),
      null,
    );
  });

  test('segment helpers only match the group they name', () => {
    assert.equal(isAuthRoute(['(auth)', 'login']), true);
    assert.equal(isAuthRoute(['admin']), false);
    assert.equal(isAdminRoute(['admin', 'validity']), true);
    assert.equal(isAdminRoute(['(auth)']), false);
    assert.equal(isAdminRoute([]), false);
  });
});

describe('3. credential validation and error messages', () => {
  test('matches the web login rules', () => {
    assert.equal(validateCredentials('', 'password'), 'Email is required');
    assert.equal(validateCredentials('a@b.com', ''), 'Password is required');
    assert.equal(
      validateCredentials('a@b.com', '12345'),
      'Password must be at least 6 characters',
    );
    assert.equal(validateCredentials('a@b.com', '123456'), null);
  });

  test('wrong password and unknown email are indistinguishable', () => {
    // Supabase returns one message for both on purpose; keep it that way so the
    // form cannot be used to enumerate registered addresses.
    assert.equal(friendlyAuthError('Invalid login credentials'), 'Invalid email or password.');
  });

  test('actionable cases get their own message', () => {
    assert.match(friendlyAuthError('Email not confirmed'), /confirm your email/i);
    assert.match(friendlyAuthError('Too many requests'), /wait a moment/i);
    assert.match(friendlyAuthError('Network request failed'), /connection/i);
  });

  test('an empty or unknown error still says something useful', () => {
    assert.match(friendlyAuthError(null), /went wrong/i);
    assert.match(friendlyAuthError(''), /went wrong/i);
    assert.equal(friendlyAuthError('Database is on fire'), 'Database is on fire');
  });
});

describe('4. no private credentials in the mobile source', () => {
  // Walk the whole tree rather than listing files: a hardcoded list goes stale
  // the moment a screen moves, and a new file must be covered automatically.
  const sources = walk(path.join(ROOT, 'src'));

  test('the client is built from the public URL and anon key only', () => {
    const src = read('src/lib/supabase.ts');
    assert.match(src, /Env\.supabaseUrl/);
    assert.match(src, /Env\.supabaseAnonKey/);
    assert.doesNotMatch(src, /SERVICE_ROLE|service_role|GEMINI/i);
  });

  test('every source file is free of private-key references', () => {
    assert.ok(sources.length >= 10, 'expected the walk to find the source tree');
    for (const f of sources) {
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/, `${f} references the service key`);
      assert.doesNotMatch(src, /GEMINI_API_KEY\s*[:=]/, `${f} references the Gemini key`);
    }
  });

  test('only EXPO_PUBLIC_ variables are read', () => {
    const src = read('src/lib/env.ts');
    const reads = [...src.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map((m) => m[1]);
    assert.ok(reads.length >= 3, 'expected the three public variables');
    for (const name of reads) {
      assert.ok(name.startsWith('EXPO_PUBLIC_'), `${name} is not a public variable`);
    }
  });

  test('.env is git-ignored but .env.example is committed', () => {
    assert.match(read('.gitignore'), /^\.env$/m);
    const example = read('.env.example');
    assert.match(example, /EXPO_PUBLIC_SUPABASE_URL/);
    // The example must never carry a real-looking secret.
    assert.doesNotMatch(example, /^\s*(SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY)=/m);
  });
});

describe('5. session handling contract', () => {
  test('the client disables URL session detection (no window in RN)', () => {
    assert.match(read('src/lib/supabase.ts'), /detectSessionInUrl:\s*false/);
  });

  test('sessions persist and auto-refresh', () => {
    const src = read('src/lib/supabase.ts');
    assert.match(src, /persistSession:\s*true/);
    assert.match(src, /autoRefreshToken:\s*true/);
    assert.match(src, /storage:\s*sessionStorage/);
  });

  test('auto-refresh follows the foreground, and is torn down', () => {
    const src = read('src/lib/supabase.ts');
    assert.match(src, /AppState\.addEventListener/);
    assert.match(src, /startAutoRefresh\(\)/);
    assert.match(src, /stopAutoRefresh\(\)/);
    assert.match(src, /subscription\.remove\(\)/);
  });

  test('an expired session clears the profile and lands on login', () => {
    const src = read('src/auth/AuthProvider.tsx');
    assert.match(src, /event === 'SIGNED_OUT' \|\| !next/);
    assert.match(src, /setProfile\(null\)/);
  });

  test('a failed profile load fails closed rather than crashing', () => {
    const src = read('src/auth/AuthProvider.tsx');
    assert.match(src, /isAdmin:\s*profile\?\.role === 'admin'/);
    assert.match(src, /console\.warn\('\[auth\] profile load failed/);
  });

  test('a stale profile fetch cannot apply to a different user', () => {
    const src = read('src/auth/AuthProvider.tsx');
    assert.match(src, /activeUserId\.current !== userId/);
  });

  test('the auth subscription is unsubscribed on unmount', () => {
    assert.match(read('src/auth/AuthProvider.tsx'), /subscription\.unsubscribe\(\)/);
  });

  test('the admin group gates on the role itself, not just navigation', () => {
    const src = read('src/app/admin/_layout.tsx');
    assert.match(src, /if \(!isAdmin\) return <Redirect href="\/" \/>/);
  });
});
