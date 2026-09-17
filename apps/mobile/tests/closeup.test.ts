/*
 * View Pet close-up animation, on the supplied dedicated close-up frames.
 *
 * Blocks 1–3 drive the clip model: every step is one of the eight real
 * frames, timings respect the frame rate, motion is bounded and continuous,
 * each species has its own action, and the scheduler never repeats one
 * effect. Block 4 checks the imported art on disk — above all the shared
 * baseline, which is what stops the pet jumping between frames. Blocks 5–6
 * guard the player and the screen.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLIPS,
  CLIP_FPS,
  CLOSEUP_FILES,
  CLOSEUP_FRAMES,
  FRAME_MS,
  LOOK_AROUND_NEEDS_ART,
  MAX_OFFSET,
  REDUCED_FRAME,
  careClip,
  clipMs,
  frameAt,
  motionAt,
  nextClip,
  type Clip,
  type CloseupFrame,
  type CloseupState,
} from '../src/data/closeupModel.ts';
import { MOOD_LABEL, type Mood } from '../src/data/moodModel.ts';
import { PET_CATALOG, type PetId } from '../src/data/petModel.ts';
import { seededRng } from '../src/data/spriteModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');
const app = (p: string) => read(path.join('src', 'app', p));
const PETS = Object.keys(PET_CATALOG) as PetId[];
const MOODS = Object.keys(MOOD_LABEL) as Mood[];

/** Every clip the scheduler or a care action can produce, per species. */
function allClips(pet: PetId): Clip[] {
  const out: Clip[] = [careClip(pet, 'feed'), careClip(pet, 'wash'), careClip(pet, 'play')];
  for (const mood of MOODS) {
    const rng = seededRng(4);
    let prev: Clip | null = null;
    for (let i = 0; i < 200; i++) {
      prev = nextClip(prev, mood, pet, rng);
      if (!out.some((c) => c.label === prev!.label)) out.push(prev);
    }
  }
  return out;
}

describe('1. clips are built from the real close-up frames', () => {
  test('every step names one of the eight supplied frames', () => {
    assert.deepEqual([...CLOSEUP_FRAMES], ['idle', 'breathe', 'blink', 'idleReturn', 'happy', 'hungry', 'needsCleaning', 'careReaction']);
    for (const pet of PETS) {
      for (const clip of allClips(pet)) {
        assert.ok(clip.steps.length > 0, `${pet}/${clip.state} has no steps`);
        for (const s of clip.steps) assert.ok((CLOSEUP_FRAMES as readonly string[]).includes(s.frame), `${pet}/${clip.state}: unknown frame ${s.frame}`);
      }
    }
  });

  test('animated beats respect 10 fps; poses are held, not stalled', () => {
    assert.equal(CLIP_FPS, 10);
    assert.equal(FRAME_MS, 100);
    for (const pet of PETS) {
      for (const clip of allClips(pet)) {
        for (const s of clip.steps) {
          assert.ok(s.ms >= 100, `${pet}/${clip.state}: ${s.ms}ms step is faster than the frame rate`);
          assert.ok(s.ms <= 2000, `${pet}/${clip.state}: ${s.ms}ms is a stall`);
        }
        assert.ok(clipMs(clip) >= 400 && clipMs(clip) <= 4600, `${pet}/${clip.state}: ${clipMs(clip)}ms total`);
      }
    }
  });

  test('breathing is a real four-frame cycle, not a scale', () => {
    const breathe = allClips('cat').filter((c) => c.state === 'breathe');
    assert.ok(breathe.length >= 2, 'a normal and a slow breath');
    for (const c of breathe) {
      assert.deepEqual(c.steps.map((s) => s.frame), ['idle', 'breathe', 'idleReturn', 'idle']);
      assert.equal(c.motion, undefined, 'breathing does not move the pet');
    }
    const fast = breathe.find((c) => c.label.includes('quietly'))!;
    const slow = breathe.find((c) => c.label.includes('slowly'))!;
    assert.ok(clipMs(slow) > clipMs(fast), 'the slow breath is slower');
  });

  test('blink uses the eyes-closed frame and returns through the settle pose', () => {
    const blink = allClips('wolf').find((c) => c.state === 'blink')!;
    assert.deepEqual(blink.steps.map((s) => s.frame), ['idle', 'blink', 'idleReturn']);
    assert.ok(blink.steps.find((s) => s.frame === 'blink')!.ms <= 200, 'a blink is quick');
  });

  test('frameAt walks the steps in order and holds the last frame past the end', () => {
    const clip: Clip = { state: 'idle', steps: [{ frame: 'idle', ms: 100 }, { frame: 'blink', ms: 200 }], label: 'x' };
    assert.equal(frameAt(clip, 0).frame, 'idle');
    assert.equal(frameAt(clip, 99).frame, 'idle');
    assert.equal(frameAt(clip, 100).frame, 'blink');
    assert.equal(frameAt(clip, 5000).frame, 'blink');
    assert.deepEqual([0, 100].map((t) => frameAt(clip, t).index), [0, 1]);
  });

  test('a clip that moves interpolates continuously, stays in the stage and returns to rest', () => {
    for (const pet of PETS) {
      for (const clip of allClips(pet)) {
        if (!clip.motion) continue;
        const total = clipMs(clip);
        let prev = motionAt(clip, 0);
        for (let t = 0; t <= total; t += 20) {
          const m = motionAt(clip, t);
          assert.ok(Math.abs(m.dx) <= MAX_OFFSET && Math.abs(m.dy) <= MAX_OFFSET, `${pet}/${clip.state} leaves the stage at ${t}ms`);
          assert.ok(Math.abs(m.dx - prev.dx) <= 4 && Math.abs(m.dy - prev.dy) <= 4, `${pet}/${clip.state} jumps at ${t}ms`);
          prev = m;
        }
        const peak = Math.max(
          ...Array.from({ length: 60 }, (_, i) => {
            const m = motionAt(clip, (total * i) / 60);
            return Math.max(Math.abs(m.dx), Math.abs(m.dy));
          }),
        );
        assert.ok(peak >= 2, `${pet}/${clip.state} barely moves (${peak})`);
        const end = motionAt(clip, total);
        assert.ok(Math.abs(end.dx) <= 1 && Math.abs(end.dy) <= 1, `${pet}/${clip.state} ends off-centre`);
      }
    }
    assert.deepEqual(motionAt({ state: 'idle', steps: [{ frame: 'idle', ms: 100 }], label: 'x' }, 50), { dx: 0, dy: 0 });
  });
});

