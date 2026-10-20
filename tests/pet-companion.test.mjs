/*
 * The roaming companion and the first-login guide. Run with `npm test`.
 * Block 1 covers the pure model; block 2 is a static guard that the practice
 * selfie can never leave the device (the study collects no personal identifiers).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  lineForSpot, planWalk, nextWalkDelay, standPoint, stepToward,
  GUIDE_STEPS, guideKey, isGuideDone, markGuideDone, readDnd, writeDnd, leaveLine, returnLine,
  LEAVE_LINES, RETURN_LINES,
} from '../src/data/petCompanion.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }
const seq = (...v) => { let i = 0; return () => v[i++ % v.length] }

describe('what the pet says at a spot', () => {
  test('quests: counts active quests, singular and plural', () => {
    assert.match(lineForSpot('quests', { activeQuests: 1 }), /1 active quest\./)
    assert.match(lineForSpot('quests', { activeQuests: 3 }), /3 active quests/)
    assert.match(lineForSpot('quests', { activeQuests: 0 }), /No quests yet/)
  })
  test('care: speaks about the lowest need first', () => {
    assert.match(lineForSpot('care', { hunger: 10 }), /hungry/)
    assert.match(lineForSpot('care', { cleanliness: 10 }), /wash/)
    assert.match(lineForSpot('care', { happiness: 10 }), /play/)
    assert.match(lineForSpot('care', {}), /10 points each/)
  })
  test('streak and points', () => {
    assert.match(lineForSpot('streak', { streak: 4 }), /4-day streak/)
    assert.match(lineForSpot('streak', { streak: 0 }), /start a streak/)
    assert.match(lineForSpot('points', { points: 120 }), /120 points/)
    assert.match(lineForSpot('points', { points: 3 }), /earn points/)
  })
  test('an unknown spot says nothing', () => assert.equal(lineForSpot('nope'), ''))
  test('leave and return lines come from the lists', () => {
    assert.ok(LEAVE_LINES.includes(leaveLine(() => 0.99)))
    assert.ok(RETURN_LINES.includes(returnLine(() => 0)))
  })
})

describe('planning a walk', () => {
  const ids = ['points', 'quests', 'care', 'evolution', 'shop']
  test('picks 2 or 3 spots, in page order, without repeats', () => {
    for (let n = 0; n < 50; n++) {
      const plan = planWalk(ids)
      assert.ok(plan.length >= 2 && plan.length <= 3)
      assert.deepEqual(plan, ids.filter(id => plan.includes(id)))
    }
  })
  test('avoids recent spots when enough fresh ones remain', () => {
    for (let n = 0; n < 50; n++) {
      const plan = planWalk(ids, Math.random, ['points', 'quests'])
      assert.ok(!plan.includes('points') && !plan.includes('quests'))
    }
  })
  test('falls back to all spots when nearly everything was visited', () => {
    assert.ok(planWalk(['a', 'b'], Math.random, ['a']).length === 2)
  })
  test('one spot on the page, one spot visited; none, none', () => {
    assert.deepEqual(planWalk(['only']), ['only'])
    assert.deepEqual(planWalk([]), [])
  })
  test('auto-walk delay is between 40 and 80 seconds', () => {
    assert.equal(nextWalkDelay(() => 0), 40000)
    assert.ok(nextWalkDelay(() => 0.999) < 80000)
  })
})

describe('movement', () => {
  test('standPoint puts the feet on the top edge and keeps the pet inside the screen', () => {
    const p = standPoint({ left: 100, top: 400, width: 200 }, 1280, 800, 72, 0.5)
    assert.deepEqual(p, { x: 200, y: 400 })
    const edge = standPoint({ left: 0, top: 10, width: 20 }, 1280, 800, 72, 0)
    assert.ok(edge.x >= 36 + 4)            // not off the left edge
    assert.ok(edge.y >= 72 + 64)           // clear of the sticky header
    assert.ok(standPoint({ left: 1270, top: 5000, width: 50 }, 1280, 800, 72, 1).y <= 792)
  })
  test('stepToward moves at the given speed and reports arrival', () => {
    const s = stepToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2, 100)
    assert.deepEqual([s.x, s.y, s.arrived], [20, 0, false])
    assert.equal(stepToward({ x: 99, y: 0 }, { x: 100, y: 0 }, 0.2, 100).arrived, true)
    assert.ok(stepToward({ x: 100, y: 0 }, { x: 0, y: 0 }, 0.2, 10).dx < 0)
  })
})

describe('the first-login guide', () => {
  test('five steps, in the order hello, quests, care, selfie, done', () => {
    assert.deepEqual(GUIDE_STEPS('Luna').map(s => s.id), ['hello', 'quests', 'care', 'selfie', 'done'])
  })
  test('steps that point at the page name a spot; the others do not', () => {
    const by = Object.fromEntries(GUIDE_STEPS('Luna').map(s => [s.id, s]))
    assert.equal(by.quests.spot, 'quests'); assert.equal(by.care.spot, 'care')
    assert.equal(by.hello.spot, null); assert.equal(by.selfie.spot, null)
  })
  test('uses the chosen pet name, and the selfie step says it is practice', () => {
    assert.match(GUIDE_STEPS('Ember')[0].title, /Ember/)
    assert.match(GUIDE_STEPS('Luna').find(s => s.id === 'selfie').body, /practice/i)
  })
  test('shows once per account, and never without an account', () => {
    const s = memory()
    assert.equal(isGuideDone(s, 'u1'), false)
    markGuideDone(s, 'u1')
    assert.equal(isGuideDone(s, 'u1'), true)
    assert.equal(isGuideDone(s, 'u2'), false)
    assert.equal(isGuideDone(s, null), true)
    assert.equal(guideKey('u1'), 'pq_guide_done:u1')
  })
  test('blocked storage never throws', () => {
    const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    assert.equal(isGuideDone(broken, 'u1'), false)
    assert.doesNotThrow(() => markGuideDone(broken, 'u1'))
    assert.equal(readDnd(broken), false)
    assert.doesNotThrow(() => writeDnd(broken, true))
  })
  test('do not disturb round-trips', () => {
    const s = memory()
    assert.equal(readDnd(s), false)
    writeDnd(s, true); assert.equal(readDnd(s), true)
    writeDnd(s, false); assert.equal(readDnd(s), false)
  })
})

describe('the practice selfie never leaves the device', () => {
  // Code only: comments may say "Supabase" while promising not to use it.
  const guide = read('src/components/PetGuide.jsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
  test('no network, storage or database calls in the guide', () => {
    assert.ok(!/\bfetch\s*\(/.test(guide), 'fetch found')
    assert.ok(!/XMLHttpRequest|sendBeacon|FormData|\.upload\(|supabase/i.test(guide), 'network/db reference found')
    assert.ok(!/localStorage\.setItem|sessionStorage|indexedDB/i.test(guide.replace(/markGuideDone\(window\.localStorage/, '')), 'storage write found')
    assert.ok(!/console\.(log|info|debug)/.test(guide), 'logging found')
  })
  test('the camera is only requested on a click and is always switched off', () => {
    assert.match(guide, /getUserMedia/)
    assert.match(guide, /getTracks\(\)\.forEach\(t => t\.stop\(\)\)/)
    assert.match(guide, /useEffect\(\(\) => \(\) => \{ stop\(\) \}, \[\]\)/)
    assert.ok(!/getUserMedia[\s\S]{0,40}useEffect/.test(guide))
  })
  test('the screen tells the student it is practice only', () => {
    assert.match(guide, /never uploaded or saved/)
  })
})

describe('wiring', () => {
  test('the dashboard marks the spots the pet visits', () => {
    const dash = read('src/pages/DashboardPage.jsx')
    for (const id of ['points', 'streak', 'quests', 'care', 'evolution', 'shop']) assert.ok(dash.includes(`data-pet-spot="${id}"`), id)
    assert.ok(dash.includes('home />'), 'PetRoom marked as the pet home')
  })
  test('the photo-proof dialog keeps the pet away', () => {
    assert.ok(read('src/components/VerificationModal.jsx').includes('data-pet-quiet'))
  })
  test('the pet roams only after the account is revealed, and never on admin or onboarding pages', () => {
    const app = read('src/App.jsx')
    assert.match(app, /loggedIn && hasPet && hasMode && !gated && <><RoamingPet \/><PetGuide \/><\/>/)
    assert.match(read('src/components/RoamingPet.jsx'), /ROUTES = \['\/dashboard', '\/accessories', '\/leaderboard'\]/)
  })
})
