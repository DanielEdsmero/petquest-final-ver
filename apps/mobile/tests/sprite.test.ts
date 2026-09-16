/*
 * The walking baby sprite.
 *
 * Blocks 1–3 drive the pure state machine with a seeded rng. Block 4 checks
 * the frame files on disk. Blocks 5–6 are static guards on the component and
 * the screens: continuous position animation with a distance-based duration,
 * frame ticker tied to the walk, pause on blur/background, cleanup on
 * unmount, taps and reactions that touch nothing but pixels.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PET_HOMES, type HomeId } from '../src/data/petHomeModel.ts';
import { PET_CATALOG } from '../src/data/petModel.ts';
import {
  FRAME_FILES,
  FRAME_KEYS,
  FRAME_SIZE,
  HOME_LAYOUT,
  IDLE_FPS,
  TIMING,
  WALK_FPS,
  WALK_SPEED,
  applyStep,
  chooseDestination,
  directionFor,
  fpsFor,
  frameFor,
  inside,
  nextStep,
  reactionStep,
  seededRng,
  startPoint,
  walkDurationMs,
  type Machine,
  type SpriteState,
  type Step,
} from '../src/data/spriteModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');
const HOMES = Object.keys(PET_HOMES) as HomeId[];

/** Run the machine for `n` steps and return the trace. */
function simulate(home: HomeId, seed: number, n: number, reduceMotion = false): { steps: Step[]; machines: Machine[] } {
  const rng = seededRng(seed);
  let m: Machine = { state: 'idle', at: startPoint(home) };
  const steps: Step[] = [];
  const machines: Machine[] = [m];
  for (let i = 0; i < n; i++) {
    const s = nextStep(m, home, rng, reduceMotion);
    steps.push(s);
    m = applyStep(m, s);
    machines.push(m);
  }
  return { steps, machines };
}

describe('1. frames', () => {
  test('eight frames in sheet order, one file each', () => {
    assert.deepEqual([...FRAME_KEYS], ['idle', 'blink', 'walkLeftA', 'walkLeftB', 'walkRightA', 'walkRightB', 'happy', 'interact']);
    assert.deepEqual(Object.values(FRAME_FILES), ['f1_idle.png', 'f2_blink.png', 'f3_walk_left_a.png', 'f4_walk_left_b.png', 'f5_walk_right_a.png', 'f6_walk_right_b.png', 'f7_happy.png', 'f8_interact.png']);
  });

  test('walking alternates the directional frames; idle and the reactions hold one', () => {
    assert.deepEqual([0, 1, 2, 3].map((t) => frameFor('walkLeft', t)), ['walkLeftA', 'walkLeftB', 'walkLeftA', 'walkLeftB']);
    assert.deepEqual([0, 1, 2, 3].map((t) => frameFor('walkRight', t)), ['walkRightA', 'walkRightB', 'walkRightA', 'walkRightB']);
    for (const t of [0, 1, 7]) {
      assert.equal(frameFor('idle', t), 'idle');
      assert.equal(frameFor('pause', t), 'idle');
      assert.equal(frameFor('blink', t), 'blink');
      assert.equal(frameFor('happy', t), 'happy');
      assert.equal(frameFor('interact', t), 'interact');
    }
  });

  test('walk cadence is 8–12 fps and idle is slower', () => {
    assert.ok(WALK_FPS >= 8 && WALK_FPS <= 12);
    assert.ok(IDLE_FPS < WALK_FPS);
    assert.equal(fpsFor('walkLeft'), WALK_FPS);
    assert.equal(fpsFor('walkRight'), WALK_FPS);
    assert.equal(fpsFor('idle'), IDLE_FPS);
  });
});

