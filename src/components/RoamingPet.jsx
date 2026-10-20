import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useCompanion } from '../context/CompanionContext'
import useReducedMotion from '../hooks/useReducedMotion'
import PetSprite from './PetSprite'
import { FRAME_FILES } from '../../apps/mobile/src/data/spriteModel.ts'
import { ACCESSORIES } from '../data/accessories'
import {
  leaveLine, returnLine, patLine, lineForSpot, planWalk, nextWalkDelay, standPoint, stepToward,
} from '../data/petCompanion'

/*
 * The companion, out of its home and walking over the page.
 *
 * It lives in a fixed layer above the whole app, so it keeps working across the
 * dashboard, accessories and leaderboard pages, and it never blocks a click (the
 * layer ignores the pointer; only the pet itself takes it). Things on a page opt
 * in with data-pet-spot="<id>"; the pet walks to the top edge of that element,
 * lights it up and says something about it.
 *
 * A walk is: say it is leaving → poof → walk to each spot → walk home → poof.
 * On the dashboard home is the painted room (data-pet-home), whose own pet hides
 * while this one is out. On other pages home is a corner of the screen.
 *
 * Positions are written straight to the element every frame; React state only
 * changes for the sprite frame, the bubble and the poof.
 */

const ROUTES = ['/dashboard', '/accessories', '/leaderboard']
const SPEED = 0.2          // px per ms while walking
const LEAVE_MS = 1900      // how long it announces the walk before it goes
const VISIT_MS = 3400      // how long it stays at each spot
const ARRIVE_MS = 1300

const frameSrc = (petId, key) => `/sprites/${petId}/${FRAME_FILES[key].replace('.png', '.webp')}`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const spotEl = (id) => document.querySelector(`[data-pet-spot="${id}"]`)
const presentSpots = () => [...new Set([...document.querySelectorAll('[data-pet-spot]')].map(e => e.dataset.petSpot))]
const quietNow = () => !!document.querySelector('[data-pet-quiet], [role="dialog"]')
const clearGlow = () => document.querySelectorAll('.pet-spot-glow').forEach(e => e.classList.remove('pet-spot-glow'))

function homePoint(px) {
  const room = document.querySelector('[data-pet-home]')
  if (room) {
    const r = room.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.82, inRoom: true }
  }
  return { x: window.innerWidth - px / 2 - 16, y: window.innerHeight - 16, inRoom: false }
}

/** Where the room's own pet stands right now, so the overlay pet appears exactly there. */
function roomPetPoint() {
  const s = document.querySelector('[data-pet-sprite]')
  if (!s) return null
  const r = s.getBoundingClientRect()
  return r.width ? { x: r.left + r.width / 2, y: r.bottom, w: r.width } : null
}

