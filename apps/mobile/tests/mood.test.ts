/*
 * Stat-reactive companion: the presentation-state selector, dialogue,
 * species flourishes, the mood-aware walker, and the View Pet screen.
 *
 * Blocks 1–4 drive the pure models. Blocks 5–6 are static guards: the mood
 * is derived from server stats only, reactions follow a confirmed reply,
 * View Pet is a real route with the same care hook, and nothing new writes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CareStats } from '../src/data/careModel.ts';
import {
  BEHAVIOUR,
  FLOURISH,
  LINES,
  MOOD_CUE,
  MOOD_FRAME,
  MOOD_LABEL,
  THRESHOLDS,
  linesFor,
  nextDialogue,
  rawMood,
  resolveMood,
  type Mood,
} from '../src/data/moodModel.ts';
import { PET_HOMES, type HomeId } from '../src/data/petHomeModel.ts';
import { PET_CATALOG, type PetId } from '../src/data/petModel.ts';
import { HOME_LAYOUT, applyStep, frameFor, nextStep, pointWithRole, seededRng, startPoint, type Machine, type SpriteState } from '../src/data/spriteModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');
const app = (p: string) => read(path.join('src', 'app', p));
const HOMES = Object.keys(PET_HOMES) as HomeId[];
const PETS = Object.keys(PET_CATALOG) as PetId[];

const stats = (hunger: number, cleanliness: number, happiness: number): CareStats => ({ hunger, cleanliness, happiness });

describe('1. presentation state from server stats', () => {
  test('the fixed priority holds: needsCleaning → hungry → sad → balanced → happy', () => {
    assert.equal(rawMood(stats(80, 10, 80)), 'unclean');
    assert.equal(rawMood(stats(20, 30, 80)), 'unclean', 'cleanliness is first even when hunger is lower');
    assert.equal(rawMood(stats(20, 60, 20)), 'hungry', 'then hunger, before happiness');
    assert.equal(rawMood(stats(50, 30, 80)), 'unclean');
    assert.equal(rawMood(stats(50, 50, 20)), 'sad');
    assert.equal(rawMood(stats(50, 50, 50)), 'balanced');
    assert.equal(rawMood(stats(50, 50, 85)), 'happy');
    assert.equal(rawMood(stats(85, 85, 85)), 'thriving');
    assert.equal(rawMood(null), 'balanced', 'no stats is calm, not a complaint');
  });

  test('a change is held back near a boundary until the cooldown passes', () => {
    const t0 = 1_000_000;
    let m = resolveMood(null, stats(50, 50, 50), t0);
    assert.equal(m.mood, 'balanced');
    // Happiness creeps to 80 — over the line, but by less than the hysteresis band and within the cooldown.
    m = resolveMood(m, stats(50, 50, 80), t0 + 1000);
    assert.equal(m.mood, 'balanced', 'held: within cooldown and inside the hysteresis band');
    // Same value once the cooldown has passed: accepted.
    m = resolveMood(m, stats(50, 50, 80), t0 + THRESHOLDS.cooldownMs + 1);
    assert.equal(m.mood, 'happy');
    // Back to 78 seconds later: held (78 ≥ 80 − 5).
    m = resolveMood(m, stats(50, 50, 78), t0 + THRESHOLDS.cooldownMs + 2000);
    assert.equal(m.mood, 'happy');
  });

  test('a clear change — a care action landing — is accepted immediately', () => {
    const t0 = 5_000_000;
    let m = resolveMood(null, stats(20, 60, 60), t0);
    assert.equal(m.mood, 'hungry');
    // Feed: hunger 20 → 50, well past the band. No waiting.
    m = resolveMood(m, stats(50, 60, 60), t0 + 500);
    assert.equal(m.mood, 'balanced');
    // A bath from very low straight to 70: accepted too.
    m = resolveMood(resolveMood(null, stats(60, 10, 60), t0), stats(60, 70, 60), t0 + 500);
    assert.equal(m.mood, 'balanced');
  });

  test('every mood has a frame, a cue, a label and behaviour odds', () => {
    for (const mood of Object.keys(MOOD_LABEL) as Mood[]) {
      assert.ok(MOOD_FRAME[mood]);
      assert.ok(mood in MOOD_CUE);
      assert.ok(BEHAVIOUR[mood]);
    }
    // Low moods never use the happy frame; the portrait is never "distorted" into a face we do not have.
    for (const mood of ['unclean', 'hungry', 'sad', 'balanced'] as Mood[]) assert.equal(MOOD_FRAME[mood], 'idle');
    assert.equal(MOOD_FRAME.happy, 'happy');
    assert.equal(MOOD_CUE.unclean, 'dust');
    assert.equal(BEHAVIOUR.sad.idleScale > BEHAVIOUR.happy.idleScale, true);
    assert.equal(BEHAVIOUR.hungry.foodBias > 0, true);
    assert.equal(BEHAVIOUR.balanced.celebrateChance, 0);
    assert.ok(BEHAVIOUR.thriving.celebrateChance > BEHAVIOUR.happy.celebrateChance);
  });
});

describe('2. dialogue', () => {
  test('every mood has at least two generic lines; none claims points or approval', () => {
    for (const mood of Object.keys(MOOD_LABEL) as Mood[]) assert.ok(linesFor(mood, null).length >= 2, mood);
    for (const l of LINES) {
      if (l.mood === 'verified') continue;
      assert.doesNotMatch(l.text, /point|award|approved|verified|\+\d/i, l.text);
    }
    assert.ok(LINES.some((l) => l.mood === 'verified'));
  });

  test('species lines come first for their species and never show for another', () => {
    assert.equal(linesFor('unclean', 'dragon')[0], 'My scales feel gritty.');
    assert.ok(!linesFor('unclean', 'cat').includes('My scales feel gritty.'));
    assert.ok(!linesFor('unclean', null).includes('My scales feel gritty.'));
  });

  test('the cooldown holds the current line; a forced event bypasses it; no immediate repeat', () => {
    const rng = seededRng(3);
    const t0 = 10_000;
    const first = nextDialogue(null, 'balanced', null, t0, rng)!;
    assert.ok(first.text);
    assert.equal(nextDialogue(first, 'hungry', null, t0 + 1000, rng), first, 'held by the cooldown');
    const forced = nextDialogue(first, 'verified', null, t0 + 1000, rng, true)!;
    assert.equal(forced.text, 'You did it! I’m proud of you.');
    const later = nextDialogue(first, 'balanced', null, t0 + THRESHOLDS.messageCooldownMs + 1, rng)!;
    assert.notEqual(later.text, first.text, 'never the same line twice in a row');
  });
});

describe('3. species flourishes and home spots', () => {
  test('each companion has its own flourish', () => {
    for (const pet of PETS) assert.ok(FLOURISH[pet].hops.length >= 1, pet);
    assert.equal(FLOURISH.dragon.hoverMs > 0, true, 'the dragon hovers');
    assert.equal(FLOURISH.cat.frame, 'interact', 'the cat stretches');
    assert.ok(FLOURISH.wolf.hops.length >= 3, 'the wolf bounces');
    assert.equal(frameFor('celebrate', 0, 'cat'), 'interact');
    assert.equal(frameFor('celebrate', 0, 'dragon'), 'happy');
    assert.equal(frameFor('rest', 0, 'wolf'), 'interact');
  });

  test('every home has a rest spot; every companion home has a food spot; all inside the strip', () => {
    for (const home of HOMES) {
      const rest = pointWithRole(home, 'rest');
      assert.ok(rest, `${home} has no rest spot`);
      const a = HOME_LAYOUT[home].area;
      assert.ok(rest!.at.x >= a.xMin && rest!.at.x <= a.xMax && rest!.at.y >= a.yMin && rest!.at.y <= a.yMax);
    }
    for (const home of ['sunlit_meadow', 'moonlit_cottage', 'ember_cavern', 'crystal_cavern'] as HomeId[]) assert.ok(pointWithRole(home, 'food'), `${home} has no food spot`);
  });
});

describe('4. the walker follows the mood', () => {
  function trace(home: HomeId, mood: Mood, petId: PetId, seed: number, n = 400): SpriteState[] {
    const rng = seededRng(seed);
    let m: Machine = { state: 'idle', at: startPoint(home) };
    const out: SpriteState[] = [];
    for (let i = 0; i < n; i++) {
      const s = nextStep(m, home, rng, false, { mood, petId });
      out.push(s.state);
      m = applyStep(m, s);
    }
    return out;
  }
  const count = (t: SpriteState[], s: SpriteState) => t.filter((x) => x === s).length;

  test('a happy or thriving pet celebrates; a low or balanced pet never does', () => {
    for (const pet of PETS) {
      assert.ok(count(trace('ember_cavern', 'thriving', pet, 1), 'celebrate') > 0, `${pet} never celebrates`);
      assert.ok(count(trace('ember_cavern', 'happy', pet, 1), 'celebrate') > 0);
      for (const mood of ['unclean', 'hungry', 'sad', 'balanced'] as Mood[]) assert.equal(count(trace('ember_cavern', mood, pet, 1), 'celebrate'), 0, `${pet} celebrated while ${mood}`);
    }
  });

  test('an unclean pet rests more than a happy one; a hungry pet goes to the food spot more', () => {
    const restUnclean = count(trace('moonlit_cottage', 'unclean', 'cat', 7), 'rest');
    const restHappy = count(trace('moonlit_cottage', 'happy', 'cat', 7), 'rest');
    assert.ok(restUnclean > restHappy, `rest unclean=${restUnclean} happy=${restHappy}`);

    const foodVisits = (mood: Mood) => {
      const rng = seededRng(11);
      let m: Machine = { state: 'idle', at: startPoint('ember_cavern') };
      let visits = 0;
      for (let i = 0; i < 600; i++) {
        const s = nextStep(m, 'ember_cavern', rng, false, { mood, petId: 'dragon' });
        if (s.state === 'interact' && s.interaction?.role === 'food') visits++;
        m = applyStep(m, s);
      }
      return visits;
    };
    assert.ok(foodVisits('hungry') > foodVisits('balanced'), `food hungry=${foodVisits('hungry')} balanced=${foodVisits('balanced')}`);
  });

  test('resting happens at the rest spot, never elsewhere', () => {
    for (const home of HOMES) {
      const rng = seededRng(5);
      let m: Machine = { state: 'idle', at: startPoint(home) };
      for (let i = 0; i < 400; i++) {
        const s = nextStep(m, home, rng, false, { mood: 'unclean', petId: 'wolf' });
        if (s.state === 'rest') {
          assert.equal(s.interaction?.role, 'rest');
          assert.ok(Math.abs(s.to.x - s.interaction!.at.x) < 0.121, `${home}: rested away from the bed`);
        }
        m = applyStep(m, s);
      }
    }
  });

  test('a sad pet lingers: longer idles, no flourish', () => {
    const rng = seededRng(9);
    const idleSad: number[] = [];
    const idleHappy: number[] = [];
    let m: Machine = { state: 'blink', at: startPoint('sunlit_meadow') };
    for (let i = 0; i < 50; i++) idleSad.push(nextStep(m, 'sunlit_meadow', rng, false, { mood: 'sad', petId: 'wolf' }).durationMs);
    for (let i = 0; i < 50; i++) idleHappy.push(nextStep(m, 'sunlit_meadow', rng, false, { mood: 'happy', petId: 'wolf' }).durationMs);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(avg(idleSad) > avg(idleHappy) * 1.5);
  });

  test('reduce motion still stands and blinks whatever the mood', () => {
    for (const mood of Object.keys(MOOD_LABEL) as Mood[]) {
      const rng = seededRng(2);
      let m: Machine = { state: 'idle', at: startPoint('crystal_cavern') };
      for (let i = 0; i < 100; i++) {
        const s = nextStep(m, 'crystal_cavern', rng, true, { mood, petId: 'cat' });
        assert.ok(['idle', 'blink'].includes(s.state), `${mood}: ${s.state} under reduce motion`);
        m = applyStep(m, s);
      }
    }
  });
});

describe('5. screens: mood from server stats, reactions from confirmed replies', () => {
  test('useMood reads only stats and a server-confirmed event; never writes', () => {
    const hook = read('src/hooks/useMood.ts');
    assert.match(hook, /resolveMood\(prev, stats, now\)/);
    assert.match(hook, /nextDialogue\(prev, resting \? 'resting' : mood, petId, now, Math\.random\)/);
    assert.doesNotMatch(hook, /supabase|rpc|fetch\(/);
  });

  test('Home and Pet feed the sprite the same mood; the "verified" line needs a verified row', () => {
    const home = app('(tabs)/index.tsx');
    assert.match(home, /useMood\(/);
    assert.match(home, /c\.status === 'verified' && c\.admin_reviewed_at/);
    assert.match(home, /\{ kind: 'verified', nonce: new Date\(verifiedToday\.admin_reviewed_at!\)\.getTime\(\) \}/);
    assert.match(app('(tabs)/pet.tsx'), /const \{ mood, message \} = useMood\(liveStats, petId\);/);
  });

  test('the sprite reads the latest mood only when choosing the NEXT step, and its cues are Views', () => {
    const comp = read('src/components/PetSprite.tsx');
    assert.match(comp, /moodRef\.current = mood;/);
    assert.match(comp, /nextStep\(machineRef\.current, home, rng, reduced, \{ mood: moodRef\.current, petId \}\)/);
    assert.match(comp, /if \(step\.state === 'celebrate'\) playHops\('flourish'\)/);
    assert.match(comp, /hopping\.current\?\.stop\(\);/);
    assert.doesNotMatch(comp, /require\(/, 'cues are drawn, not extra images');
  });

  test('the close-up never distorts the pet: frames for a Baby, a 1.5 % breath only for a portrait', () => {
    const src = read('src/components/PetExpression.tsx');
    // A Baby is animated by frames alone; the scale cannot run for one.
    assert.match(src, /if \(animatable \|\| reduced\) \{\s*breath\.setValue\(0\)/);
    assert.match(src, /outputRange: \[1, 1\.015\]/);
    assert.doesNotMatch(src, /rotate|skew|scaleX|scaleY/);
    assert.match(src, /frames \? frames\[shownFrame\] : portrait/);
  });
});

describe('6. View Pet', () => {
  test('is a real route with a native header, reachable from Pet and Home', () => {
    assert.ok(existsSync(path.join(MOBILE, 'src', 'app', 'companion', 'view.tsx')));
    assert.match(app('companion/_layout.tsx'), /headerShown: true/);
    assert.match(app('_layout.tsx'), /<Stack\.Screen name="companion"/);
    assert.match(app('companion/view.tsx'), /insetTop=\{false\}/);
    assert.match(app('(tabs)/pet.tsx'), /router\.push\('\/companion\/view'\)/);
    assert.match(app('(tabs)/index.tsx'), /router\.push\('\/companion\/view'\)/);
  });

  test('shows the enlarged pet, one message, three rings and the three care controls', () => {
    const src = app('companion/view.tsx');
    assert.match(src, /<PetExpression/);
    assert.equal((src.match(/styles\.bubble\b/g) || []).length, 1, 'exactly one speech bubble');
    assert.match(src, /STAT_META\.map\(\(s\) => \(\s*<StatusRing/);
    assert.match(src, /CARE_ACTIONS\.map\(/);
    assert.match(src, /minHeight: 80/);
  });

  test('uses the shared care hook and writes nothing of its own', () => {
    const src = app('companion/view.tsx');
    assert.match(src, /useCare\(\{/);
    assert.match(src, /reaction=\{reaction\}/);
    assert.doesNotMatch(src, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|carePet\(|supabase\./);
    assert.doesNotMatch(src, /@\/data\/admin|admin_reason/);
  });

  test('no fixed width over 288pt, no minWidth, no horizontal scroll', () => {
    for (const f of ['src/app/companion/view.tsx', 'src/components/PetExpression.tsx']) {
      const src = read(f);
      for (const m of src.matchAll(/\bwidth:\s*(\d+)\b/g)) assert.ok(Number(m[1]) <= 288, `${f}: width ${m[1]}`);
      assert.doesNotMatch(src, /\bminWidth:/);
      assert.doesNotMatch(src, /horizontal(=\{true\})?\s/);
    }
  });
});
