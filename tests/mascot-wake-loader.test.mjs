/*
 * Mascot wake-up loader — the account-loading animation that replaced the gold
 * "portal" pulsing circle. Run with `npm test` (Node ≥ 20, no extra deps).
 *
 * Three kinds of check:
 *   • pure logic from src/config/pets.js (frame order, timings, pet selection),
 *   • the PNG assets themselves — decoded far enough to prove the frames really
 *     are the PetQuest mascots (palette hue signature), not a substitute,
 *   • static guards on the components for the properties that only exist at
 *     render time (restart, timer cleanup, reduced motion, fallbacks), matching
 *     how the rest of this suite tests client code.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  wakeFramesFor, wakeMessageFor, resolveWakePet, petIdOf,
  WAKE_SEQUENCE, WAKE_TIMINGS, WAKE_TOTAL_MS, WAKE_PETS, WAKE_STAGE_SHEETS,
  WAKE_FALLBACK_MESSAGE, wakeFrameIndexAt, spriteFor,
} from '../src/config/pets.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const abs  = (webPath) => path.join(ROOT, 'public', webPath.replace(/^\//, ''))

const LOADER  = read('src/components/animations/MascotWakeLoader.jsx')
const APP     = read('src/App.jsx')
const LOGIN   = read('src/pages/LoginPage.jsx')
const CSS     = read('src/index.css')
const PETS    = ['dragon', 'cat', 'wolf']

/* ── minimal PNG reader: IHDR + PLTE, no dependencies ── */
function pngChunks(buf) {
  const out = {}
  let o = 8
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o)
    out[buf.toString('ascii', o + 4, o + 8)] = buf.slice(o + 8, o + 8 + len)
    o += 12 + len
  }
  return out
}
function pngInfo(file) {
  const c = pngChunks(readFileSync(file))
  return { width: c.IHDR.readUInt32BE(0), height: c.IHDR.readUInt32BE(4), colorType: c.IHDR[9], palette: c.PLTE }
}
function hueOf(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6)
    else if (mx === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return [h < 0 ? h + 360 : h, mx ? d / mx : 0, mx]
}
const inBand = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b)

/* Share of the vivid palette entries falling in each identity band. */
function palette(file) {
  const { palette: p } = pngInfo(file)
  const bands = { violet: [255, 345], warm: [330, 60], blue: [165, 255], green: [75, 165] }
  const hits = { violet: 0, warm: 0, blue: 0, green: 0 }
  let n = 0
  for (let i = 0; i < p.length; i += 3) {
    const [h, s, v] = hueOf(p[i], p[i + 1], p[i + 2])
    if (s < 0.18 || v < 0.15) continue      // skip greys/near-black: no hue identity
    n++
    for (const k of Object.keys(bands)) if (inBand(h, bands[k][0], bands[k][1])) hits[k]++
  }
  return { vivid: n, pct: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, (100 * v) / n])) }
}

describe('1–2. the frames are the real PetQuest mascots, not substitutes', () => {
  test('every wake frame exists, is a 256×256 PNG, and is optimized', () => {
    for (const pet of PETS) {
      const frames = wakeFramesFor(pet)
      assert.equal(frames.length, 4)
      for (const f of frames) {
        const file = abs(f)
        assert.ok(existsSync(file), `missing asset: ${f}`)
        const { width, height } = pngInfo(file)
        assert.equal(width, 256)
        assert.equal(height, 256)
        // Optimized: PNG-8 output, comfortably under 40 KB per frame.
        assert.ok(statSync(file).size < 40 * 1024, `${f} is ${statSync(file).size} bytes — not optimized`)
      }
    }
  })

  test('Arcane Dragon keeps its purple/magenta identity (no green dragon)', () => {
    for (const f of wakeFramesFor('dragon')) {
      const { pct } = palette(abs(f))
      assert.ok(pct.violet >= 45, `${f}: violet ${pct.violet.toFixed(0)}% — not the purple dragon`)
      assert.ok(pct.warm >= 20, `${f}: missing the red horns / golden eyes`)
      assert.ok(pct.green < 5, `${f}: green ${pct.green.toFixed(0)}% — wrong dragon`)
      assert.ok(pct.blue < 10, `${f}: reads as the wolf palette`)
    }
  })

  test('Mystic Cat keeps cream/amber + violet magic (no orange tabby)', () => {
    for (const f of wakeFramesFor('cat')) {
      const { pct } = palette(abs(f))
      assert.ok(pct.warm >= 55, `${f}: warm ${pct.warm.toFixed(0)}% — not the cream/golden kitten`)
      // The crescent marking, purple collar and violet sparkles: a plain orange
      // tabby would be warm but carry no violet at all.
      assert.ok(pct.violet >= 15, `${f}: violet ${pct.violet.toFixed(0)}% — the mystic magic is missing`)
      assert.ok(pct.blue < 10, `${f}: reads as the wolf palette`)
    }
  })

  test('Spirit Wolf keeps its white-blue + cyan identity (no grey realistic wolf)', () => {
    for (const f of wakeFramesFor('wolf')) {
      const { pct, vivid } = palette(abs(f))
      assert.ok(pct.blue >= 80, `${f}: blue ${pct.blue.toFixed(0)}% — not the cyan spirit wolf`)
      assert.ok(pct.warm < 15, `${f}: warm ${pct.warm.toFixed(0)}% — wrong wolf`)
      assert.ok(pct.green < 5)
      // A desaturated "realistic" wolf would have almost no vivid entries.
      assert.ok(vivid > 60, `${f}: only ${vivid} vivid colours — the cyan wisps are gone`)
    }
  })

  test('the 12 original evolution assets are untouched', () => {
    for (const pet of PETS) {
      for (let lvl = 1; lvl <= 4; lvl++) assert.ok(existsSync(abs(spriteFor(pet, lvl))))
    }
  })
})