describe('2. the states the art supports, and the one it does not', () => {
  test('the implemented states are reachable for every companion', () => {
    const required: CloseupState[] = ['breathe', 'blink', 'idle', 'settle', 'rest', 'happy', 'hungry', 'needsCleaning', 'careReaction'];
    for (const pet of PETS) {
      const seen = new Set(allClips(pet).map((c) => c.state));
      for (const s of required) assert.ok(seen.has(s), `${pet} never reaches ${s}`);
    }
  });

  test('look-around is declared as missing art rather than faked', () => {
    // The supplied set has no head-turn pose, so nothing simulates one.
    assert.equal(LOOK_AROUND_NEEDS_ART, true);
    const states = new Set(PETS.flatMap((p) => allClips(p).map((c) => c.state)));
    assert.ok(!states.has('lookAround' as CloseupState));
    assert.match(read('src/data/closeupModel.ts'), /head-turn \(look-around\) pose/);
  });

  test('each state uses its own dedicated frame', () => {
    const hungry = allClips('dragon').find((c) => c.state === 'hungry')!;
    assert.ok(hungry.steps.some((s) => s.frame === 'hungry'));
    assert.equal(hungry.motion, undefined, 'a glance does not travel');
    for (const pet of PETS) {
      assert.ok(CLIPS[pet].needsCleaning.steps.some((s) => s.frame === 'needsCleaning'));
      assert.ok(CLIPS[pet].happy.steps.some((s) => s.frame === 'happy'));
      assert.ok(careClip(pet, 'feed').steps.some((s) => s.frame === 'careReaction'));
      assert.ok(careClip(pet, 'feed').steps.some((s) => s.frame === 'hungry'), 'feeding starts by looking at the food');
      assert.ok(careClip(pet, 'wash').steps.some((s) => s.frame === 'needsCleaning'), 'washing starts from the dusty pose');
    }
  });

  test('rest is a long eyes-closed hold with a stir, and no movement', () => {
    const rest = allClips('cat').find((c) => c.state === 'rest')!;
    assert.deepEqual(rest.steps.map((s) => s.frame), ['blink', 'idleReturn', 'blink', 'idle']);
    assert.ok(rest.steps.filter((s) => s.frame === 'blink').every((s) => s.ms >= 1500), 'the eyes stay closed');
    assert.equal(rest.motion, undefined);
    assert.match(rest.label, /rest/i);
  });

  test('each species has a distinct happy action', () => {
    const dragon = CLIPS.dragon.happy;
    const cat = CLIPS.cat.happy;
    const wolf = CLIPS.wolf.happy;
    const lift = (c: Clip) => Math.max(...Array.from({ length: 40 }, (_, i) => -motionAt(c, (clipMs(c) * i) / 40).dy));
    // Only the dragon really leaves the ground, and it holds the hover.
    assert.ok(lift(dragon) > lift(cat) && lift(dragon) > lift(wolf), `lifts: dragon ${lift(dragon)}, cat ${lift(cat)}, wolf ${lift(wolf)}`);
    assert.match(dragon.label, /wing|hover/i);
    assert.match(cat.label, /stretch|paw/i);
    assert.match(wolf.label, /bounc/i);
    assert.ok(!/hover|fl(y|ap)/i.test(wolf.label), 'the wolf must not fly');
    // The wolf's is the quickest cycle (a run-in-place feel).
    const beats = (c: Clip) => c.steps.filter((s) => s.ms <= 160).length;
    assert.ok(beats(wolf) > beats(cat), 'the wolf bounces faster than the cat stretches');
    for (const [a, b] of [[dragon, cat], [cat, wolf], [dragon, wolf]] as [Clip, Clip][]) {
      assert.notDeepEqual(
        a.steps.map((s) => `${s.frame}:${s.ms}`),
        b.steps.map((s) => `${s.frame}:${s.ms}`),
        'two species share a happy clip',
      );
    }
  });

  test('a wash shakes side to side; a hover only goes up', () => {
    for (const pet of PETS) {
      const wash = careClip(pet, 'wash');
      const dxPeak = Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(motionAt(wash, (clipMs(wash) * i) / 60).dx)));
      assert.ok(dxPeak >= 2.5, `${pet}: the wash does not shake (${dxPeak})`);
    }
    const hover = CLIPS.dragon.happy;
    const dragonDx = Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(motionAt(hover, (clipMs(hover) * i) / 60).dx)));
    assert.equal(dragonDx, 0, 'the hover is vertical only');
  });
});

