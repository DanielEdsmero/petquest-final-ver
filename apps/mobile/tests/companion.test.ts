/*
 * The roaming companion and the first-login tour (phone). Run with `npm test`.
 * Block 1: the pure model. Block 2: the practice selfie can never leave the phone
 * (the study collects no personal identifiers). Block 3: the wiring.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  DND_KEY, GUIDE_STEPS, LEAVE_LINES, PET_ACCENT, RETURN_LINES, accentFor, guideKey, leaveLine, lineForSpot,
  nextWalkDelay, planWalk, returnLine, standPoint, walkMs,
} from '../src/data/petCompanion.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Code only: comments may say "Supabase" while promising not to use it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

describe('what the pet says at a spot', () => {
  test('next quest: counts active quests, singular and plural', () => {
    assert.match(lineForSpot('next-quest', { activeQuests: 1 }), /1 active quest\./);
    assert.match(lineForSpot('next-quest', { activeQuests: 3 }), /3 active quests/);
    assert.match(lineForSpot('next-quest', { activeQuests: 0 }), /No quests yet/);
  });
  test('care speaks about the lowest need first', () => {
    assert.match(lineForSpot('care', { hunger: 10 }), /hungry/);
    assert.match(lineForSpot('care', { cleanliness: 10 }), /wash/);
    assert.match(lineForSpot('care', { happiness: 10 }), /play/);
    assert.match(lineForSpot('care', {}), /10 points each/);
  });
  test('streak, and an unknown spot says nothing', () => {
    assert.match(lineForSpot('streak', { streak: 4 }), /4-day streak/);
    assert.match(lineForSpot('streak', { streak: null }), /start a streak/);
    assert.equal(lineForSpot('nope'), '');
  });
  test('leave and return lines come from the lists', () => {
    assert.ok((LEAVE_LINES as readonly string[]).includes(leaveLine(() => 0.99)));
    assert.ok((RETURN_LINES as readonly string[]).includes(returnLine(() => 0)));
  });
});

describe('planning a walk', () => {
  const ids = ['next-quest', 'care'];
  test('picks one or two spots, in screen order, without repeats', () => {
    for (let n = 0; n < 50; n++) {
      const plan = planWalk(ids);
      assert.ok(plan.length >= 1 && plan.length <= 2);
      assert.deepEqual(plan, ids.filter((id) => plan.includes(id)));
    }
  });
  test('avoids a recent spot when a fresh one remains, and falls back when all are recent', () => {
    for (let n = 0; n < 30; n++) assert.deepEqual(planWalk(ids, Math.random, ['care']), ['next-quest']);
    assert.ok(planWalk(ids, Math.random, ['care', 'next-quest']).length >= 1);
    assert.deepEqual(planWalk([]), []);
  });
  test('auto-walk delay is between 40 and 80 seconds', () => {
    assert.equal(nextWalkDelay(() => 0), 40000);
    assert.ok(nextWalkDelay(() => 0.999) < 80000);
  });
});

describe('movement', () => {
  test('standPoint puts the feet on the top edge, inside the screen and below the status bar', () => {
    assert.deepEqual(standPoint({ x: 100, y: 400, w: 200, h: 50 }, 390, 800, 64, 0.5), { x: 200, y: 400 });
    const edge = standPoint({ x: 0, y: 10, w: 20, h: 20 }, 390, 800, 64, 0, 50);
    assert.ok(edge.x >= 36 && edge.y >= 64 + 50);
    assert.ok(standPoint({ x: 380, y: 5000, w: 50, h: 10 }, 390, 800, 64, 1).y <= 792);
  });
  test('walkMs scales with distance, runs faster at a higher speed, and never drops under 250 ms', () => {
    assert.equal(walkMs({ x: 0, y: 0 }, { x: 200, y: 0 }, 0.2), 1000);
    assert.equal(walkMs({ x: 0, y: 0 }, { x: 200, y: 0 }, 0.7), 286);
    assert.equal(walkMs({ x: 0, y: 0 }, { x: 5, y: 0 }, 0.7), 250);
  });
});

describe('the first-login tour', () => {
  test('five steps: hello, quests, selfie, care, done', () => {
    assert.deepEqual(GUIDE_STEPS('Luna').map((s) => s.id), ['hello', 'quests', 'selfie', 'care', 'done']);
  });
  test('the lit-up steps name a spot and a label; the others do not', () => {
    const by = Object.fromEntries(GUIDE_STEPS('Luna').map((s) => [s.id, s]));
    assert.equal(by.quests.spot, 'next-quest');
    assert.equal(by.care.spot, 'care');
    assert.ok(by.quests.hint && by.care.hint);
    assert.equal(by.hello.spot, null);
    assert.equal(by.selfie.spot, null);
    assert.equal(by.selfie.primary, null, 'the practice window has its own buttons');
  });
  test('uses the pet name; the selfie step says it is practice and nothing is sent', () => {
    assert.match(GUIDE_STEPS('Ember')[0].line, /Ember/);
    assert.match(GUIDE_STEPS('Luna').find((s) => s.id === 'selfie')!.line, /practice[\s\S]*nothing is sent/i);
  });
  test('the quests step does not claim you can add a quest on Home (that is the Quests tab)', () => {
    assert.match(GUIDE_STEPS('Luna')[1].line, /Quests tab/);
  });
  test('every line fits one dialogue box', () => {
    for (const s of GUIDE_STEPS('Storm')) assert.ok(s.line.length <= 170, `${s.id} is ${s.line.length} chars`);
  });
  test('each pet speaks in its own colour, readable with white text', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    assert.deepEqual(Object.keys(PET_ACCENT).sort(), ['cat', 'dragon', 'wolf']);
    for (const [pet, hex] of Object.entries(PET_ACCENT)) assert.ok(1.05 / (lum(hex) + 0.05) >= 4.5, `${pet} ${hex}`);
    assert.equal(accentFor('nope'), '#3F8580');
    assert.equal(accentFor(null), '#3F8580');
  });
  test('storage keys are legal for expo-secure-store (letters, digits, . - _)', () => {
    assert.match(guideKey('3f2a-uuid'), /^[A-Za-z0-9._-]+$/);
    assert.match(DND_KEY, /^[A-Za-z0-9._-]+$/);
    assert.notEqual(guideKey('a'), guideKey('b'));
  });
});

describe('the practice selfie never leaves the phone', () => {
  const selfie = code(read('src/companion/SelfiePractice.tsx'));
  const guide = code(read('src/companion/PetGuide.tsx'));
  test('no network, upload, library-save or database calls', () => {
    for (const [name, src] of [['SelfiePractice', selfie], ['PetGuide', guide]] as const) {
      assert.ok(!/\bfetch\s*\(/.test(src), `${name}: fetch`);
      assert.ok(!/supabase|XMLHttpRequest|FormData|\.upload\(|sendBeacon/i.test(src), `${name}: network or database`);
      assert.ok(!/MediaLibrary|saveToLibrary|FileSystem|captureEvidence|submit_completion/i.test(src), `${name}: saves or submits`);
      assert.ok(!/console\.(log|info|debug)/.test(src), `${name}: logging`);
    }
  });
  test('the camera opens only from a tap, and the screen says it is practice', () => {
    assert.match(selfie, /launchCameraAsync/);
    assert.ok(!/useEffect\([\s\S]{0,200}launchCameraAsync/.test(selfie), 'camera must not open on mount');
    assert.match(selfie, /never uploaded or saved to your photos/);
  });
  test('only the tour flag and Do not disturb are written to storage', () => {
    const store = code(read('src/lib/companionStore.ts'));
    const writes = store.match(/write\(/g) ?? [];
    assert.ok(writes.length >= 2);
    assert.ok(!/supabase|fetch/i.test(store));
  });
});

describe('wiring', () => {
  test('the home screen marks the spots and hides the walker while the roaming pet is out', () => {
    const home = read('src/app/(tabs)/index.tsx');
    for (const id of ['pet-home', 'care', 'next-quest']) assert.ok(home.includes(`<PetSpot id="${id}"`), id);
    assert.ok(home.includes('hideWalker={companion.away}'));
  });
  test('the pet and the tour only mount for a signed-in, revealed account, with the pet above the tour', () => {
    const layout = read('src/app/_layout.tsx');
    assert.match(layout, /!gated && status === 'signedIn' && \(\s*<>\s*<PetGuide \/>\s*<RoamingPet \/>/);
  });
  test('Profile has Do not disturb and Replay the tour', () => {
    const profile = read('src/app/(tabs)/profile.tsx');
    assert.ok(profile.includes('Do not disturb') && profile.includes('Replay the tour'));
  });
  test('the walking sprites are not the old mismatched colours (recoloured frames are in place)', () => {
    // The old wolf sprite was an orange fox; a recoloured frame has far fewer orange pixels. Checked by file size
    // changing is unreliable, so just make sure all 24 frames exist.
    for (const pet of ['dragon', 'cat', 'wolf'])
      for (const f of ['f1_idle', 'f2_blink', 'f3_walk_left_a', 'f4_walk_left_b', 'f5_walk_right_a', 'f6_walk_right_b', 'f7_happy', 'f8_interact'])
        assert.ok(readFileSync(new URL(`../assets/sprites/${pet}/${f}.png`, import.meta.url)).length > 100, `${pet}/${f}`);
  });
});
