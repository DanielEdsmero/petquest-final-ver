/*
 * Phase 8 — care actions on mobile, settled by the server.
 *
 * Block 1 is the pure model. Blocks 2–3 pin the two properties that matter:
 * the numbers on the phone are the migration's numbers, and nothing on the
 * phone can move a point or a stat except through care_pet().
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CARE_ACTIONS,
  CARE_BOOST,
  CARE_COST,
  canAfford,
  careErrorMessage,
  careSuccessMessage,
  previewStats,
} from '../src/data/careModel.ts';

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(MOBILE, '..', '..');
const readWeb = (p: string) => readFileSync(path.join(REPO, p), 'utf8');
const readMobile = (p: string) => readFileSync(path.join(MOBILE, p), 'utf8');

const MIGRATION = readWeb('supabase/supabase-phase13-spend-points.sql');
const GAME = readWeb('src/context/GameContext.jsx');

describe('1. the care model', () => {
  test('three actions, one stat each, in the web order', () => {
    assert.deepEqual(CARE_ACTIONS.map((a) => a.key), ['feed', 'wash', 'play']);
    assert.deepEqual(CARE_ACTIONS.map((a) => a.stat), ['hunger', 'cleanliness', 'happiness']);
  });

  test('a null balance lets the server decide; a known short balance stops early', () => {
    assert.equal(canAfford(null), true);
    assert.equal(canAfford(undefined), true);
    assert.equal(canAfford(CARE_COST), true);
    assert.equal(canAfford(CARE_COST - 1), false);
    assert.equal(canAfford(0), false);
  });

  test('error codes map to participant wording', () => {
    assert.equal(careErrorMessage('insufficient_points'), `Not enough points! Need ${CARE_COST} 💸`);
    assert.match(careErrorMessage('no_pet'), /Hatch your companion/);
    assert.match(careErrorMessage('unauthenticated'), /sign in again/);
    assert.match(careErrorMessage('network'), /connection/);
    assert.match(careErrorMessage('something_else'), /try again/);
    assert.match(careErrorMessage(undefined), /try again/);
  });

  test('success wording is the web wording, with the pet name', () => {
    assert.equal(careSuccessMessage('feed', 'Ember'), 'Ember loved the meal! 🍖');
    assert.equal(careSuccessMessage('wash', 'Ember'), 'Ember is sparkling clean! 🛁');
    assert.equal(careSuccessMessage('play', 'Ember'), 'Ember is overjoyed! 🎉');
    assert.equal(careSuccessMessage('play', null), 'Your companion is overjoyed! 🎉');
    for (const a of CARE_ACTIONS) {
      const tail = a.success.replace('{name} ', '');
      assert.ok(GAME.includes(`carePet('${a.key}', \`\${selectedPet?.name} ${tail}\`)`), `web wording differs for ${a.key}`);
    }
  });

  test('the preview caps at 100 and touches one stat', () => {
    assert.deepEqual(previewStats({ hunger: 80, cleanliness: 78, happiness: 72 }, 'feed'), { hunger: 100, cleanliness: 78, happiness: 72 });
    assert.deepEqual(previewStats({ hunger: 10, cleanliness: 10, happiness: 10 }, 'play'), { hunger: 10, cleanliness: 10, happiness: 40 });
  });
});

describe('2. the numbers on the phone are the migration numbers', () => {
  test('cost and boost', () => {
    assert.match(MIGRATION, new RegExp(`c_cost\\s+constant integer := ${CARE_COST};`));
    assert.match(MIGRATION, new RegExp(`c_boost\\s+constant numeric := ${CARE_BOOST};`));
  });

  test('the action names are the ones care_pet accepts', () => {
    for (const a of CARE_ACTIONS) {
      assert.match(MIGRATION, new RegExp(`when '${a.key}' then '${a.stat}'`), `${a.key} → ${a.stat} not in care_pet`);
    }
  });

  test('the error codes handled are the ones care_pet returns', () => {
    for (const code of ['insufficient_points', 'no_pet', 'unauthenticated', 'invalid_action']) {
      assert.match(MIGRATION, new RegExp(`'${code}'`));
    }
  });
});

describe('3. nothing on the phone moves a point or a stat itself', () => {
  const pet = readMobile('src/app/(tabs)/pet.tsx');
  const care = readMobile('src/data/care.ts');

  test('the only write path is the RPC', () => {
    assert.match(care, /supabase\.rpc\('care_pet', \{ p_action: action \}\)/);
    assert.doesNotMatch(care, /\.from\(/);
    assert.doesNotMatch(care, /spend_points/, 'care goes through care_pet, which debits itself');
  });

  test('the screen shows the balance and stats the server returned', () => {
    assert.match(pet, /if \(typeof r\.points === 'number'\) setLivePoints\(r\.points\)/);
    assert.match(pet, /setLiveStats\(r\.stats\)/);
    assert.doesNotMatch(pet, /previewStats\(/, 'no optimistic stat boost on the screen');
    assert.doesNotMatch(pet, /livePoints\s*-\s*CARE_COST/, 'no local debit');
  });

  test('the balance is re-synced from the profile after a success', () => {
    assert.match(pet, /void refreshProfile\(\);/);
  });

  test('care is unavailable without a companion (the server would say no_pet)', () => {
    assert.match(pet, /\{meta \? \([\s\S]*?CARE_ACTIONS\.map/);
    assert.match(MIGRATION, /selected_pet_id is not null[\s\S]*?'no_pet'/);
  });

  test('buttons are real tap targets with a cost in the label', () => {
    assert.match(pet, /accessibilityLabel=\{`\$\{a\.label\} \$\{meta\.name\}, \$\{CARE_COST\} points`\}/);
    assert.match(pet, /careBtn: \{[\s\S]*?minHeight: 64/);
  });

  test('the guard trigger would reject this client anyway', () => {
    assert.match(MIGRATION, /current_user in \('anon', 'authenticated'\)/);
    assert.match(MIGRATION, /before update on public\.profiles/);
  });
});
