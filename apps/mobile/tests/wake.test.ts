/*
 * Phase 6 — the mandatory-but-skippable wake-up loader.
 *
 * The model is a copy of the web's, so block 1 reads the web file and compares
 * every constant the participant can perceive. Blocks 2–4 test the rules; 5–6
 * pin the component's wiring — timers, skip, reduced motion, the overlay — the
 * same way the web suite does.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MIN_MASCOT_LOADER_MS,
  WAKE_FALLBACK_MESSAGE,
  WAKE_PETS,
  WAKE_PHASE_MESSAGES,
  WAKE_PHASES,
  WAKE_TERMINAL_PHASES,
  WAKE_TIMINGS,
  resolveWakePet,
  shouldRevealAccount,
  wakeFrameForPhase,
  wakeMessageFor,
  wakePhaseAt,
  wakePhaseStarts,
} from '../src/data/wakeModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

const WEB = readWeb('src/config/pets.js');
const LOADER = readMobile('src/components/MascotWakeLoader.tsx');
const LAYOUT = readMobile('src/app/_layout.tsx');
const AUTH = readMobile('src/auth/AuthProvider.tsx');

describe('1. parity with the web loader — the participant sees the same thing on both clients', () => {
  test('phases and terminal states', () => {
    assert.match(WEB, /WAKE_PHASES = \['sleeping', 'waking', 'personalityAction', 'awake'\]/);
    assert.deepEqual(WAKE_PHASES, ['sleeping', 'waking', 'personalityAction', 'awake']);
    assert.match(WEB, /WAKE_TERMINAL_PHASES = \['waitingForAccount', 'skipped', 'error'\]/);
    assert.deepEqual(WAKE_TERMINAL_PHASES, ['waitingForAccount', 'skipped', 'error']);
  });

  test('timings, and therefore the minimum', () => {
    assert.match(WEB, /WAKE_TIMINGS = \{ sleeping: 1200, waking: 900, personalityAction: 1200, awake: 900 \}/);
    assert.deepEqual(WAKE_TIMINGS, { sleeping: 1200, waking: 900, personalityAction: 1200, awake: 900 });
    assert.equal(MIN_MASCOT_LOADER_MS, 4200);
  });

  test('every caption, word for word', () => {
    for (const [pet, { waking }] of Object.entries(WAKE_PETS)) {
      assert.ok(WEB.includes(`waking: '${waking}'`), `${pet} waking caption drifted`);
    }
    for (const [state, text] of Object.entries(WAKE_PHASE_MESSAGES)) {
      assert.ok(WEB.includes(`'${text}'`), `${state} caption drifted`);
    }
    assert.ok(WEB.includes(`WAKE_FALLBACK_MESSAGE = '${WAKE_FALLBACK_MESSAGE}'`));
  });

  test('the action frame suffixes match the web file names', () => {
    for (const [pet, { action }] of Object.entries(WAKE_PETS)) {
      assert.ok(WEB.includes(`action: '${action}'`), `${pet} action suffix drifted`);
    }
  });

  test('the reveal rule is the same expression', () => {
    assert.match(WEB, /return !!accountDataReady && \(!!minimumDone \|\| !!skipped\)/);
    assert.match(readMobile('src/data/wakeModel.ts'), /return !!accountDataReady && \(!!minimumDone \|\| !!skipped\)/);
  });
});

describe('2. the timed sequence', () => {
  test('starts asleep and lands where the timings say', () => {
    assert.deepEqual(wakePhaseStarts(), { sleeping: 0, waking: 1200, personalityAction: 2100, awake: 3300 });
    assert.equal(wakePhaseAt(0), 'sleeping');
    assert.equal(wakePhaseAt(1199), 'sleeping');
    assert.equal(wakePhaseAt(1200), 'waking');
    assert.equal(wakePhaseAt(2100), 'personalityAction');
    assert.equal(wakePhaseAt(3300), 'awake');
    assert.equal(wakePhaseAt(99999), 'awake', 'holds, never loops');
  });

  test('each phase maps to its own frame; terminal states hold the awake frame', () => {
    assert.deepEqual(WAKE_PHASES.map(wakeFrameForPhase), [0, 1, 2, 3]);
    for (const t of WAKE_TERMINAL_PHASES) assert.equal(wakeFrameForPhase(t), 3);
  });

  test('every phase is slow enough to read', () => {
    for (const [phase, ms] of Object.entries(WAKE_TIMINGS)) assert.ok(ms >= 900, `${phase} too fast`);
  });
});

describe('3. the reveal rule', () => {
  test('data early → held until the minimum', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: false }), false);
  });
  test('animation early → held until the data', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: false, minimumDone: true }), false);
  });
  test('both → reveal', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: true }), true);
  });
  test('skip drops the duration requirement but never the data requirement', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, skipped: true }), true);
    assert.equal(shouldRevealAccount({ accountDataReady: false, skipped: true }), false);
  });
  test('an error never reveals', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: true, skipped: true, error: true }), false);
  });
});

describe('4. companion selection and captions', () => {
  test('the real pet when known, in either id form', () => {
    assert.deepEqual(resolveWakePet('wolf'), { id: 'wolf', random: false });
    assert.deepEqual(resolveWakePet('mystic_cat'), { id: 'cat', random: false });
  });
  test('random only when unknown, and always one of the three', () => {
    assert.equal(resolveWakePet(null, () => 0.99).random, true);
    for (let i = 0; i < 30; i++) assert.ok(['dragon', 'cat', 'wolf'].includes(resolveWakePet(null, () => i / 30).id));
  });
  test('captions per state; a random stand-in gets the neutral line', () => {
    assert.equal(wakeMessageFor('dragon', 'sleeping'), 'Your pet is resting…');
    assert.equal(wakeMessageFor('dragon', 'waking'), 'Waking your Dragon…');
    assert.equal(wakeMessageFor('wolf', 'waking', false), WAKE_FALLBACK_MESSAGE);
    assert.equal(wakeMessageFor(null, 'waking'), WAKE_FALLBACK_MESSAGE);
    assert.equal(wakeMessageFor('cat', 'waitingForAccount'), 'Finishing your setup…');
  });
});

describe('5. the component', () => {
  test('all twelve frames exist and are the copied web frames', () => {
    const src = readMobile('src/data/wakeSprites.ts');
    const files = [...src.matchAll(/require\('@\/assets\/(pets\/wake\/[^']+)'\)/g)].map((m) => m[1]);
    assert.equal(files.length, 12);
    for (const f of files) {
      assert.ok(existsSync(path.join(MOBILE, 'assets', f)), `missing ${f}`);
      // Byte-identical to the web asset, so the parity of the *art* is exact.
      const web = path.join(REPO, 'public', f);
      assert.ok(existsSync(web), `web asset missing ${f}`);
      assert.ok(readFileSync(path.join(MOBILE, 'assets', f)).equals(readFileSync(web)), `${f} differs from the web copy`);
    }
  });

  test('every run starts asleep; timers are cleared on unmount, restart and error', () => {
    assert.match(LOADER, /setPhase\('sleeping'\); \/\/ every \(re\)start begins asleep/);
    assert.match(LOADER, /return \(\) => timers\.forEach\(clearTimeout\)/);
    assert.match(LOADER, /\}, \[restartToken, petId, error\]\)/);
    assert.match(LOADER, /if \(error\) return;/);
  });

  test('the minimum timer never clobbers a skip', () => {
    assert.match(LOADER, /setPhase\(\(p\) => \(p === 'skipped' \? p : 'waitingForAccount'\)\)/);
  });

  test('skip is a real button with the required label, and idempotent', () => {
    assert.match(LOADER, /accessibilityRole="button"/);
    assert.match(LOADER, /accessibilityLabel="Skip pet wake-up animation"/);
    assert.match(LOADER, /Skip animation →/);
    assert.match(LOADER, /minHeight: 44/);
    assert.match(LOADER, /if \(!prev\) skipCbRef\.current\?\.\(\)/);
    assert.match(LOADER, /firedRef = useRef\(false\)/);
  });

  test('skip stays visible while data is loading; only an error hides it', () => {
    const btn = LOADER.slice(LOADER.indexOf('{!error && ('), LOADER.indexOf('</Pressable>'));
    assert.ok(btn.length > 0);
    assert.doesNotMatch(btn, /accountDataReady/);
  });

  test('the companion is locked per instance', () => {
    assert.match(LOADER, /if \(lockRef\.current === null \|\| tokenRef\.current !== restartToken\)/);
  });

  test('reduced motion keeps the sequence and drops only the decoration', () => {
    // The sequence effect does not depend on reduceMotion…
    assert.match(LOADER, /\}, \[restartToken, petId, error\]\)/);
    // …only the glow loop and the cross-fade do.
    assert.match(LOADER, /if \(reduceMotion\) \{\s*\n\s*glow\.setValue/);
    assert.match(LOADER, /transition=\{reduceMotion \? 0 : 160\}/);
    assert.match(readMobile('src/hooks/useReducedMotion.ts'), /isReduceMotionEnabled/);
    assert.match(readMobile('src/hooks/useReducedMotion.ts'), /reduceMotionChanged/);
  });

  test('the glow loop is stopped on cleanup', () => {
    assert.match(LOADER, /return \(\) => loop\.stop\(\)/);
  });

  test('an accessible status describes the wait', () => {
    assert.match(LOADER, /Loading your PetQuest account\. Your pet is waking up\./);
    assert.match(LOADER, /accessibilityLiveRegion="polite"/);
  });

  test('it never fetches anything itself', () => {
    assert.doesNotMatch(LOADER, /supabase|fetch\(|await /);
  });
});

describe('6. the gate in the root layout', () => {
  test('the loader is an overlay above the navigator, not a replacement', () => {
    // Children (the Stack) are rendered unconditionally; the loader sits on top.
    assert.match(LAYOUT, /\{children\}\s*\n\s*\{gated && \(/);
    assert.match(LOADER, /position: 'absolute',\s*\n\s*top: 0,/);
    assert.doesNotMatch(LAYOUT, /return <LoadingScreen/);
  });

  test('the gate formula matches the web app', () => {
    assert.match(LAYOUT, /const gated = !accountDataReady \|\| \(!!accountId && revealedFor !== accountId\)/);
    assert.match(readWeb('src/App.jsx'), /const gated = !accountDataReady \|\| \(!!accountId && revealedFor !== accountId\)/);
  });

  test('the loader mounts when a sign-in STARTS, so it runs in parallel with the request', () => {
    const body = AUTH.slice(AUTH.indexOf('const signIn = useCallback'), AUTH.indexOf('const signOut = useCallback'));
    assert.ok(body.indexOf('setSigningIn(true)') < body.indexOf('signInWithPassword'), 'must flip before the network call');
    assert.match(body, /if \(error\) \{\s*\n\s*setSigningIn\(false\)/);
    assert.match(LAYOUT, /status !== 'loading' && !signingIn/);
  });

  test('a signed-out visitor is never held', () => {
    // No account id when signed out → the second clause is false → not gated
    // once the session question is settled.
    assert.match(LAYOUT, /const accountId = status === 'signedIn' \? \(profile\?\.id \?\? null\) : null/);
  });

  test('a failed profile load drops the gate rather than trapping', () => {
    assert.match(LAYOUT, /!\(status === 'signedIn' && profileLoading && !profile\)/);
    assert.match(AUTH, /setSigningIn\(false\); \/\/ the account is loaded \(or failed to\)/);
  });

  test('signing out forgets the reveal, so the next sign-in plays again', () => {
    assert.match(LAYOUT, /if \(status === 'signedOut'\) setRevealedFor\(null\)/);
  });

  test('the token does not change while the loader is up', () => {
    assert.match(LAYOUT, /if \(gated && !wasGated\.current\) setLoadId\(\(n\) => n \+ 1\)/);
    assert.match(LAYOUT, /restartToken=\{loadId\}/);
    assert.doesNotMatch(LAYOUT, /restartToken=\{accountId/);
  });

  test('the placeholder LoadingScreen survives only for the admin permission check', () => {
    const uses = ['src/app/_layout.tsx', 'src/app/admin/_layout.tsx'].filter((f) =>
      /<LoadingScreen/.test(readMobile(f)),
    );
    assert.deepEqual(uses, ['src/app/admin/_layout.tsx']);
  });
});