describe('2. the state machine', () => {
  test('transitions follow idle → blink|pause → walk → interact|idle, deterministically', () => {
    const allowed: Record<SpriteState, SpriteState[]> = {
      idle: ['blink', 'pause'],
      blink: ['idle'],
      pause: ['walkLeft', 'walkRight'],
      walkLeft: ['interact', 'idle'],
      walkRight: ['interact', 'idle'],
      happy: ['idle'],
      interact: ['idle'],
    };
    for (const home of HOMES) {
      const { steps, machines } = simulate(home, 7, 300);
      for (let i = 0; i < steps.length; i++) {
        assert.ok(allowed[machines[i].state].includes(steps[i].state), `${home}: ${machines[i].state} → ${steps[i].state}`);
      }
      const seen = new Set(steps.map((s) => s.state));
      for (const s of ['idle', 'blink', 'pause', 'walkLeft', 'walkRight', 'interact'] as SpriteState[]) assert.ok(seen.has(s), `${home} never reached ${s}`);
    }
    const a = simulate('sunlit_meadow', 42, 50).steps.map((s) => s.state);
    const b = simulate('sunlit_meadow', 42, 50).steps.map((s) => s.state);
    assert.deepEqual(a, b, 'same seed, same trace');
  });

  test('a walk ends where it was aimed, then idle resumes', () => {
    const { steps, machines } = simulate('moonlit_cottage', 3, 200);
    let walks = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.state !== 'walkLeft' && s.state !== 'walkRight') continue;
      walks++;
      assert.deepEqual(machines[i + 1].at, s.to, 'arrival point is the destination');
      const after = steps[i + 1];
      assert.ok(after.state === 'idle' || after.state === 'interact');
      assert.deepEqual(after.to, s.to, 'nothing moves after arriving until the next walk');
      if (after.state === 'interact') assert.ok(after.interaction, 'an interaction names its point of interest');
    }
    assert.ok(walks > 10);
  });

  test('direction matches the movement', () => {
    for (const home of HOMES) {
      for (const s of simulate(home, 11, 200).steps) {
        if (s.state === 'walkLeft' || s.state === 'walkRight') {
          // The step's `to` vs the machine's position before it is what chose the direction.
        }
      }
      const rng = seededRng(5);
      let m: Machine = { state: 'pause', at: startPoint(home) };
      for (let i = 0; i < 40; i++) {
        const s = nextStep(m, home, rng);
        assert.equal(s.state, directionFor(m.at, s.to));
        assert.equal(s.state, s.to.x < m.at.x ? 'walkLeft' : 'walkRight');
        m = { state: 'pause', at: s.to };
      }
    }
    assert.equal(directionFor({ x: 0.3, y: 0.8 }, { x: 0.65, y: 0.8 }), 'walkRight');
    assert.equal(directionFor({ x: 0.65, y: 0.8 }, { x: 0.3, y: 0.8 }), 'walkLeft');
  });

  test('reduce motion: the pet never walks, only stands and blinks', () => {
    for (const home of HOMES) {
      const seen = new Set(simulate(home, 9, 200, true).steps.map((s) => s.state));
      assert.ok(!seen.has('walkLeft') && !seen.has('walkRight') && !seen.has('pause'), `${home} walked under reduce motion`);
      assert.ok(seen.has('blink'));
    }
  });

  test('reactions are one step, in place, then idle', () => {
    const at = { x: 0.4, y: 0.8 };
    assert.deepEqual(reactionStep('tap', at), { state: 'happy', durationMs: TIMING.happyMs, to: at });
    assert.deepEqual(reactionStep('play', at), { state: 'happy', durationMs: TIMING.happyMs, to: at });
    assert.equal(reactionStep('feed', at).state, 'interact');
    assert.equal(reactionStep('wash', at).state, 'interact');
    const rng = seededRng(1);
    assert.equal(nextStep({ state: 'happy', at }, 'ember_cavern', rng).state, 'idle');
    assert.equal(nextStep({ state: 'interact', at }, 'ember_cavern', rng).state, 'idle');
  });
});