describe('3. the scheduler', () => {
  const trace = (mood: Mood, pet: PetId, seed = 8, n = 400) => {
    const rng = seededRng(seed);
    let prev: Clip | null = null;
    const out: CloseupState[] = [];
    for (let i = 0; i < n; i++) {
      prev = nextClip(prev, mood, pet, rng);
      out.push(prev.state);
    }
    return out;
  };

  test('the calm loop mixes breathing, blinking, settling and idling', () => {
    const t = trace('balanced', 'cat');
    for (const s of ['breathe', 'blink', 'settle', 'idle'] as CloseupState[]) assert.ok(t.includes(s), `balanced never ${s}`);
    const counts = new Map<CloseupState, number>();
    for (const s of t) counts.set(s, (counts.get(s) ?? 0) + 1);
    assert.ok(Math.max(...counts.values()) / t.length < 0.5, 'one effect repeats too much');
  });

  test('no clip repeats back to back except breathing', () => {
    for (const mood of MOODS) {
      for (const pet of PETS) {
        const t = trace(mood, pet);
        for (let i = 1; i < t.length; i++) {
          if (t[i] === t[i - 1]) assert.equal(t[i], 'breathe', `${mood}/${pet}: ${t[i]} repeated back to back`);
        }
      }
    }
  });

  test('a low pet never plays the happy clip; a happy one does', () => {
    for (const pet of PETS) {
      for (const mood of ['unclean', 'hungry', 'sad', 'balanced'] as Mood[]) {
        assert.ok(!trace(mood, pet).includes('happy'), `${pet} celebrated while ${mood}`);
      }
      assert.ok(trace('happy', pet).includes('happy'));
      assert.ok(trace('thriving', pet).includes('happy'));
    }
  });

  test('each low mood leads with its own clip and is subdued', () => {
    for (const pet of PETS) {
      assert.ok(trace('unclean', pet).filter((s) => s === 'needsCleaning').length > 20, `${pet} rarely cleans while unclean`);
      assert.ok(trace('hungry', pet).filter((s) => s === 'hungry').length > 20, `${pet} rarely looks at food while hungry`);
      const sad = trace('sad', pet);
      assert.ok(!sad.includes('happy') && !sad.includes('hungry'));
      assert.ok(sad.filter((s) => s === 'rest' || s === 'breathe').length > 200, 'a sad pet is subdued');
    }
  });

  test('the same seed gives the same loop; a care clip is picked by kind', () => {
    assert.deepEqual(trace('balanced', 'dragon', 3, 40), trace('balanced', 'dragon', 3, 40));
    for (const pet of PETS) {
      assert.equal(careClip(pet, 'feed').state, 'careReaction');
      assert.equal(careClip(pet, 'wash').state, 'careReaction');
      assert.equal(careClip(pet, 'play'), CLIPS[pet].happy, 'play is the species happy action');
    }
  });

  test('reduced motion has a held pose per mood, and it shows the mood', () => {
    for (const mood of MOODS) {
      const f: CloseupFrame = REDUCED_FRAME[mood];
      assert.ok((CLOSEUP_FRAMES as readonly string[]).includes(f), mood);
    }
    assert.equal(REDUCED_FRAME.unclean, 'needsCleaning');
    assert.equal(REDUCED_FRAME.hungry, 'hungry');
    assert.equal(REDUCED_FRAME.happy, 'happy');
    assert.equal(REDUCED_FRAME.balanced, 'idle');
  });
});

