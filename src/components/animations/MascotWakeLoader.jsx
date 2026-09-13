import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  wakeFramesFor, wakeMessageFor, resolveWakePet, petIdOf, petMeta, spriteFor,
  WAKE_SEQUENCE, WAKE_TIMINGS, WAKE_PETS, WAKE_FALLBACK_MESSAGE,
} from '../../config/pets'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Mascot wake-up loader — the account-loading animation.
 *
 * Replaces the old gold "portal" pulsing circle. The user's real PetQuest
 * companion sleeps, stirs, does its own flourish (dragon spark / cat stretch /
 * wolf head-raise) and settles into an awake idle that holds for as long as
 * loading takes. Frames are the supplied wake sheets split into four PNGs —
 * see wakeFramesFor() in src/config/pets.js.
 *
 * Props
 *   petType       app id (dragon/cat/wolf) or assetType; omit when unknown and
 *                 a companion is picked at random for this loading instance
 *   evolutionStage  stage key or 1–5 level (baby art is used for every stage)
 *   message       caption override; defaults to the pet's own line, or the
 *                 neutral fallback when the companion was picked at random
 *   size          rendered square size in CSS px (88–128 is the mobile range)
 *   showMessage   render the caption under the mascot
 *   restartToken  change it to replay the sequence from the sleeping frame
 *
 * Behaviour notes:
 *   • Every mount restarts at the sleeping frame, and so does every new
 *     restartToken — there is no "already awake" carry-over between loads.
 *   • The companion is LOCKED for the whole sequence: if the profile resolves
 *     mid-animation the pet never swaps out from under the user. A new instance
 *     re-picks, and only re-randomises while the real pet is still unknown.
 *   • All four frames are rendered and cross-faded, so switching a frame never
 *     waits on a decode (no flash), and the box is a fixed square, so the
 *     mascot cannot shift the layout or cause horizontal scrolling.
 *   • Reduced motion: the awake frame shows immediately, captions stay.
 */

const A11Y_STATUS = 'Loading your PetQuest account. Your pet is waking up.'