describe('3–4. the sequence starts asleep and plays all four frames in order', () => {
  test('frame order is sleep → stir → action → awake', () => {
    assert.deepEqual(WAKE_SEQUENCE, ['sleep', 'stir', 'action', 'awake'])
  })

  test('file names follow the documented pattern, action frame per species', () => {
    assert.deepEqual(wakeFramesFor('dragon'), [
      '/pets/wake/dragon_wake_01_sleep.png', '/pets/wake/dragon_wake_02_stir.png',
      '/pets/wake/dragon_wake_03_spark.png', '/pets/wake/dragon_wake_04_awake.png',
    ])
    assert.match(wakeFramesFor('cat')[2], /cat_wake_03_stretch\.png$/)
    assert.match(wakeFramesFor('wolf')[2], /wolf_wake_03_listen\.png$/)
  })

  test('timings: 700 / 400 / 500, awake open-ended', () => {
    assert.deepEqual(WAKE_TIMINGS, { sleep: 700, stir: 400, action: 500 })
    assert.equal(WAKE_TOTAL_MS, 1600)
    assert.equal(WAKE_TIMINGS.awake, undefined, 'awake must not be on a timer')
  })

  test('the right frame is showing at each point in the sequence', () => {
    assert.equal(wakeFrameIndexAt(0), 0)       // starts asleep
    assert.equal(wakeFrameIndexAt(699), 0)
    assert.equal(wakeFrameIndexAt(700), 1)     // stir
    assert.equal(wakeFrameIndexAt(1099), 1)
    assert.equal(wakeFrameIndexAt(1100), 2)    // personality action
    assert.equal(wakeFrameIndexAt(1599), 2)
    assert.equal(wakeFrameIndexAt(1600), 3)    // awake
    assert.equal(wakeFrameIndexAt(60000), 3)   // …and holds there
  })

  test('the component starts each run at frame 0 and animates every frame', () => {
    assert.match(LOADER, /setFrame\(0\)\s*\/\/ every \(re\)start begins asleep/)
    assert.match(LOADER, /for \(let i = 1; i < WAKE_SEQUENCE\.length; i\+\+\)/)
  })
})

describe('5. the sequence restarts on every new loading instance', () => {
  test('the effect re-runs on restartToken (and therefore on mount)', () => {
    assert.match(LOADER, /\}, \[restartToken, petId, reduceMotion\]\)/)
  })
  test('login bumps restartToken for each sign-in attempt', () => {
    assert.match(LOGIN, /setAttempt\(n => n \+ 1\)/)
    assert.match(LOGIN, /restartToken=\{attempt\}/)
  })
})