describe('4. the imported art on disk', () => {
  const manifest = JSON.parse(read('assets/closeup/manifest.json')) as Record<
    string,
    { width: number; height: number; baseline: number; resampled: boolean; source: string; asset: string; frames: string[] }
  >;

  test('eight frames per companion, from the supplied close-up art', () => {
    for (const pet of PETS) {
      assert.ok(manifest[pet], `${pet} missing from the manifest`);
      assert.equal(manifest[pet].source, 'supplied_closeup_frames');
      assert.deepEqual(
        manifest[pet].frames.slice().sort(),
        Object.values(CLOSEUP_FILES)
          .map((f) => f.replace('.png', ''))
          .sort(),
      );
      for (const file of Object.values(CLOSEUP_FILES)) {
        const p = path.join(MOBILE, 'assets', 'closeup', pet, file);
        assert.ok(existsSync(p), `${pet}/${file} missing`);
        const b = readFileSync(p);
        assert.equal(b.toString('ascii', 1, 4), 'PNG');
        assert.equal(b.readUInt32BE(16), manifest[pet].width, `${pet}/${file} width`);
        assert.equal(b.readUInt32BE(20), manifest[pet].height, `${pet}/${file} height`);
        assert.equal(b[25], 6, `${pet}/${file} is not RGBA — a transparent background would render as a box`);
        assert.ok(statSync(p).size <= 320 * 1024, `${pet}/${file} is ${Math.round(statSync(p).size / 1024)}KB`);
      }
    }
  });

  test('the art maps to the real PetQuest companions', () => {
    assert.equal(manifest.dragon.asset, 'arcane_dragon');
    assert.equal(manifest.cat.asset, 'mystic_cat');
    assert.equal(manifest.wolf.asset, 'spirit_wolf');
  });

  test('one shared baseline per companion, and no resampling', () => {
    for (const pet of PETS) {
      assert.equal(manifest[pet].resampled, false, `${pet} was resampled — that softens the art`);
      assert.ok(manifest[pet].baseline >= manifest[pet].height - 10, `${pet} baseline ${manifest[pet].baseline} of ${manifest[pet].height}`);
      assert.ok(manifest[pet].height >= 440, `${pet} is only ${manifest[pet].height}px tall for a 220pt view`);
    }
  });

  test('the importer never crops a frame on its own, and checks registration', () => {
    const script = read('scripts/import-closeup-frames.py');
    assert.match(script, /one SHARED box, the union of all/);
    assert.match(script, /frames are not registered/);
    assert.match(script, /the pet would jump/);
    assert.match(script, /no transparent border/);
    assert.match(script, /output frames differ in size/);
  });

  test('the frame table requires exactly those files and needs a companion', () => {
    const src = read('src/data/closeupFrames.ts');
    for (const pet of PETS) {
      for (const file of Object.values(CLOSEUP_FILES)) assert.match(src, new RegExp(`require\\('@/assets/closeup/${pet}/${file}'\\)`));
    }
    assert.equal((src.match(/require\(/g) || []).length, PETS.length * CLOSEUP_FRAMES.length);
    assert.match(src, /if \(!pet\) return null;/);
    assert.match(src, /for \(const k of CLOSEUP_FRAMES\) if \(!out\[k\]\) out\[k\] = set\.idle;/);
  });

  test('the close-up art is a separate set from the home-scene walking sprites', () => {
    assert.ok(existsSync(path.join(MOBILE, 'assets', 'sprites', 'dragon', 'f1_idle.png')), 'the walking set still exists');
    assert.match(read('src/data/closeupFrames.ts'), /DIFFERENT set from the walking sprites/);
  });
});

describe('5. the player', () => {
  const comp = read('src/components/PetExpression.tsx');

  test('frames advance on a timer per step, not on render', () => {
    assert.match(comp, /stepTimer\.current = setTimeout\(\(\) => \{/);
    assert.match(comp, /setFrame\(step\.frame\)/);
    assert.match(comp, /runSteps\(c, index \+ 1\)/);
    assert.match(comp, /playRef\.current\(nextClip\(c, moodRef\.current, petId \?\? 'dragon', rng\)\)/);
  });

  test('motion is a sequence of native-driver timings, clamped to the stage', () => {
    assert.match(comp, /Animated\.timing\(offset, \{/);
    assert.match(comp, /duration: Math\.max\(1, b\.at - a\.at\)/);
    assert.match(comp, /useNativeDriver: true/);
    assert.match(comp, /Math\.max\(-MAX_OFFSET, Math\.min\(MAX_OFFSET, v\)\)/);
    assert.match(comp, /Animated\.sequence\(segments\)/);
  });

  test('a Baby companion is animated by frames alone — no scaling', () => {
    // The only scale is the portrait fallback's breath, and it cannot run for a Baby.
    assert.match(comp, /if \(animatable \|\| reduced\) \{\s*breath\.setValue\(0\)/);
    assert.match(comp, /outputRange: \[1, 1\.015\]/);
    assert.match(comp, /const animatable = !!frames && !!petId;/);
    assert.doesNotMatch(comp, /c\.breathe|c\.slow/, 'clips no longer carry a breathe flag');
  });

  test('a care clip plays only from the reaction prop, and never touches data', () => {
    assert.match(comp, /if \(!reaction \|\| reaction\.nonce === lastNonce\.current\) return;/);
    assert.match(comp, /playCare\(reaction\.kind\)/);
    assert.match(comp, /careClip\(petId, kind\)/);
    assert.doesNotMatch(comp, /supabase|\.rpc\(|carePet\(|fetch\(/);
  });

  test('everything stops on blur, background and unmount', () => {
    assert.match(comp, /const running = animatable && !reduced && focused && foreground;/);
    assert.match(comp, /useFocusEffect\(/);
    assert.match(comp, /AppState\.addEventListener\('change'/);
    assert.match(comp, /if \(!running\) \{\s*stopAll\(\);/);
    assert.match(comp, /useEffect\(\(\) => stopAll, \[stopAll\]\);/);
    assert.match(comp, /clearTimeout\(stepTimer\.current\)/);
    assert.match(comp, /motion\.current\?\.stop\(\)/);
    assert.match(comp, /breathLoop\.current\?\.stop\(\)/);
    assert.match(comp, /return \(\) => sub\.remove\(\);/);
  });

  test('the loop cannot be restarted by a parent re-render', () => {
    assert.match(comp, /const onStateRef = useRef\(onStateChange\);/);
    assert.match(comp, /onStateRef\.current\?\.\(c\.state, c\.label\)/);
    assert.match(comp, /\[runMotion, runSteps\],/);
  });

  test('reduced motion and the portrait fallback hold one pose', () => {
    assert.match(comp, /const shownFrame = reduced \|\| !running \? REDUCED_FRAME\[mood\] : \(frame as CloseupFrame\);/);
    assert.match(comp, /frames \? frames\[shownFrame\] : portrait/);
  });

  test('the drawn cue is only for the portrait — the frames carry their own', () => {
    assert.match(comp, /const cue = frames \? null : MOOD_CUE\[mood\];/);
  });
});

describe('6. the screen', () => {
  const view = app('companion/view.tsx');

  test('only a Baby gets close-up frames; other stages keep the portrait', () => {
    assert.match(view, /closeupFramesFor\(profile\?\.selected_pet_id\)/);
    assert.match(view, /meta && level === 1 \?/);
    assert.match(view, /portrait=\{portrait\}/);
    assert.match(view, /spriteFor\(profile\?\.selected_pet_id, level\)/);
  });

  test('the rest clip changes the line without changing the mood', () => {
    assert.match(view, /useMood\(liveStats, petId, null, closeup\?\.state === 'rest'\)/);
    assert.match(read('src/hooks/useMood.ts'), /resting \? 'resting' : mood/);
    assert.match(read('src/data/moodModel.ts'), /\{ mood: 'resting', text: 'I’m having a little rest\.' \}/);
  });

  test('the stage leaves room for the hover so nothing clips', () => {
    assert.match(view, /paddingTop: Spacing\.xl/);
    assert.ok(MAX_OFFSET >= 20);
  });

  test('the screen still writes nothing and shows the server figures', () => {
    assert.match(view, /useCare\(\{/);
    assert.doesNotMatch(view, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|carePet\(|supabase\./);
    assert.match(view, /value=\{stats\.loading \? null : \(liveStats\?\.\[s\.key\] \?\? null\)\}/);
  });
});
