import { useEffect, useRef, useState } from 'react'
import useReducedMotion from '../hooks/useReducedMotion'
import PetSprite from './PetSprite'
import { useCompanion } from '../context/CompanionContext'
// The walker's brain is the phone app's pure model, so habits (bed, food bowl,
// moods) are written once and both clients behave the same.
import {
  nextStep, applyStep, startPoint, frameFor, fpsFor, reactionStep, FRAME_FILES, REACTION_TEXT,
} from '../../apps/mobile/src/data/spriteModel.ts'
import { rawMood } from '../../apps/mobile/src/data/moodModel.ts'
import { HOME_FOR_PET, FALLBACK_HOME, PET_HOMES } from '../../apps/mobile/src/data/petHomeModel.ts'

/* Dashboard care actions → the model's reactions ('sad' has none). */
const REACTION = { feed: 'feed', shower: 'wash', play: 'play' }

const isWalk = s => s === 'walkLeft' || s === 'walkRight'
const frameSrc = (petId, key) => `/sprites/${petId}/${FRAME_FILES[key].replace('.png', '.webp')}`
/* Further back (smaller y) = smaller, for a little depth. */
const depthScale = y => 0.7 + 0.3 * Math.min(1, Math.max(0, (y - 0.6) / 0.3))

/*
 * The companion's painted home with the pet wandering it. Baby pets walk with
 * their sprite-sheet frames; older stages have no walk frames yet, so their
 * evolution art moves around instead.
 */
export default function PetRoom({ pet, level = 1, stats, careAction = null, accessories = [], home: isHome = false, className = '', style }) {
  const reduceMotion = useReducedMotion()
  // While the roaming pet is out walking the page, its room is empty.
  const { away } = useCompanion()
  const out = isHome && away
  const petId = pet?.id
  const homeId = HOME_FOR_PET[petId] ?? FALLBACK_HOME
  const home = PET_HOMES[homeId]
  const walking = level <= 1 && !!petId

  const [m, setM] = useState(() => ({ state: 'idle', at: startPoint(homeId) }))
  const [moveMs, setMoveMs] = useState(0)
  const [tick, setTick] = useState(0)
  const [bubble, setBubble] = useState(null)
  const machine = useRef(m)
  const walk = useRef(null)
  const timer = useRef(null)
  const ctx = useRef({})
  ctx.current = { mood: rawMood(stats), petId }

  // Run one step, then schedule the next when it finishes.
  const run = (step) => {
    clearTimeout(timer.current)
    const from = machine.current.at
    walk.current = isWalk(step.state) ? { from, to: step.to, start: Date.now(), ms: step.durationMs } : null
    setMoveMs(isWalk(step.state) ? step.durationMs : 0)
    machine.current = applyStep(machine.current, step)
    setM(machine.current)
    timer.current = setTimeout(() => {
      setBubble(null)
      run(nextStep(machine.current, homeId, Math.random, reduceMotion, ctx.current))
    }, step.durationMs)
  }

  // Start (and restart on a new home) from the middle of the floor.
  useEffect(() => {
    machine.current = { state: 'idle', at: startPoint(homeId) }
    run({ state: 'idle', durationMs: 800, to: machine.current.at })
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, reduceMotion])

  // A care action interrupts: stop where the feet are now, then react.
  useEffect(() => {
    const r = REACTION[careAction]
    if (!r) return
    const w = walk.current
    let at = machine.current.at
    if (w) {
      const t = Math.min(1, (Date.now() - w.start) / w.ms)
      at = { x: w.from.x + (w.to.x - w.from.x) * t, y: w.from.y + (w.to.y - w.from.y) * t }
    }
    machine.current = { state: 'idle', at }
    setBubble(REACTION_TEXT[r])
    run(reactionStep(r, at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careAction])

  // Frame ticker at the state's cadence (10 fps walking, 2 fps otherwise).
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000 / fpsFor(m.state))
    return () => clearInterval(id)
  }, [m.state])

  // Warm the cache so the first walk doesn't flicker.
  useEffect(() => {
    if (walking) Object.keys(FRAME_FILES).forEach(k => { new Image().src = frameSrc(petId, k) })
  }, [walking, petId])

  const scale = depthScale(m.at.y)
  const flip = !walking && m.state === 'walkLeft' ? -1 : 1

  return (
    <div
      role="img"
      data-pet-home={isHome ? '' : undefined}
      aria-label={`${pet?.name ?? 'Your companion'} in the ${home.displayName}${accessories.length ? `, wearing ${accessories.map(a => a.name).join(', ')}` : ''}`}
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio: '4 / 3', borderRadius: 12,
        background: `${home.palette.background} url(/homes/${homeId}.webp) center / cover no-repeat`,
        ...style,
      }}
    >
      <div
        className="absolute"
        data-pet-sprite={isHome ? '' : undefined}
        style={{
          visibility: out ? 'hidden' : 'visible',
          left: `${m.at.x * 100}%`, top: `${m.at.y * 100}%`, width: '20%',
          transform: `translate(-50%, -100%) scale(${scale})`, transformOrigin: 'bottom center',
          transition: `left ${moveMs}ms linear, top ${moveMs}ms linear, transform ${moveMs}ms linear`,
        }}
      >
        {/* Above the head: the reaction bubble, then what the pet is wearing (follows it as it walks). */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[85%] flex flex-col items-center gap-0.5 pointer-events-none">
          {bubble && (
            <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-nunito font-bold"
              style={{ background: '#FFFFFF', color: '#102A43', boxShadow: '0 1px 3px rgba(16,42,67,0.2)' }}>
              {bubble}
            </span>
          )}
          {accessories.length > 0 && (
            <span aria-hidden="true" className="whitespace-nowrap leading-none" style={{ fontSize: 'clamp(12px, 1.4vw, 18px)', filter: 'drop-shadow(0 1px 1px rgba(16,42,67,0.35))' }}>
              {accessories.map(a => a.displayEmoji).join(' ')}
            </span>
          )}
        </div>
        {walking ? (
          <img src={frameSrc(petId, frameFor(m.state, tick, petId))} alt="" draggable="false"
            style={{ width: '100%', aspectRatio: '1 / 1', display: 'block', imageRendering: 'pixelated' }} />
        ) : (
          <div style={{ transform: `scaleX(${flip})` }}>
            <PetSprite petId={petId} level={level} size="100%" style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', display: 'block' }} />
          </div>
        )}
      </div>
    </div>
  )
}