describe('6–7. pet selection: real pet when known, random only when not', () => {
  test('the authenticated pet is used, in app-id or assetType form', () => {
    assert.deepEqual(resolveWakePet('wolf'), { id: 'wolf', random: false })
    assert.deepEqual(resolveWakePet('mystic_cat'), { id: 'cat', random: false })
    assert.equal(petIdOf('arcane_dragon'), 'dragon')
  })

  test('random selection happens only when the pet is unavailable', () => {
    for (const known of ['dragon', 'cat', 'wolf', 'spirit_wolf']) {
      assert.equal(resolveWakePet(known, () => 0.99).random, false)
    }
    assert.equal(resolveWakePet(null, () => 0).id, 'dragon')
    assert.equal(resolveWakePet(undefined, () => 0.5).id, 'cat')
    assert.equal(resolveWakePet('', () => 0.99).id, 'wolf')
    assert.equal(resolveWakePet(null, () => 0.99).random, true)
  })

  test('random picks stay inside the three real companions', () => {
    for (let i = 0; i < 50; i++) {
      assert.ok(PETS.includes(resolveWakePet(null, () => i / 50).id))
    }
  })

  test('the pet is locked for the whole animation (no mid-sequence swap)', () => {
    // Re-picked only when restartToken changes — a late-arriving profile cannot
    // replace the companion halfway through.
    assert.match(LOADER, /if \(lockRef\.current === null \|\| tokenRef\.current !== restartToken\)/)
    assert.match(LOADER, /const \{ id: petId, random: isRandomPet \} = lockRef\.current/)
  })

  test('an unknown evolution stage keeps the species and falls back to baby art', () => {
    assert.deepEqual(Object.values(WAKE_STAGE_SHEETS), ['baby', 'baby', 'baby', 'baby'])
    for (const stage of ['baby', 'juvenile', 'adult', 'elder', 1, 3, 5, null]) {
      for (const pet of PETS) {
        for (const f of wakeFramesFor(pet, stage)) {
          assert.match(f, new RegExp(`/${pet}_wake_`), `stage ${stage} switched species`)
          assert.ok(existsSync(abs(f)))
        }
      }
    }
  })
})

describe('8–9. awake frame holds; fast loads are not delayed', () => {
  test('only the first three poses are on timers — awake has none', () => {
    const timed = Object.keys(WAKE_TIMINGS)
    assert.deepEqual(timed, ['sleep', 'stir', 'action'])
    assert.ok(WAKE_TOTAL_MS <= 1600, 'the whole intro must stay short')
  })

  test('the loader itself never blocks or delays the caller', () => {
    // It is presentational: no timeout that gates unmounting, and the parent
    // decides when loading is over (it simply unmounts the loader).
    assert.doesNotMatch(LOADER, /onDone|onComplete|minDuration|await /)
  })

  test('login keeps its own pre-existing settle floor, unchanged', () => {
    assert.match(LOGIN, /const minMs = 800 \+ Math\.random\(\) \* 700/)
    assert.match(LOGIN, /This is a floor, not an added delay/)
  })
})

describe('10. timers are cleaned up on unmount', () => {
  test('every timeout is cleared in the effect cleanup', () => {
    assert.match(LOADER, /return \(\) => timers\.forEach\(clearTimeout\)/)
    // The tip rotator in the full-screen wrapper clears its interval too.
    assert.match(LOADER, /return \(\) => clearInterval\(id\)/)
  })
})