describe('3. movement is continuous and stays in bounds', () => {
  test('duration grows with distance — never a fixed hop', () => {
    const a = { x: 0.3, y: 0.8 };
    assert.equal(walkDurationMs(a, { x: 0.65, y: 0.8 }), Math.round((0.35 / WALK_SPEED) * 1000));
    assert.ok(walkDurationMs(a, { x: 0.65, y: 0.8 }) > walkDurationMs(a, { x: 0.45, y: 0.8 }));
    assert.ok(walkDurationMs(a, { x: 0.3, y: 0.8 }) >= 400);
    // 30 % → 65 % of the scene takes 2.5 s — a stroll, not a dash.
    assert.equal(walkDurationMs(a, { x: 0.65, y: 0.8 }), 2500);
  });

  test('the eased path passes through intermediate points', () => {
    // The component samples the same easing to freeze a walk mid-way; model it here.
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const from = 0.3, to = 0.65;
    const xs = [0, 0.25, 0.5, 0.75, 1].map((t) => from + (to - from) * ease(t));
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'monotonic');
    assert.ok(xs[1] > from && xs[1] < to && xs[3] > from && xs[3] < to, 'genuinely between the endpoints');
    assert.equal(xs[0], from);
    assert.equal(xs[4], to);
  });

  test('every destination is inside the walkable strip and at least minWalk away', () => {
    for (const home of HOMES) {
      const area = HOME_LAYOUT[home].area;
      const rng = seededRng(99);
      let from = startPoint(home);
      for (let i = 0; i < 500; i++) {
        const { to } = chooseDestination(from, home, rng);
        assert.ok(inside(to, area), `${home}: ${JSON.stringify(to)} outside ${JSON.stringify(area)}`);
        assert.ok(Math.abs(to.x - from.x) >= TIMING.minWalk, `${home}: walk too short`);
        from = to;
      }
      for (const m of simulate(home, 21, 400).machines) assert.ok(inside(m.at, area), `${home} left the area at ${JSON.stringify(m.at)}`);
    }
  });

  test('strips have edge padding and sit in the lower part of the scene; points of interest are inside them', () => {
    for (const home of HOMES) {
      const { area, interactions } = HOME_LAYOUT[home];
      assert.ok(area.xMin >= 0.1 && area.xMax <= 0.9, `${home} touches the edge`);
      assert.ok(area.yMin >= 0.6 && area.yMax <= 0.92, `${home} strip is not on the floor`);
      assert.ok(interactions.length >= 3);
      for (const p of interactions) assert.ok(inside(p.at, area), `${home}/${p.key} outside the strip`);
    }
  });
});

