/*
 * Mascot wake-up loader — the mandatory-but-skippable account-loading buffer
 * that replaced the gold "portal" pulsing circle.
 * Run with `npm test` (Node ≥ 20, no extra deps).
 *
 * Three kinds of check:
 *   • pure logic from src/config/pets.js (phases, timings, reveal rule, pet
 *     selection, per-phase captions),
 *   • the PNG assets themselves — decoded far enough to prove the frames really
 *     are the PetQuest mascots (palette hue signature), not a substitute,
 *   • static guards on the components for the properties that only exist at
 *     render time (restart, timer cleanup, skip wiring, reduced motion),
 *     matching how the rest of this suite tests client code.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  wakeFramesFor, wakeMessageFor, resolveWakePet, petIdOf, spriteFor,
  wakePhaseAt, wakePhaseStarts, wakeFrameForPhase, wakeFrameIndexAt, shouldRevealAccount,
  WAKE_PHASES, WAKE_TERMINAL_PHASES, WAKE_TIMINGS, WAKE_PETS, WAKE_STAGE_SHEETS,
  WAKE_PHASE_MESSAGES, WAKE_FALLBACK_MESSAGE, MIN_MASCOT_LOADER_MS,
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

describe('1. the sleeping frame is what a participant sees first', () => {
  test('the sequence opens on the sleeping phase / frame 0', () => {
    assert.equal(WAKE_PHASES[0], 'sleeping')
    assert.equal(wakePhaseAt(0), 'sleeping')
    assert.equal(wakeFrameIndexAt(0), 0)
    assert.equal(wakePhaseStarts().sleeping, 0)
  })
  test('the component initialises to sleeping and resets there on every run', () => {
    assert.match(LOADER, /useState\('sleeping'\)/)
    assert.match(LOADER, /setPhase\('sleeping'\)\s*\/\/ every \(re\)start begins asleep/)
  })
})

describe('2. the sequence is long enough to notice (~4.2s)', () => {
  test('per-phase timings are 1200 / 900 / 1200 / 900', () => {
    assert.deepEqual(WAKE_TIMINGS, { sleeping: 1200, waking: 900, personalityAction: 1200, awake: 900 })
  })
  test('the configurable minimum is 4200ms and never under ~4s', () => {
    assert.equal(MIN_MASCOT_LOADER_MS, 4200)
    assert.ok(MIN_MASCOT_LOADER_MS >= 4000, 'the buffer must stay recognisable')
    assert.match(read('src/config/pets.js'), /export const MIN_MASCOT_LOADER_MS/)
  })
  test('every phase is slow enough to read (no fast CSS loop)', () => {
    for (const [phase, ms] of Object.entries(WAKE_TIMINGS)) {
      assert.ok(ms >= 900, `${phase} holds only ${ms}ms`)
    }
  })
})

describe('3. all four frames play in the correct order', () => {
  test('the phase order is sleeping → waking → personalityAction → awake', () => {
    assert.deepEqual(WAKE_PHASES, ['sleeping', 'waking', 'personalityAction', 'awake'])
  })
  test('each phase maps to its own frame, in order', () => {
    assert.deepEqual(WAKE_PHASES.map(wakeFrameForPhase), [0, 1, 2, 3])
  })
  test('the phase boundaries land where the timings say', () => {
    const s = wakePhaseStarts()
    assert.deepEqual(s, { sleeping: 0, waking: 1200, personalityAction: 2100, awake: 3300 })
    assert.equal(wakePhaseAt(1199), 'sleeping')
    assert.equal(wakePhaseAt(1200), 'waking')
    assert.equal(wakePhaseAt(2099), 'waking')
    assert.equal(wakePhaseAt(2100), 'personalityAction')
    assert.equal(wakePhaseAt(3299), 'personalityAction')
    assert.equal(wakePhaseAt(3300), 'awake')
    assert.equal(wakePhaseAt(4200), 'awake')
    assert.equal(wakePhaseAt(60000), 'awake')   // holds, never loops back
  })
  test('file names follow the documented pattern, action frame per species', () => {
    assert.deepEqual(wakeFramesFor('dragon'), [
      '/pets/wake/dragon_wake_01_sleep.png', '/pets/wake/dragon_wake_02_stir.png',
      '/pets/wake/dragon_wake_03_spark.png', '/pets/wake/dragon_wake_04_awake.png',
    ])
    assert.match(wakeFramesFor('cat')[2], /cat_wake_03_stretch\.png$/)
    assert.match(wakeFramesFor('wolf')[2], /wolf_wake_03_listen\.png$/)
  })
  test('every terminal state holds the awake frame', () => {
    for (const p of WAKE_TERMINAL_PHASES) assert.equal(wakeFrameForPhase(p), 3)
  })
})

describe('4. account data loads immediately, in parallel', () => {
  test('the loader gates the reveal, never the request', () => {
    // It has no fetching of its own and awaits nothing.
    assert.doesNotMatch(LOADER, /supabase|fetch\(|await /)
  })
  test('GameContext still starts auth + data on mount, untouched by the gate', () => {
    const ctx = read('src/context/GameContext.jsx')
    assert.match(ctx, /supabase\.auth\.getSession\(\)\.then/)
    assert.match(ctx, /fetchProfile\(session\.user\.id\)/)
  })
  test('App renders the loader without delaying the provider beneath it', () => {
    // The gate lives inside AppRoutes, under GameProvider — so the provider (and
    // its requests) mount regardless of whether the loader is on screen.
    assert.ok(APP.indexOf('<GameProvider>') < APP.indexOf('<AppRoutes />'))
    assert.match(APP, /const accountDataReady = authReady && !signingIn/)
    assert.match(APP, /accountDataReady=\{accountDataReady\}/)
  })
  test('the loader mounts when the request starts, not when it finishes', () => {
    // signingIn flips before the network call, so the two run in parallel.
    const ctx = read('src/context/GameContext.jsx')
    const loginBody = ctx.slice(ctx.indexOf('const login = useCallback'), ctx.indexOf('const logout = useCallback'))
    assert.ok(loginBody.indexOf('setSigningIn(true)') < loginBody.indexOf('signInWithPassword'))
    assert.ok(loginBody.indexOf('setSigningIn(true)') < loginBody.indexOf('signUp'))
  })
  test('login fires the request before awaiting anything animation-related', () => {
    assert.match(LOGIN, /The request starts NOW/)
    assert.doesNotMatch(LOGIN, /const minMs = 800/)   // the old blocking floor is gone
  })
})

describe('5–6. the reveal waits for whichever finishes last', () => {
  test('data early → still held until the minimum has played', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: false, skipped: false }), false)
  })
  test('animation early → still held until the data is ready', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: false, minimumDone: true, skipped: false }), false)
  })
  test('both done → reveal', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: true, skipped: false }), true)
  })
  test('neither done → no reveal', () => {
    assert.equal(shouldRevealAccount({}), false)
  })
  test('the waiting state keeps the awake pet and says so', () => {
    assert.equal(wakeFrameForPhase('waitingForAccount'), 3)
    assert.equal(WAKE_PHASE_MESSAGES.waitingForAccount, 'Finishing your setup…')
  })
  test('the component derives minimumDone from the waiting phase', () => {
    assert.match(LOADER, /const minimumDone = phase === 'waitingForAccount'/)
    assert.match(LOADER, /shouldRevealAccount\(\{ accountDataReady, minimumDone, skipped, error \}\)/)
  })
})

describe('7–8. Skip drops the duration requirement, from any stage', () => {
  test('skip reveals as soon as the data is ready', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: false, skipped: true }), true)
  })
  test('skip before the data lands does not reveal early (never a blank account)', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: false, minimumDone: false, skipped: true }), false)
  })
  test('skip works from every animation stage — it is phase-independent', () => {
    for (const phase of [...WAKE_PHASES, ...WAKE_TERMINAL_PHASES]) {
      const minimumDone = phase === 'waitingForAccount'
      assert.equal(
        shouldRevealAccount({ accountDataReady: true, minimumDone, skipped: true, error: false }),
        true, `skip failed from ${phase}`)
    }
  })
  test('pressing skip more than once is harmless', () => {
    // The state setter is idempotent and onSkip only fires on the first press.
    assert.match(LOADER, /if \(!prev\) skipCbRef\.current\?\.\(\)/)
    assert.match(LOADER, /const firedRef\s+= useRef\(false\)/)   // onComplete is a one-shot
  })
  test('skip stops further frame changes', () => {
    assert.match(LOADER, /setPhase\('skipped'\)/)
    // …and the minimum-reached timer must not clobber the skipped state.
    assert.match(LOADER, /setPhase\(p => \(p === 'skipped' \? p : 'waitingForAccount'\)\)/)
  })
  test('no artificial delay is introduced after skipping', () => {
    assert.doesNotMatch(LOADER, /setTimeout[^)]*skip/i)
  })
})

describe('9–10. the Skip control is usable and accessible', () => {
  test('it is a real button with the required accessible label', () => {
    assert.match(LOADER, /type="button"/)
    assert.match(LOADER, /aria-label="Skip pet wake-up animation"/)
    assert.match(LOADER, /Skip animation →/)
  })
  test('a real <button> gives keyboard (Enter/Space) and touch support for free', () => {
    assert.match(LOADER, /<button\s/)
    assert.doesNotMatch(LOADER, /onMouseOver=\{handleSkip\}/)
    assert.match(LOADER, /minHeight: 40/)          // comfortable touch target
  })
  test('it has a visible keyboard focus state', () => {
    // The global rule paints a gold ring on any focused interactive element.
    assert.match(CSS, /:focus-visible \{\s*\n\s*outline: 2px solid rgba\(var\(--gold-rgb\), 0\.9\)/)
  })
  test('it uses the existing secondary button styling, not the primary CTA', () => {
    assert.match(LOADER, /className="btn-ghost/)
    assert.ok(CSS.includes('.btn-ghost'))
  })
  test('it is never hidden behind hover, a menu, or a tiny icon', () => {
    assert.doesNotMatch(LOADER, /group-hover|title="Skip|opacity-0/)
    assert.match(LOADER, /\{showSkip && !error && \(/)   // only suppressed on error
  })
  test('it stays visible while the account request is still loading', () => {
    // Its rendering depends on showSkip/error only — never on accountDataReady.
    const btn = LOADER.slice(LOADER.indexOf('{showSkip && !error && ('), LOADER.indexOf('</button>'))
    assert.doesNotMatch(btn, /accountDataReady/)
  })
  test('the inline quest-check variant has nothing to gate, so no Skip', () => {
    assert.match(LOADER, /showMessage=\{false\} showSkip=\{false\}/)
  })
})

describe('11. the sequence restarts on every new loading instance', () => {
  test('the effect re-runs on restartToken (and therefore on mount)', () => {
    assert.match(LOADER, /\}, \[restartToken, petId, error\]\)/)
  })
  test('App issues one token per loading instance', () => {
    assert.match(APP, /if \(gated && !wasGated\.current\) setLoadId\(n => n \+ 1\)/)
    assert.match(APP, /restartToken=\{loadId\}/)
  })
  test('the token does not change while the loader is up', () => {
    // Keying it off the account id would restart the animation the moment the
    // profile lands, mid-sequence.
    assert.doesNotMatch(APP, /restartToken=\{accountId/)
    assert.match(APP, /It must NOT change while the loader is up/)
  })
  test('the one-shot reveal guard is re-armed on each run', () => {
    assert.match(LOADER, /firedRef\.current = false\s*\n\s*setSkip\(false\)/)
  })
})

describe('12. timers are cleaned up on unmount, restart and skip', () => {
  test('every timeout is cleared in the effect cleanup', () => {
    assert.match(LOADER, /return \(\) => timers\.forEach\(clearTimeout\)/)
  })
  test('the tip rotator clears its interval too', () => {
    assert.match(LOADER, /return \(\) => clearInterval\(id\)/)
  })
  test('a stale timer cannot reveal a previous account', () => {
    // onComplete goes through a ref + one-shot guard, re-armed per run.
    assert.match(LOADER, /if \(firedRef\.current\) return/)
    assert.match(LOADER, /completeRef\.current\?\.\(\)/)
  })
  test('revealing is idempotent at the App level too', () => {
    // setRevealedFor stores the account id; a repeat call is the same write.
    assert.match(APP, /onComplete=\{\(\) => setRevealedFor\(accountId \|\| 'none'\)\}/)
  })
})

describe('13. errors never trap the participant behind the animation', () => {
  test('the reveal rule refuses to fire on error', () => {
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: true, skipped: true, error: true }), false)
    assert.equal(shouldRevealAccount({ accountDataReady: true, minimumDone: true, error: true }), false)
  })
  test('an error stops the sequence instead of running timers', () => {
    assert.match(LOADER, /if \(error\) return\n/)
    assert.match(LOADER, /const shownPhase = error \? 'error' : phase/)
  })
  test('a failed sign-in drops the gate immediately', () => {
    assert.match(LOGIN, /const fail = \(msg, toast = msg\) => \{/)
    assert.match(LOGIN, /return fail\(error === 'Invalid login credentials' \? 'Invalid email or password' : error,/)
    // GameContext clears signingIn on every failure path, which ungates the app.
    const ctx = read('src/context/GameContext.jsx')
    assert.equal((ctx.match(/setSigningIn\(false\)/g) || []).length >= 4, true)
  })
  test('the login form stays mounted through a failed sign-in, keeping its values', () => {
    // Routes keep rendering while a sign-in has produced no account yet — the
    // login page must not be unmounted, or the typed email would be lost.
    assert.match(APP, /const showRoutes = authReady && \(!gated \|\| !accountId\)/)
  })
  test('the email-confirmation path also exits the overlay', () => {
    assert.match(LOGIN, /setTab\('login'\); setLoading\(false\); return/)
  })
  test('existing retry behaviour is intact — the form keeps its values', () => {
    assert.match(LOGIN, /Keep typed values/)
    assert.doesNotMatch(LOGIN, /setEmail\(''\)/)
  })
})

describe('14. the frames are the real PetQuest mascots, not substitutes', () => {
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
      assert.ok(vivid > 60, `${f}: only ${vivid} vivid colours — the cyan wisps are gone`)
    }
  })

  test('the 12 original evolution assets are untouched', () => {
    for (const pet of PETS) {
      for (let lvl = 1; lvl <= 4; lvl++) assert.ok(existsSync(abs(spriteFor(pet, lvl))))
    }
  })

  test('the authenticated pet is used; random only when it is unavailable', () => {
    assert.deepEqual(resolveWakePet('wolf'), { id: 'wolf', random: false })
    assert.deepEqual(resolveWakePet('mystic_cat'), { id: 'cat', random: false })
    assert.equal(petIdOf('arcane_dragon'), 'dragon')
    for (const known of ['dragon', 'cat', 'wolf', 'spirit_wolf']) {
      assert.equal(resolveWakePet(known, () => 0.99).random, false)
    }
    assert.equal(resolveWakePet(null, () => 0).id, 'dragon')
    assert.equal(resolveWakePet(undefined, () => 0.5).id, 'cat')
    assert.equal(resolveWakePet(null, () => 0.99).random, true)
    for (let i = 0; i < 50; i++) assert.ok(PETS.includes(resolveWakePet(null, () => i / 50).id))
  })

  test('the pet is locked for the whole animation (no mid-sequence swap)', () => {
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

describe('15. the old yellow pulsing circle is gone from account loading', () => {
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
  test('the account-loading view renders the mascot instead', () => {
    assert.match(APP, /<MascotWakeScreen/)
    // The login page no longer owns a loader of its own — one gate, one animation.
    assert.doesNotMatch(LOGIN, /MascotWake/)
  })
  test('unrelated loaders are left alone', () => {
    assert.match(LOGIN, /⚙️/)                                       // submit-button spinner
    assert.match(read('src/components/VerificationModal.jsx'), /GildedWaypoints/)
    assert.match(read('src/pages/AdminPage.jsx'), /⚙️/)
    assert.match(read('src/pages/LeaderboardPage.jsx'), /⚙️/)
  })
})

describe('16. layout: mobile widths, no shift, no horizontal scroll', () => {
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
  test('the caption is width-capped so long messages wrap instead of scrolling', () => {
    assert.match(LOADER, /maxWidth: 320/)
    assert.ok(WAKE_PETS.cat.waking.length > 30)   // the longest caption
  })
  test('no text glyph is overlaid on the mascot (the art carries its own Zzz)', () => {
    assert.doesNotMatch(LOADER, /fontSize: Math\.round\(size \* 0\.17\)/)
  })
})

describe('17. reduced motion', () => {
  test('the mandatory sequence still runs — only the movement is dropped', () => {
    // The timers do NOT depend on reduceMotion: every state is still shown for
    // its readable minimum, as required.
    assert.doesNotMatch(LOADER, /if \(reduceMotion\) \{ setFrame\(3\); return \}/)
    assert.match(LOADER, /\}, \[restartToken, petId, error\]\)/)
  })
  test('no pulsing or repeating effects when motion is reduced', () => {
    assert.match(LOADER, /reduceMotion\s*\n?\s*\? \{ opacity: awake \? 0\.6 : 0\.3 \}/)
    assert.match(LOADER, /animate=\{reduceMotion \|\| !awake \? \{ scale: 1 \}/)
    assert.match(LOADER, /transition=\{reduceMotion \? \{ duration: 0 \}/)
  })
  test('the rotating tip stops rotating when motion is reduced', () => {
    assert.match(LOADER, /if \(reduceMotion\) return\s*\/\/ no rotating text/)
  })
  test('the Skip button stays fully available', () => {
    const btn = LOADER.slice(LOADER.indexOf('{showSkip && !error && ('), LOADER.indexOf('</button>'))
    assert.doesNotMatch(btn, /reduceMotion/)
  })
})

describe('18. captions and accessibility', () => {
  test('each phase has its specified message', () => {
    assert.equal(wakeMessageFor('dragon', 'sleeping'), 'Your pet is resting…')
    assert.equal(wakeMessageFor('dragon', 'waking'), 'Waking your Dragon…')
    assert.equal(wakeMessageFor('cat', 'waking'), 'The Mystic Cat is stretching awake…')
    assert.equal(wakeMessageFor('wolf', 'waking'), 'The Spirit Wolf is listening…')
    assert.equal(wakeMessageFor('wolf', 'personalityAction'), 'Getting ready for your quests…')
    assert.equal(wakeMessageFor('wolf', 'awake'), 'Finishing your setup…')
    assert.equal(wakeMessageFor('wolf', 'waitingForAccount'), 'Finishing your setup…')
  })
  test('an unknown or randomly-picked companion uses the neutral fallback', () => {
    assert.equal(wakeMessageFor(null, 'waking'), WAKE_FALLBACK_MESSAGE)
    assert.equal(wakeMessageFor('dragon', 'waking', false), WAKE_FALLBACK_MESSAGE)
    assert.equal(WAKE_FALLBACK_MESSAGE, 'Preparing your adventure…')
    assert.match(LOADER, /wakeMessageFor\(petId, shownPhase, !isRandomPet\)/)
  })
  test('an accessible live status describes the wait', () => {
    assert.match(LOADER, /role="status" aria-live="polite"/)
    assert.match(LOADER, /Loading your PetQuest account\. Your pet is waking up\./)
    assert.match(LOADER, /className="sr-only"/)
  })
  test('the Skip button sits outside the live region, so it is not re-announced', () => {
    assert.ok(LOADER.indexOf('{/* Skip') > LOADER.indexOf('aria-live="polite"'))
    assert.ok(LOADER.indexOf('{/* Skip') > LOADER.indexOf('{showMessage && ('))
  })
  test('decorative layers are hidden from screen readers', () => {
    assert.match(LOADER, /<motion\.span aria-hidden="true"/)
    assert.match(LOADER, /aria-hidden=\{i === frameIndex \? undefined : 'true'\}/)
    assert.match(LOADER, /alt=\{i === frameIndex \? `\$\{meta\.species\} waking up` : ''\}/)
  })
})

describe('19. missing assets fall back without stalling the sequence', () => {
  test('a failed wake frame shows the static baby sprite, then the emoji', () => {
    assert.match(LOADER, /onError=\{\(\) => setBroken\(true\)\}/)
    assert.match(LOADER, /broken\s*\n?\s*\? <StaticFallback/)
    assert.match(LOADER, /src=\{spriteFor\(petId, 1\)\}/)
    assert.match(LOADER, /\{emoji\}/)
  })
  test('the timing sequence is independent of asset loading', () => {
    // `broken` is not in the sequence effect's deps, so a failed image neither
    // restarts nor halts the phases.
    assert.doesNotMatch(LOADER, /\[restartToken, petId, error, broken\]/)
  })
  test('the static fallback target exists for every companion', () => {
    for (const pet of PETS) assert.ok(existsSync(abs(spriteFor(pet, 1))))
  })
})

describe('20. existing flows are untouched', () => {
  test('login/registration logic is unchanged', () => {
    assert.match(LOGIN, /await login\(email\.trim\(\), password\)/)
    assert.match(LOGIN, /await register\(email\.trim\(\), password, username\.trim\(\)\)/)
    assert.match(LOGIN, /Invalid email or password/)
    assert.match(LOGIN, /Check your email to confirm your account/)
  })
  test('post-login routing is left to the existing route guards', () => {
    // LoginPage used to navigate('/select'); the guard already does exactly that
    // once the gate lifts, and calling it from behind the gate is redundant.
    assert.match(APP, /!hasPet\s+\? <Navigate to="\/select"/)
  })
  test('the route guards are unchanged', () => {
    for (const route of ['/select', '/mode-select', '/dashboard', '/admin']) {
      assert.ok(APP.includes(`path="${route}"`), `route ${route} missing`)
    }
  })
  test('a logged-out visitor is never held behind the animation', () => {
    // authReady with no account → not gated → the login page renders straight away.
    assert.match(APP, /const gated = !accountDataReady \|\| \(!!accountId && revealedFor !== accountId\)/)
  })
  test('each account is gated once — revealing is remembered per account', () => {
    assert.match(APP, /const \[revealedFor, setRevealedFor\] = useState\(null\)/)
    assert.match(APP, /revealedFor !== accountId/)
  })
  test('the dashboard is not mounted behind the loader', () => {
    // Its evolution celebration auto-dismisses after 9s; running it behind a
    // loading screen would burn it unseen.
    assert.match(APP, /\{showRoutes && <Routes>/)
    assert.match(read('src/components/animations/EvolutionOverlay.jsx'), /setTimeout\(\(\) => onDone\?\.\(\), 9000\)/)
  })
  test('quest verification and the validity check still have their own loaders', () => {
    assert.match(read('src/components/TaskList.jsx'), /MascotLoaderCompact/)
    assert.match(LOADER, /export function MascotLoaderCompact/)   // shared, not duplicated
  })
})