export default function MascotWakeLoader({
  petType,
  evolutionStage = 'baby',
  message,
  size = 112,
  showMessage = true,
  restartToken = 0,
}) {
  const reduceMotion = useReducedMotion()

  /* ── Lock the companion for this loading instance ──
     Re-picked only when restartToken changes, so a late-arriving profile can
     never swap the pet mid-animation. */
  const lockRef  = useRef(null)
  const tokenRef = useRef(restartToken)
  if (lockRef.current === null || tokenRef.current !== restartToken) {
    tokenRef.current = restartToken
    // Once the real pet is known, later instances stop randomising.
    lockRef.current = resolveWakePet(petType)
  }
  const { id: petId, random: isRandomPet } = lockRef.current

  /* ── Frame sequence ── */
  const [frame, setFrame] = useState(reduceMotion ? 3 : 0)
  const [broken, setBroken] = useState(false)   // a wake frame failed to load

  useEffect(() => {
    if (reduceMotion) { setFrame(3); return }   // straight to awake, no timers
    setFrame(0)                                 // every (re)start begins asleep
    const timers = []
    let elapsed = 0
    for (let i = 1; i < WAKE_SEQUENCE.length; i++) {
      elapsed += WAKE_TIMINGS[WAKE_SEQUENCE[i - 1]]
      timers.push(setTimeout(() => setFrame(i), elapsed))
    }
    return () => timers.forEach(clearTimeout)   // cleaned up on unmount/restart
  }, [restartToken, petId, reduceMotion])

  /* Reset the broken-asset flag when the pet changes, so one missing file
     doesn't permanently pin every later companion to the static fallback. */
  useEffect(() => { setBroken(false) }, [petId])

  const frames  = wakeFramesFor(petId, evolutionStage)
  const meta    = petMeta(petId)
  const accent  = WAKE_PETS[petIdOf(petId)].accent
  /* The pet's own line only when it IS the user's pet; a randomly picked
     stand-in gets the neutral fallback rather than claiming a dragon they
     may not own. An explicit `message` always wins. */
  const caption = message ?? (isRandomPet ? WAKE_FALLBACK_MESSAGE : wakeMessageFor(petId))
  const awake   = frame === 3

  return (
    <div className="flex flex-col items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">{A11Y_STATUS}</span>

      <div className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size }}>
        {/* Glow — dim while asleep, brightening as the companion wakes. */}
        <motion.span aria-hidden="true" className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 0.9, height: size * 0.9,
            background: `radial-gradient(circle, ${accent}59 0%, transparent 70%)`,
            filter: `blur(${Math.round(size * 0.09)}px)`,
          }}
          animate={reduceMotion
            ? { opacity: 0.6 }
            : awake ? { opacity: [0.5, 0.85, 0.5], scale: [1, 1.1, 1] } : { opacity: 0.28, scale: 1 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />

        {/* The mascot. All four frames are mounted (preloaded) and cross-faded;
            on a load failure the static baby sprite — then the emoji — stands in. */}
        <motion.div className="relative z-10" style={{ width: size, height: size }}
          animate={reduceMotion || !awake ? { scale: 1 } : { scale: [1, 1.03, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
          {broken
            ? <StaticFallback petId={petId} emoji={meta.emoji} size={size} />
            : frames.map((src, i) => (
                <motion.img
                  key={src}
                  src={src}
                  alt={i === frame ? `${meta.species} waking up` : ''}
                  aria-hidden={i === frame ? undefined : 'true'}
                  onError={() => setBroken(true)}
                  initial={false}
                  animate={{ opacity: i === frame ? 1 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.14, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'contain', imageRendering: 'pixelated',
                    filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))',
                  }}
                />
              ))}
        </motion.div>

      </div>

      {showMessage && (
        <motion.p key={caption} className="font-cinzel font-bold text-center mt-2 px-4"
          style={{ color: accent, fontSize: Math.max(13, Math.round(size * 0.13)), maxWidth: 320 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          {caption}
        </motion.p>
      )}
    </div>
  )
}

/* Static baby mascot (the existing evolution asset), then the emoji. */
function StaticFallback({ petId, emoji, size }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span style={{ fontSize: Math.round(size * 0.7), lineHeight: 1, display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
        {emoji}
      </span>
    )
  }
  return (
    <img src={spriteFor(petId, 1)} alt="" onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} />
  )
}

/* ────────────────────────────────────────────────────────────
   Wrappers — both reuse the component above rather than
   re-implementing the sequence.
   ──────────────────────────────────────────────────────────── */

const STUDY_TIPS = [
  '🎯 Specific quests are easier to finish than vague ones.',
  '📅 Planning ahead reduces cognitive load.',
  '⚡ Evidence you can actually show keeps the study fair.',
]

/**
 * Full-screen account-loading view (app boot / auth initialisation).
 */
export function MascotWakeScreen({ petType, evolutionStage = 'baby', message, restartToken = 0 }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTip(i => (i + 1) % STUDY_TIPS.length), 3500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--bg-deep)' }}>
      <MascotWakeLoader petType={petType} evolutionStage={evolutionStage}
        message={message} size={128} restartToken={restartToken} />

      <div className="h-6 mt-4 overflow-hidden text-center">
        <motion.p key={tip} className="text-xs font-nunito" style={{ color: 'var(--text-soft)', maxWidth: 320 }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {STUDY_TIPS[tip]}
        </motion.p>
      </div>
    </div>
  )
}

/**
 * Compact inline variant — the short in-form wait (e.g. the quest validity
 * check). Same wake sequence at 56px, with the caller's step text beside it.
 */
export function MascotLoaderCompact({ petId = 'dragon', level = 1, text = 'Working…', accent }) {
  const color = accent || WAKE_PETS[petIdOf(petId)].accent
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(19,19,58,0.6)', border: `1px solid ${color}33` }}>
      <MascotWakeLoader petType={petId} evolutionStage={level} size={56} showMessage={false} />
      <motion.p key={text} className="text-xs font-nunito font-semibold flex-1 min-w-0"
        style={{ color }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {text}
      </motion.p>
    </div>
  )
}