function Pet({ onDashboard }) {
  const { selectedPet, petLevel, tasks, points, currentStreak, petStats, equippedAccessories } = useGame()
  const comp = useCompanion()
  const reduce = useReducedMotion()
  const petId = selectedPet?.id
  const baby = petLevel <= 1

  const [ui, setUi] = useState({ shown: false, frame: 'idle', flip: 1, bubble: '', poof: null, hearts: 0, px: 72 })
  const uiRef = useRef(ui)
  const patch = (p) => {
    const next = { ...uiRef.current, ...p }
    if (Object.keys(p).every(k => uiRef.current[k] === p[k])) return
    uiRef.current = next
    setUi(next)
  }

  const elRef = useRef(null)
  const st = useRef({ phase: 'home', x: 0, y: 0, px: 72, queue: [], stop: null, hold: false, recent: [], until: 0, pause: 0, scrolled: false, frac: 0.5, nextAuto: 0, reactUntil: 0, tick: 0, tickAt: 0, dx: 1 })

  // Latest values for the long-lived loop, without restarting it on every render.
  const live = useRef({})
  live.current = {
    facts: {
      activeQuests: tasks.filter(t => !t.completed).length, points, streak: currentStreak,
      hunger: petStats.hunger, cleanliness: petStats.cleanliness, happiness: petStats.happiness,
    },
    dnd: comp.dnd, guideOpen: comp.guideOpen, setAway: comp.setAway,
  }

  useEffect(() => {
    const s = st.current
    let raf = 0

    const place = () => {
      const el = elRef.current
      if (!el) return
      el.style.transform = `translate(${s.x - s.px / 2}px, ${s.y - s.px}px)`
      const half = 112
      const shift = Math.max(0, half + 8 - s.x) - Math.max(0, s.x + half + 8 - window.innerWidth)
      el.style.setProperty('--bshift', `${shift}px`)
    }

    const startWalk = (plan, hold = false) => {
      if (s.phase !== 'home' || reduce) return false
      const from = (onDashboard && roomPetPoint()) || homePoint(s.px)
      s.px = clamp(from.w || (window.innerWidth < 640 ? 56 : 72), 52, 96)
      s.x = from.x; s.y = from.y
      s.queue = plan.slice(); s.hold = hold; s.stop = null
      s.phase = 'leaving'; s.until = performance.now() + LEAVE_MS
      if (onDashboard) live.current.setAway(true)
      patch({ shown: true, px: s.px, frame: 'interact', bubble: leaveLine() })
      place()
      return true
    }

    const nextStop = () => {
      const stop = s.queue.shift()
      s.stop = stop || null
      s.scrolled = false; s.pause = 0; s.frac = 0.25 + Math.random() * 0.5
      if (stop) { s.phase = 'walk'; patch({ bubble: '' }) }
      else if (s.hold) { s.phase = 'hold' }
      else { s.phase = 'return'; patch({ bubble: '' }) }
    }

    const goHome = () => {
      clearGlow(); s.queue = []; s.hold = false; s.stop = null
      if (s.phase !== 'home') { s.phase = 'return'; patch({ bubble: '' }) }
    }

    const makePlan = () => planWalk(presentSpots(), Math.random, s.recent).map(id => ({ id }))

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(64, now - (s.last || now)); s.last = now
      if (now - s.tickAt > 130) { s.tick++; s.tickAt = now }
      const reacting = now < s.reactUntil

      switch (s.phase) {
        case 'home': {
          if (!onDashboard) {
            const d = homePoint(s.px); s.x = d.x; s.y = d.y
            patch({ shown: !live.current.dnd, frame: reacting ? 'happy' : (Math.floor(now / 2600) % 3 === 2 ? 'blink' : 'idle') })
            place()
          }
          if (!s.nextAuto) s.nextAuto = now + nextWalkDelay()
          if (now >= s.nextAuto) {
            s.nextAuto = now + nextWalkDelay()
            if (!live.current.dnd && !live.current.guideOpen && !reduce && document.visibilityState === 'visible' && !quietNow()) {
              const plan = makePlan(); if (plan.length) startWalk(plan)
            }
          }
          break
        }
        case 'leaving': {
          patch({ frame: reacting ? 'happy' : 'interact' }); place()
          if (now >= s.until) { patch({ poof: { x: s.x, y: s.y, id: now }, bubble: '' }); nextStop() }
          break
        }
        case 'walk': {
          const el = s.stop && spotEl(s.stop.id)
          if (!el) { nextStop(); break }
          const r = el.getBoundingClientRect()
          if ((r.top < 90 || r.top > window.innerHeight * 0.5) && !s.scrolled) {
            el.style.scrollMarginTop = '104px'
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            s.scrolled = true; s.pause = now + 800
          }
          if (now < s.pause || reacting) { patch({ frame: reacting ? 'happy' : 'idle' }); place(); break }
          const target = standPoint(r, window.innerWidth, window.innerHeight, s.px, s.frac)
          const step = stepToward(s, target, SPEED, dt)
          s.x = step.x; s.y = step.y
          if (Math.abs(step.dx) > 1) s.dx = step.dx
          if (step.arrived) {
            s.phase = 'visit'; s.until = now + VISIT_MS
            el.classList.add('pet-spot-glow')
            patch({ frame: 'interact', bubble: s.stop.line || lineForSpot(s.stop.id, live.current.facts) })
          } else {
            patch({ frame: s.dx < 0 ? (s.tick % 2 ? 'walkLeftB' : 'walkLeftA') : (s.tick % 2 ? 'walkRightB' : 'walkRightA'), flip: s.dx < 0 ? -1 : 1 })
          }
          place()
          if (quietNow() && !s.hold) goHome()
          break
        }
        case 'visit': {
          const el = s.stop && spotEl(s.stop.id)
          if (el) { const t = standPoint(el.getBoundingClientRect(), window.innerWidth, window.innerHeight, s.px, s.frac); s.x = t.x; s.y = t.y }
          patch({ frame: reacting ? 'happy' : 'interact' }); place()
          if (quietNow() && !s.hold) { goHome(); break }
          if (!s.hold && now >= s.until) {
            clearGlow()
            if (s.stop) s.recent = [...s.recent, s.stop.id].slice(-4)
            nextStop()
          }
          break
        }
        case 'hold': {
          const el = s.stop && spotEl(s.stop.id)
          if (el) { const t = standPoint(el.getBoundingClientRect(), window.innerWidth, window.innerHeight, s.px, s.frac); s.x = t.x; s.y = t.y }
          patch({ frame: reacting ? 'happy' : 'interact' }); place()
          break
        }
        case 'return': {
          const target = homePoint(s.px)
          if (reacting) { place(); break }
          const step = stepToward(s, target, SPEED, dt)
          s.x = step.x; s.y = step.y
          if (Math.abs(step.dx) > 1) s.dx = step.dx
          if (step.arrived) {
            s.phase = 'arriving'; s.until = now + ARRIVE_MS
            patch({ frame: 'happy', bubble: returnLine() })
          } else {
            patch({ frame: s.dx < 0 ? (s.tick % 2 ? 'walkLeftB' : 'walkLeftA') : (s.tick % 2 ? 'walkRightB' : 'walkRightA'), flip: s.dx < 0 ? -1 : 1 })
          }
          place()
          break
        }
        case 'arriving': {
          place()
          if (now >= s.until) {
            patch({ poof: { x: s.x, y: s.y, id: now }, bubble: '', shown: !onDashboard, frame: 'idle' })
            live.current.setAway(false)
            s.phase = 'home'; s.nextAuto = now + nextWalkDelay()
          }
          break
        }
        default: break
      }
    }

    comp.register({
      walk: () => { const plan = makePlan(); if (plan.length) startWalk(plan) },
      guideTo: (spot, line) => {
        const el = spotEl(spot)
        if (reduce) {            // no walking: light the spot up and let the panel speak
          clearGlow(); el?.classList.add('pet-spot-glow')
          if (el) { el.style.scrollMarginTop = '104px'; el.scrollIntoView({ behavior: 'auto', block: 'start' }) }
          return
        }
        if (s.phase === 'home') { startWalk([{ id: spot, line }], true); return }
        s.hold = true; s.queue = [{ id: spot, line }]
        clearGlow(); nextStop(); s.hold = true
      },
      guideHome: () => { clearGlow(); goHome() },
    })

    place()
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearGlow()
      comp.register(null)
      live.current.setAway(false)
    }
    // The loop is rebuilt only when what it depends on changes (route kind, motion preference).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDashboard, reduce, petId])

  const react = () => {
    const s = st.current
    s.reactUntil = performance.now() + 1500
    patch({ frame: 'happy', bubble: patLine(), hearts: uiRef.current.hearts + 1 })
    setTimeout(() => { if (uiRef.current.hearts) patch({ bubble: s.phase === 'home' ? '' : uiRef.current.bubble }) }, 1500)
  }

  // Warm the cache so the first walk does not flicker.
  useEffect(() => {
    if (baby && petId) Object.keys(FRAME_FILES).forEach(k => { new Image().src = frameSrc(petId, k) })
  }, [baby, petId])

  if (!petId) return null
  const equipped = Object.values(equippedAccessories || {}).map(id => ACCESSORIES.find(a => a.id === id)).filter(Boolean)

  return (
    <div aria-live="off" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
      {ui.poof && <span key={ui.poof.id} className="pet-poof" style={{ left: ui.poof.x, top: ui.poof.y }} aria-hidden="true" />}
      <div ref={elRef} style={{ position: 'absolute', left: 0, top: 0, width: ui.px, height: ui.px, display: ui.shown ? 'block' : 'none', willChange: 'transform' }}>
        <div style={{
          position: 'absolute', left: '50%', bottom: '88%', transform: 'translateX(calc(-50% + var(--bshift, 0px)))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none',
        }}>
          {ui.bubble && (
            <span role="status" style={{
              width: 'max-content', maxWidth: 224, textAlign: 'center', padding: '6px 12px', borderRadius: 14,
              background: '#FFFFFF', color: '#102A43', border: '1px solid #E1E7E3', boxShadow: '0 4px 14px rgba(16,42,67,0.14)',
              font: '700 13px/1.35 Nunito, system-ui, sans-serif',
            }}>{ui.bubble}</span>
          )}
          {equipped.length > 0 && (
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(16,42,67,0.35))' }}>
              {equipped.map(a => a.displayEmoji).join(' ')}
            </span>
          )}
        </div>
        {ui.hearts > 0 && <span key={ui.hearts} className="pet-heart" aria-hidden="true">💗</span>}
        <button type="button" onClick={react} aria-label={`${selectedPet?.name}. Say hi`}
          style={{ pointerEvents: 'auto', width: '100%', height: '100%', padding: 0, border: 0, background: 'none', cursor: 'pointer', filter: 'drop-shadow(0 4px 3px rgba(16,42,67,0.22))' }}>
          {baby ? (
            <img src={frameSrc(petId, ui.frame)}
              alt="" draggable="false" style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
          ) : (
            <div style={{ transform: `scaleX(${ui.flip})` }}>
              <PetSprite petId={petId} level={petLevel} size="100%" style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', display: 'block' }} />
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

export default function RoamingPet() {
  const { pathname } = useLocation()
  if (!ROUTES.includes(pathname)) return null
  // Keyed by route kind so moving between pages starts the pet fresh at that page's home.
  return <Pet key={pathname} onDashboard={pathname === '/dashboard'} />
}