describe('4. frame files', () => {
  test('every companion has all eight frames at the same size, RGBA', () => {
    for (const pet of Object.keys(PET_CATALOG)) {
      for (const file of Object.values(FRAME_FILES)) {
        const p = path.join(MOBILE, 'assets', 'sprites', pet, file);
        assert.ok(existsSync(p), `${pet}/${file} missing`);
        const b = readFileSync(p);
        assert.equal(b.toString('ascii', 1, 4), 'PNG');
        assert.equal(b.readUInt32BE(16), FRAME_SIZE, `${pet}/${file} width`);
        assert.equal(b.readUInt32BE(20), FRAME_SIZE, `${pet}/${file} height`);
        assert.equal(b[25], 6, `${pet}/${file} is not RGBA (colour type ${b[25]})`);
      }
    }
  });

  test('the manifest says which sets are derived placeholders (to be replaced by the sheets)', () => {
    const manifest = JSON.parse(read('assets/sprites/manifest.json')) as Record<string, { source: string }>;
    for (const pet of Object.keys(PET_CATALOG)) assert.ok(['sheet', 'derived'].includes(manifest[pet]?.source), pet);
    // Every set now comes from a supplied sheet, which must be present so the slicer is reproducible.
    for (const pet of Object.keys(PET_CATALOG)) {
      assert.equal(manifest[pet].source, 'sheet', `${pet} frames are still derived placeholders`);
      assert.ok(existsSync(path.join(MOBILE, 'assets', 'sprites', 'sheets', `${pet}.png`)), `${pet} sheet missing`);
    }
    assert.ok(existsSync(path.join(MOBILE, 'scripts', 'slice-sprite-sheets.py')));
  });

  test('the frame table requires exactly those files and falls back safely', () => {
    const src = read('src/data/spriteFrames.ts');
    for (const pet of Object.keys(PET_CATALOG)) {
      for (const file of Object.values(FRAME_FILES)) assert.match(src, new RegExp(`require\\('@/assets/sprites/${pet}/${file}'\\)`));
    }
    assert.equal((src.match(/require\(/g) || []).length, Object.keys(PET_CATALOG).length * FRAME_KEYS.length);
    assert.match(src, /const pet = petIdOf\(selectedPetId\) \?\? 'dragon';/);
    assert.match(src, /for \(const k of FRAME_KEYS\) if \(!out\[k\]\) out\[k\] = set\.idle;/);
  });
});

describe('5. the component', () => {
  const comp = read('src/components/PetSprite.tsx');

  test('position is animated continuously with a distance-based duration, on the native driver', () => {
    assert.match(comp, /moving\.current = Animated\.timing\(pos, \{\s*toValue: toPx\(step\.to\),\s*duration: reduced \? 0 : step\.durationMs,/);
    assert.match(comp, /useNativeDriver: true/);
    assert.doesNotMatch(comp, /pos\.setValue\(toPx\(step\.to\)\)/, 'a walk must not jump to its destination');
  });

  test('the frame ticker runs at the state cadence and stops on arrival', () => {
    assert.match(comp, /ticker\.current = setInterval\(\(\) => setTick\(\(t\) => t \+ 1\), Math\.round\(1000 \/ fpsFor\(step\.state\)\)\)/);
    assert.match(comp, /stepTimer\.current = setTimeout\(\(\) => \{[\s\S]*?clearInterval\(ticker\.current\)/);
    assert.match(comp, /const frame = frameFor\(machine\.state, tick\)/);
  });

  test('feet-anchored: the image is offset up by its height and centred on x', () => {
    assert.match(comp, /\(p: Point\) => \(\{ x: p\.x \* scene\.w - size \/ 2, y: p\.y \* scene\.h - size \}\)/);
  });

  test('pauses when the screen is unfocused or the app is backgrounded', () => {
    assert.match(comp, /useFocusEffect\(/);
    assert.match(comp, /return \(\) => setFocused\(false\);/);
    assert.match(comp, /AppState\.addEventListener\('change'/);
    assert.match(comp, /const running = active && focused && foreground && scene\.w > 0;/);
    assert.match(comp, /if \(!running\) \{\s*clearAll\(\);/);
  });

  test('timers, the interval and the animation are cleaned up on unmount', () => {
    assert.match(comp, /useEffect\(\(\) => clearAll, \[clearAll\]\);/);
    assert.match(comp, /clearTimeout\(stepTimer\.current\)/);
    assert.match(comp, /clearInterval\(ticker\.current\)/);
    assert.match(comp, /clearTimeout\(bubbleTimer\.current\)/);
    assert.match(comp, /moving\.current\?\.stop\(\)/);
    assert.match(comp, /return \(\) => sub\.remove\(\);/);
  });

  test('a tap is cosmetic: happy frame + bubble, no data access', () => {
    assert.match(comp, /onPress=\{\(\) => react\('tap'\)\}/);
    assert.doesNotMatch(comp, /supabase|rpc\(|fetch\(|@\/data\/care|@\/data\/tasks|@\/lib\//);
    assert.match(comp, /REACTION_TEXT\[kind\]/);
  });

  test('reduce motion: no walking (the machine), and any residual move is instant', () => {
    assert.match(comp, /nextStep\(machineRef\.current, home, rng, reduced\)/);
    assert.match(comp, /duration: reduced \? 0 : step\.durationMs/);
  });

  test('only the selected companion’s frames are mounted', () => {
    assert.match(read('src/components/PetHomeHero.tsx'), /frames=\{walking\.frames\}/);
    for (const screen of ['(tabs)/index.tsx', '(tabs)/pet.tsx']) {
      assert.match(read(`src/app/${screen}`), /framesFor\(profile\?\.selected_pet_id\)/);
    }
  });
});

describe('6. reactions only after the server said yes; nothing else changed', () => {
  test('the Pet screen sets the reaction after `!r.ok` has returned, next to the server stats', () => {
    const pet = read('src/app/(tabs)/pet.tsx');
    const fail = pet.indexOf('if (!r.ok) {');
    const react = pet.indexOf("setReaction({ kind: action, nonce: Date.now() })");
    const stats = pet.indexOf('setLiveStats(r.stats)');
    assert.ok(fail > 0 && stats > fail && react > stats, 'reaction must come after the ok-branch stat update');
    assert.ok(pet.slice(fail, stats).includes('return;'), 'the failure branch returns before any reaction');
    assert.doesNotMatch(pet.slice(0, fail), /setReaction\(\{ kind: action/, 'no reaction before the reply');
  });

  test('Home mounts the sprite with no reaction channel and still never writes', () => {
    const home = read('src/app/(tabs)/index.tsx');
    assert.match(home, /const walking = meta && level === 1 \? \{ frames: framesFor\(profile\?\.selected_pet_id\) \} : null;/);
    assert.doesNotMatch(home, /setReaction|\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
  });

  test('only Baby-stage companions walk; later stages keep the evolution portrait', () => {
    for (const screen of ['(tabs)/index.tsx', '(tabs)/pet.tsx']) assert.match(read(`src/app/${screen}`), /meta && level === 1 \?/);
    const hero = read('src/components/PetHomeHero.tsx');
    assert.match(hero, /\{walking \? \(/);
    assert.match(hero, /source=\{sprite\}/);
  });

  test('the sprite model knows nothing about the economy', () => {
    // Comments explain what the model does NOT touch; check the code itself.
    const code = read('src/data/spriteModel.ts')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /supabase|rpc|quest|verif|hunger|cleanliness|happiness|profile/i);
    assert.doesNotMatch(code, /^import .*(care|tasks|admin|supabase)/m);
  });
});
