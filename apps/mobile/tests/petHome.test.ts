/*
 * Pet homes, status rings and the Accessories view.
 *
 * Block 1–2 test the pure models. Block 3 checks the home assets on disk.
 * Blocks 4–7 are static guards on the screens: server-backed values only,
 * care through care_pet() with confirmation and no duplicate taps, equip only
 * what the server says is owned, no purchase fabricated, nothing admin-only
 * on a participant screen, nothing wider than a 320pt phone.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCESSORIES,
  CATEGORIES,
  canEquip,
  countOwned,
  decorate,
  equippedGlyphs,
  groupByCategory,
  sortForDisplay,
} from '../src/data/accessoryModel.ts';
import { FALLBACK_HOME, HOME_FOR_PET, PET_HOMES, STAT_META, homeFor, ringFraction, statState } from '../src/data/petHomeModel.ts';
import { PET_CATALOG } from '../src/data/petModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const read = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const app = (p: string) => read(path.join('src', 'app', p));

/** PNG IHDR → width/height. */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('1. every real companion has its own home; anything else gets the fallback', () => {
  test('one distinct home per companion in the catalogue', () => {
    const pets = Object.keys(PET_CATALOG);
    assert.deepEqual(Object.keys(HOME_FOR_PET).sort(), pets.sort());
    const homes = Object.values(HOME_FOR_PET);
    assert.equal(new Set(homes).size, homes.length, 'two companions share a home');
    assert.ok(!homes.includes(FALLBACK_HOME), 'the fallback must not be a companion home');
  });

  test('both id forms resolve; unknown and null fall back safely', () => {
    assert.equal(homeFor('dragon').id, 'ember_cavern');
    assert.equal(homeFor('arcane_dragon').id, 'ember_cavern');
    assert.equal(homeFor('cat').id, 'moonlit_cottage');
    assert.equal(homeFor('wolf').id, 'sunlit_meadow');
    assert.equal(homeFor('phoenix').id, FALLBACK_HOME);
    assert.equal(homeFor(null).id, FALLBACK_HOME);
    assert.equal(homeFor(undefined).id, FALLBACK_HOME);
    assert.equal(homeFor('').id, FALLBACK_HOME);
  });

  test('each home carries a palette, a blurb and its own file name', () => {
    for (const h of Object.values(PET_HOMES)) {
      assert.equal(h.file, `${h.id}.png`);
      assert.match(h.palette.background, /^#[0-9A-F]{6}$/i);
      assert.match(h.palette.accent, /^#[0-9A-F]{6}$/i);
      assert.ok(h.blurb.length > 10);
      assert.doesNotMatch(h.displayName, /\bdragon|cat|wolf\b/i, 'home names are places, not species');
    }
  });
});

describe('2. rings and stat wording', () => {
  test('three stats, each tied to one care action, in the care order', () => {
    assert.deepEqual(STAT_META.map((s) => s.key), ['hunger', 'cleanliness', 'happiness']);
    assert.deepEqual(STAT_META.map((s) => s.action), ['feed', 'wash', 'play']);
  });

  test('server values map onto 0–1; null stays null (an empty ring, not zero)', () => {
    assert.equal(ringFraction(null), null);
    assert.equal(ringFraction(undefined), null);
    assert.equal(ringFraction(NaN), null);
    assert.equal(ringFraction(50), 0.5);
    assert.equal(ringFraction(140), 1);
    assert.equal(ringFraction(-5), 0);
  });

  test('low stats use neutral wording', () => {
    assert.deepEqual(statState(10), { label: 'Needs attention', low: true });
    assert.deepEqual(statState(50), { label: 'Okay', low: false });
    assert.deepEqual(statState(90), { label: 'Good', low: false });
    assert.deepEqual(statState(null), { label: 'Not loaded', low: false });
    for (const v of [0, 10, 34, 35, 69, 70, 100]) assert.doesNotMatch(statState(v).label, /starv|neglect|bad|dirty|sad|fail/i);
  });
});

describe('3. home assets on disk', () => {
  test('all four files exist, are PNG, 4:3, and within the size budget', () => {
    for (const h of Object.values(PET_HOMES)) {
      const file = path.join(MOBILE, 'assets', 'homes', h.file);
      assert.ok(existsSync(file), `${h.file} missing`);
      const { width, height } = pngSize(file);
      assert.equal(Math.round((width / height) * 100), 133, `${h.file} is not 4:3`);
      assert.ok(width >= 640, `${h.file} is too small to look right on a phone`);
      assert.ok(statSync(file).size <= 150 * 1024, `${h.file} exceeds 150 KB`);
    }
  });

  test('the image table names exactly the same files, and only the selected one is rendered', () => {
    const src = read('src/data/petHomes.ts');
    for (const h of Object.values(PET_HOMES)) assert.match(src, new RegExp(`${h.id}: require\\('@/assets/homes/${h.file}'\\)`));
    assert.equal((src.match(/require\(/g) || []).length, Object.keys(PET_HOMES).length);
    const hero = read('src/components/PetHomeHero.tsx');
    assert.match(hero, /source=\{shown\.homeImage\}/);
    assert.equal((hero.match(/<Image/g) || []).length, 2, 'one home image and one sprite');
  });

  test('the placeholders are documented as placeholders', () => {
    assert.match(read('assets/homes/README.md'), /These files are placeholders/);
    assert.ok(existsSync(path.join(MOBILE, 'scripts', 'make-home-placeholders.py')));
  });
});

describe('4. Home and Pet render the rings from server values only', () => {
  const home = app('(tabs)/index.tsx');
  const pet = app('(tabs)/pet.tsx');

  test('Home reads pet_stats and passes the fetched value into each ring', () => {
    assert.match(home, /fetchPetStats\(userId\)/);
    assert.match(home, /value=\{stats\.loading \? null : \(stats\.data\?\.\[s\.key\] \?\? null\)\}/);
    assert.match(home, /STAT_META\.map\(/);
    assert.doesNotMatch(home, /hunger:\s*\d|cleanliness:\s*\d|happiness:\s*\d/, 'a hardcoded stat');
  });

  test('a ring tap on Home only navigates to the Pet tab with the action highlighted', () => {
    assert.match(home, /onPress=\{\(\) => router\.push\(\{ pathname: '\/pet', params: \{ action: s\.action \} \}\)\}/);
    assert.doesNotMatch(home, /carePet\(|rpc\(|spend_points'/);
  });

  test('the ring itself animates only to the value it is given and never writes', () => {
    const ring = read('src/components/StatusRing.tsx');
    assert.match(ring, /Animated\.timing\(anim, \{ toValue: target/);
    assert.match(ring, /if \(reduced\) \{\s*anim\.setValue\(target\)/);
    assert.doesNotMatch(ring, /supabase|rpc|fetch\(/);
    assert.match(ring, /accessibilityValue=\{\{ min: 0, max: 100, now: Math\.round\(target \* 100\) \}\}/);
  });

  test('the hero shows the selected home and the real sprite, and fades between homes', () => {
    for (const s of [home, pet]) {
      assert.match(s, /homeAndImageFor\(profile\?\.selected_pet_id\)/);
      assert.match(s, /spriteFor\(profile\?\.selected_pet_id, level\)/);
      assert.match(s, /const level = profile\?\.pet_level \?\? progress\.level/);
    }
    const hero = read('src/components/PetHomeHero.tsx');
    assert.match(hero, /if \(shown\.home\.id === home\.id\) return;/);
    assert.match(hero, /Animated\.timing\(fade, \{ toValue: 0/);
    assert.match(hero, /if \(reduced\) \{\s*setShown\(\{ home, homeImage \}\);/);
  });
});

describe('5. care: confirm, one request at a time, show only the server result', () => {
  const pet = app('(tabs)/pet.tsx');

  test('the cost and the benefit are shown before spending, and the RPC runs only on confirm', () => {
    assert.match(pet, /Alert\.alert\(\s*`\$\{a\.label\} \$\{meta\?\.name \?\? 'your companion'\}\?`,\s*`Costs \$\{CARE_COST\} points and raises \$\{stat\.label\} by up to \$\{CARE_BOOST\}/);
    assert.match(pet, /\{ text: `\$\{a\.label\} · \$\{CARE_COST\} pts`, onPress: \(\) => void runCare\(action\) \}/);
  });

  test('the only mutation is care_pet(), and the screen shows what it returned', () => {
    assert.match(read('src/data/care.ts'), /supabase\.rpc\('care_pet', \{ p_action: action \}\)/);
    assert.match(pet, /const r = await carePet\(action\)/);
    assert.match(pet, /if \(typeof r\.points === 'number'\) setLivePoints\(r\.points\)/);
    assert.match(pet, /setLiveStats\(r\.stats\)/);
    assert.doesNotMatch(pet, /liveStats\?\.\w+\s*\+|points\s*-\s*CARE_COST|previewStats\(/, 'a local stat or balance change');
  });

  test('insufficient points: message only, nothing changes; a failed RPC leaves the stats alone', () => {
    assert.match(pet, /if \(!canAfford\(livePoints\)\) \{\s*setNotice\(\{ text: careErrorMessage\('insufficient_points'\), tone: 'bad' \}\);\s*return;/);
    // On !r.ok the function returns before setLiveStats.
    const i = pet.indexOf('if (!r.ok) {');
    const j = pet.indexOf('setLiveStats(r.stats)', i);
    assert.ok(i > 0 && j > i && pet.slice(i, j).includes('return;'));
  });

  test('duplicate taps are blocked while a request is pending', () => {
    assert.match(pet, /if \(busyAction\) return; \/\/ a second tap while one is in flight does nothing/);
    assert.match(pet, /const disabled = busyAction != null;/);
    assert.match(pet, /disabled=\{disabled\}/);
  });

  test('a session-expired reply is surfaced, not swallowed', () => {
    assert.match(read('src/data/care.ts'), /if \(m\.includes\('jwt'\) \|\| m\.includes\('expired'\)\) return \{ ok: false, error: 'unauthenticated' \}/);
    assert.match(read('src/data/careModel.ts'), /case 'unauthenticated':\s*return 'Your session expired — please sign in again\.'/);
  });
});

describe('6. accessories', () => {
  test('the catalogue matches the web, id for id, cost for cost', () => {
    const web = readWeb('src/data/accessories.js');
    const rows = [...web.matchAll(/\{ id: '([^']+)', name: '([^']+)', category: '([^']+)'[^}]*cost: (\d+)[^}]*rarity: '([^']+)' \}/g)];
    assert.equal(rows.length, ACCESSORIES.length);
    for (const [, id, name, category, cost, rarity] of rows) {
      const a = ACCESSORIES.find((x) => x.id === id);
      assert.ok(a, `${id} missing on mobile`);
      assert.equal(a!.name, name);
      assert.equal(a!.category, category);
      assert.equal(a!.cost, Number(cost));
      assert.equal(a!.rarity, rarity);
    }
    assert.deepEqual(CATEGORIES.map((c) => c.id), ['hat', 'eyewear', 'outfit', 'misc']);
  });

  test('equipped first, then unlocked, then locked; grouped by category', () => {
    const rows = decorate(['crown', 'bowtie'], { hat: 'crown' });
    const hats = groupByCategory(rows).find((g) => g.category === 'hat')!.items;
    assert.equal(hats[0].id, 'crown');
    assert.ok(hats[0].equipped && hats[0].owned);
    assert.ok(hats.slice(1).every((h) => !h.equipped));
    assert.equal(countOwned(rows), 2);
    const sorted = sortForDisplay(rows);
    assert.equal(sorted[0].id, 'crown');
    assert.equal(sorted[1].id, 'bowtie');
    assert.ok(sorted.slice(2).every((r) => !r.owned));
  });

  test('a locked item can never be equipped, in the model or the data module', () => {
    assert.equal(canEquip({ owned: false }), false);
    assert.equal(canEquip({ owned: true }), true);
    const data = read('src/data/accessories.ts');
    assert.match(data, /if \(!owned\.includes\(accessoryId\)\) return \{ error: 'You do not own this accessory yet\.' \}/);
    const pet = app('(tabs)/pet.tsx');
    assert.match(pet, /if \(!canEquip\(row\)\) return;/);
    assert.match(pet, /equipAccessory\(userId, row\.id, owned \?\? \[\]\)/);
    // The Equip button is only rendered for owned rows.
    assert.match(pet, /\{row\.owned \? \(\s*<SecondaryButton/);
  });

  test('equipped state loads from the server and the hero reflects it', () => {
    const data = read('src/data/accessories.ts');
    assert.match(data, /from\('equipped_accessories'\)\.select\('category, accessory_id'\)/);
    assert.match(data, /from\('owned_accessories'\)\.select\('accessory_id'\)/);
    assert.deepEqual(equippedGlyphs({ hat: 'crown', misc: 'star' }), ['👑', '⭐']);
    assert.deepEqual(equippedGlyphs(null), []);
    const pet = app('(tabs)/pet.tsx');
    assert.match(pet, /accessoryEmojis=\{glyphs\}/);
    assert.match(pet, /await onChanged\(\); \/\/ re-read equipped from the server/);
  });

  test('no purchase is fabricated: nothing inserts into owned_accessories or debits points', () => {
    const data = read('src/data/accessories.ts');
    assert.doesNotMatch(data, /from\('owned_accessories'\)\.(insert|upsert)/);
    assert.doesNotMatch(data, /rpc\(|from\('profiles'\)/);
    const pet = app('(tabs)/pet.tsx');
    assert.doesNotMatch(pet, /spend_points|buyAccessory|purchase\(/);
    assert.match(pet, /Unlocking is on the PetQuest website for now/);
  });

  test('Accessories is one tap from Pet and two from Home', () => {
    const pet = app('(tabs)/pet.tsx');
    assert.match(pet, /\{ key: 'accessories', label: 'Accessories', icon: 'shirt-outline' \}/);
    assert.match(pet, /params\.view === 'accessories'/);
    assert.match(app('(tabs)/index.tsx'), /pathname: '\/pet'/);
    assert.doesNotMatch(app('(tabs)/_layout.tsx'), /name="accessories"/, 'no fifth tab');
  });
});

describe('7. separation and small screens', () => {
  test('participant screens carry nothing admin-only', () => {
    for (const p of ['(tabs)/index.tsx', '(tabs)/pet.tsx']) {
      assert.doesNotMatch(app(p), /@\/data\/admin|admin_reason|risk_flags|get_research_analytics/, `${p}`);
    }
    for (const f of ['src/components/PetHomeHero.tsx', 'src/components/StatusRing.tsx', 'src/data/petHomes.ts', 'src/data/accessories.ts']) {
      assert.doesNotMatch(read(f), /@\/data\/admin|admin_/, f);
    }
  });

  test('no fixed width over 288pt, no minWidth, no horizontal scroll in the new pieces', () => {
    for (const f of ['src/app/(tabs)/index.tsx', 'src/app/(tabs)/pet.tsx', 'src/components/PetHomeHero.tsx', 'src/components/StatusRing.tsx']) {
      const src = read(f);
      for (const m of src.matchAll(/\bwidth:\s*(\d+)\b/g)) assert.ok(Number(m[1]) <= 288, `${f}: width ${m[1]}`);
      assert.doesNotMatch(src, /\bminWidth:/, `${f} sets a minWidth`);
      assert.doesNotMatch(src, /horizontal(=\{true\})?\s/, `${f} scrolls sideways`);
    }
    // Three rings side by side: 3 × 68 + gaps fits 288.
    assert.match(app('(tabs)/index.tsx'), /size=\{68\}/);
    assert.match(read('src/components/StatusRing.tsx'), /wrap: \{ flex: 1/);
  });

  test('every ring and care button is a labelled control', () => {
    const ring = read('src/components/StatusRing.tsx');
    assert.match(ring, /accessibilityLabel=\{a11y\}/);
    assert.match(ring, /`\$\{label\}: \$\{fraction == null \? 'not loaded'/);
    assert.match(app('(tabs)/pet.tsx'), /accessibilityRole="tab"/);
  });
});