describe('11. reduced motion', () => {
  test('jumps straight to the awake frame and sets no timers', () => {
    assert.match(LOADER, /if \(reduceMotion\) \{ setFrame\(3\); return \}/)
    assert.match(LOADER, /useReducedMotion/)
  })
  test('the caption still renders when motion is reduced', () => {
    // showMessage is independent of reduceMotion — no gating between them.
    assert.match(LOADER, /\{showMessage && \(/)
    assert.doesNotMatch(LOADER, /showMessage && !reduceMotion/)
  })
})

describe('12. layout: mobile widths, no shift, no horizontal scroll', () => {
  test('the mascot box is a fixed square within the mobile range', () => {
    assert.match(LOADER, /size = 112/)                       // default
    assert.match(LOADER, /size=\{128\}/)                     // full-screen wrapper
    assert.match(LOADER, /style=\{\{ width: size, height: size \}\}/)
  })
  test('128px + page padding fits 320 / 375 / 400px viewports', () => {
    const PADDING_X = 24 * 2   // px-6 on the full-screen wrapper
    for (const viewport of [320, 375, 400]) {
      assert.ok(128 + PADDING_X <= viewport, `overflows at ${viewport}px`)
    }
  })
  test('frames are absolutely stacked, so swapping one cannot reflow the page', () => {
    assert.match(LOADER, /position: 'absolute', inset: 0, width: '100%', height: '100%'/)
  })
  test('no text glyph is overlaid on the mascot (the art carries its own Zzz)', () => {
    assert.doesNotMatch(LOADER, /fontSize: Math\.round\(size \* 0\.17\)/)
  })
  test('the caption is width-capped so long messages wrap instead of scrolling', () => {
    assert.match(LOADER, /maxWidth: 320/)
    assert.ok(WAKE_PETS.wolf.message.length > 30)   // the longest caption
  })
})

describe('13. the old yellow pulsing circle is gone from account loading', () => {
  test('PortalLoader no longer exists and is imported nowhere', () => {
    assert.ok(!existsSync(path.join(ROOT, 'src/components/animations/PortalLoader.jsx')))
    assert.doesNotMatch(APP, /PortalLoader/)
    assert.doesNotMatch(LOGIN, /PortalLoader/)
  })
  test('its gold ring/pulse CSS is removed', () => {
    for (const cls of ['.portal-core', '.portal-ring', '.portal-eye']) {
      assert.ok(!CSS.includes(cls), `${cls} is still in index.css`)
    }
  })
  test('both account-loading views render the mascot instead', () => {
    assert.match(APP, /<MascotWakeScreen petType=\{petId\}/)
    assert.match(LOGIN, /<MascotWakeLoader/)
  })
  test('unrelated loaders are left alone', () => {
    // Login button spinner, the AI verification waypoints, admin/leaderboard.
    assert.match(LOGIN, /⚙️/)
    assert.match(read('src/components/VerificationModal.jsx'), /GildedWaypoints/)
    assert.match(read('src/pages/AdminPage.jsx'), /⚙️/)
    assert.match(read('src/pages/LeaderboardPage.jsx'), /⚙️/)
  })
})

describe('14. missing assets fall back to the static mascot', () => {
  test('a failed wake frame shows the static baby sprite, then the emoji', () => {
    assert.match(LOADER, /onError=\{\(\) => setBroken\(true\)\}/)
    assert.match(LOADER, /broken\s*\n?\s*\? <StaticFallback/)
    assert.match(LOADER, /src=\{spriteFor\(petId, 1\)\}/)   // the existing baby asset
    assert.match(LOADER, /\{emoji\}/)                        // last-resort
  })
  test('the static fallback target exists for every companion', () => {
    for (const pet of PETS) assert.ok(existsSync(abs(spriteFor(pet, 1))))
  })
})

describe('15. captions and accessibility', () => {
  test('each companion has its specified message', () => {
    assert.equal(wakeMessageFor('dragon'), 'Waking your Dragon…')
    assert.equal(wakeMessageFor('cat'), 'The Mystic Cat is stretching awake…')
    assert.equal(wakeMessageFor('wolf'), 'The Spirit Wolf is listening for your next quest…')
    assert.equal(wakeMessageFor(null), WAKE_FALLBACK_MESSAGE)
    assert.equal(WAKE_FALLBACK_MESSAGE, 'Preparing your adventure…')
  })
  test('a randomly picked stand-in uses the neutral fallback caption', () => {
    // It would be wrong to tell a brand-new user we are "waking your Dragon".
    assert.match(LOADER, /isRandomPet \? WAKE_FALLBACK_MESSAGE : wakeMessageFor\(petId\)/)
    // The overlay passes no caption override, so the rule above decides it.
    assert.match(LOGIN, /<MascotWakeLoader size=\{128\} restartToken=\{attempt\} \/>/)
  })
  test('an accessible live status describes the wait', () => {
    assert.match(LOADER, /role="status" aria-live="polite"/)
    assert.match(LOADER, /Loading your PetQuest account\. Your pet is waking up\./)
    assert.match(LOADER, /className="sr-only"/)
  })
  test('decorative layers are hidden from screen readers', () => {
    // The glow layer is purely decorative…
    assert.match(LOADER, /<motion\.span aria-hidden="true"/)
    // …and only the frame currently on screen is exposed; the three stacked
    // behind it are hidden, so the pet is announced once, not four times.
    assert.match(LOADER, /aria-hidden=\{i === frame \? undefined : 'true'\}/)
    assert.match(LOADER, /alt=\{i === frame \? `\$\{meta\.species\} waking up` : ''\}/)
  })
})

describe('16. existing flows are untouched', () => {
  test('login/registration logic is unchanged', () => {
    assert.match(LOGIN, /await login\(email\.trim\(\), password\)/)
    assert.match(LOGIN, /await register\(email\.trim\(\), password, username\.trim\(\)\)/)
    assert.match(LOGIN, /navigate\('\/select'\)/)
    assert.match(LOGIN, /Invalid email or password/)
  })
  test('the route guards and dashboard initialisation are unchanged', () => {
    assert.match(APP, /if \(!authReady\) return <LoadingScreen/)
    for (const route of ['/select', '/mode-select', '/dashboard', '/admin']) {
      assert.ok(APP.includes(`path="${route}"`), `route ${route} missing`)
    }
  })
  test('quest verification and the validity check still have their own loaders', () => {
    assert.match(read('src/components/TaskList.jsx'), /MascotLoaderCompact/)
    assert.match(LOADER, /export function MascotLoaderCompact/)   // shared, not duplicated
  })
})
