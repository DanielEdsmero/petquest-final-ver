import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  wakeFramesFor, wakeMessageFor, resolveWakePet, petIdOf, petMeta, spriteFor,
  WAKE_PHASES, WAKE_TIMINGS, WAKE_PETS, MIN_MASCOT_LOADER_MS, wakeFrameForPhase,
  shouldRevealAccount,
} from '../../config/pets'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Mascot wake-up loader — the account-loading buffer.
 *
 * Replaces the old gold "portal" pulsing circle. The participant's companion
 * sleeps, stirs, performs its own flourish (dragon spark / cat stretch / wolf
 * head-raise) and settles awake. The sequence is MANDATORY by default: the
 * account is revealed only once BOTH the minimum animation has played AND the
 * account data has arrived — with an always-visible Skip control that drops the
 * duration requirement on demand.
 *
 * It never blocks the network. The caller starts authentication and data
 * fetching before/while mounting this and reports progress via
 * `accountDataReady`; the loader gates the REVEAL, never the request.
 *
 * State machine
 *   sleeping → waking → personalityAction → awake        (the four drawn poses)
 *     → waitingForAccount   minimum played, data still in flight
 *     → skipped             the participant pressed Skip
 *     → error               the caller reported a failure; timers stop
 *   Every terminal state holds the awake frame.
 *
 * Reveal rule
 *   onComplete() fires once, when accountDataReady && (minimum played || skipped).
 *
 * Props
 *   petType           app id (dragon/cat/wolf) or assetType; omit when unknown
 *                     and a companion is picked at random for this instance
 *   evolutionStage    stage key or 1–5 level (baby art is used for every stage)
 *   message           caption override; defaults to the current phase's line
 *   size              rendered square size in CSS px
 *   showMessage       render the caption under the mascot
 *   restartToken      change it to replay from the sleeping frame
 *   accountDataReady  the account is loaded and safe to reveal
 *   onComplete        called once when the reveal rule is satisfied
 *   onSkip            called when Skip is pressed (before onComplete)
 *   showSkip          render the Skip control (default true)
 *   error             stop the sequence; the caller shows its own error state
 */

const A11Y_STATUS = 'Loading your PetQuest account. Your pet is waking up.'

export default function MascotWakeLoader({
  petType,
  evolutionStage = 'baby',
  message,
  size = 112,
  showMessage = true,
  restartToken = 0,
  accountDataReady = false,
  onComplete,
  onSkip,
  showSkip = true,
  error = false,
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

  const [phase, setPhase]   = useState('sleeping')
  const [skipped, setSkip]  = useState(false)
  const [broken, setBroken] = useState(false)   // a wake frame failed to load

  /* Callbacks held in refs: a caller re-rendering with a fresh closure must not
     restart the sequence or re-fire the reveal. */
  const completeRef = useRef(onComplete); completeRef.current = onComplete
  const skipCbRef   = useRef(onSkip);     skipCbRef.current   = onSkip
  const firedRef    = useRef(false)       // onComplete is a one-shot

  /* ── The timed sequence ──
     One timer per pose, all cleared on unmount, restart and error, so a stale
     timer can never set state or reveal a previous account. */
  useEffect(() => {
    firedRef.current = false
    setSkip(false)
    setPhase('sleeping')                        // every (re)start begins asleep
    if (error) return

    const timers = []
    let elapsed = 0
    for (let i = 1; i < WAKE_PHASES.length; i++) {
      elapsed += WAKE_TIMINGS[WAKE_PHASES[i - 1]]
      timers.push(setTimeout(() => setPhase(WAKE_PHASES[i]), elapsed))
    }
    // Minimum reached: hold the awake pet until the data lands (the reveal
    // effect below fires the moment both conditions are true).
    timers.push(setTimeout(() => {
      setPhase(p => (p === 'skipped' ? p : 'waitingForAccount'))
    }, MIN_MASCOT_LOADER_MS))

    return () => timers.forEach(clearTimeout)
  }, [restartToken, petId, error])

  /* ── The reveal rule ──
     Data ready AND (the minimum has played OR the participant skipped). */
  const minimumDone = phase === 'waitingForAccount'
  useEffect(() => {
    if (firedRef.current) return
    if (shouldRevealAccount({ accountDataReady, minimumDone, skipped, error })) {
      firedRef.current = true
      completeRef.current?.()
    }
  }, [accountDataReady, minimumDone, skipped, error])

  /* Skip: stop advancing and drop the duration requirement. Idempotent —
     pressing it again, or after the sequence ended, changes nothing. */
  const handleSkip = useCallback(() => {
    setSkip(prev => {
      if (!prev) skipCbRef.current?.()
      return true
    })
    setPhase('skipped')
  }, [])

  /* Reset the broken-asset flag when the pet changes, so one missing file
     doesn't permanently pin every later companion to the static fallback. */
  useEffect(() => { setBroken(false) }, [petId])

  const shownPhase = error ? 'error' : phase
  const frameIndex = wakeFrameForPhase(shownPhase)
  const frames  = wakeFramesFor(petId, evolutionStage)
  const meta    = petMeta(petId)
  const accent  = WAKE_PETS[petIdOf(petId)].accent
  const caption = message ?? wakeMessageFor(petId, shownPhase, !isRandomPet)
  const awake   = frameIndex === WAKE_PHASES.length - 1

  return (
    <div className="flex flex-col items-center justify-center">
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center">
        <span className="sr-only">{A11Y_STATUS}</span>

        <div className="relative flex items-center justify-center flex-shrink-0"
          style={{ width: size, height: size }}>
          {/* Glow — dim while asleep, brighter once awake. Reduced motion gets a
              steady glow rather than a pulse. */}
          <motion.span aria-hidden="true" className="absolute rounded-full pointer-events-none"
            style={{
              width: size * 0.9, height: size * 0.9,
              background: `radial-gradient(circle, ${accent}59 0%, transparent 70%)`,
              filter: `blur(${Math.round(size * 0.09)}px)`,
            }}
            animate={reduceMotion
              ? { opacity: awake ? 0.6 : 0.3 }
              : awake ? { opacity: [0.5, 0.85, 0.5], scale: [1, 1.1, 1] } : { opacity: 0.28, scale: 1 }}
            transition={reduceMotion
              ? { duration: 0.3 }
              : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />

          {/* The mascot. All four frames are mounted (preloaded) and cross-faded;
              if one fails to load the static baby sprite — then the emoji —
              stands in and the timing sequence carries on regardless. */}
          <motion.div className="relative z-10" style={{ width: size, height: size }}
            animate={reduceMotion || !awake ? { scale: 1 } : { scale: [1, 1.03, 1] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
            {broken
              ? <StaticFallback petId={petId} emoji={meta.emoji} size={size} />
              : frames.map((src, i) => (
                  <motion.img
                    key={src}
                    src={src}
                    alt={i === frameIndex ? `${meta.species} waking up` : ''}
                    aria-hidden={i === frameIndex ? undefined : 'true'}
                    onError={() => setBroken(true)}
                    initial={false}
                    animate={{ opacity: i === frameIndex ? 1 : 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.4 }}>
            {caption}
          </motion.p>
        )}
      </div>

      {/* Skip — always visible (never hover-only, never behind a menu) and it
          stays put while the account request is still in flight. Secondary
          styling so it reads as an option, not a primary or destructive action.
          The global :focus-visible rule gives it a gold keyboard focus ring. */}
      {showSkip && !error && (
        <button
          type="button"
          onClick={handleSkip}
          aria-label="Skip pet wake-up animation"
          className="btn-ghost mt-5 px-4 py-2 text-xs font-nunito font-bold"
          style={{ minHeight: 40 }}   /* comfortable touch target */
        >
          Skip animation →
        </button>
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
 * Full-screen account-loading view (app boot / sign-in).
 *
 * A fixed, opaque overlay rather than a replacement screen: whatever is behind
 * it keeps its state and its place in the tree, so a failed sign-in drops
 * straight back to the login form with the typed values (and any inline error)
 * intact, and a redirect underneath can never tear the animation down.
 */
export function MascotWakeScreen({
  petType, evolutionStage = 'baby', message, restartToken = 0,
  accountDataReady = false, onComplete, onSkip, error = false,
}) {
  const reduceMotion = useReducedMotion()
  const [tip, setTip] = useState(0)

  useEffect(() => {
    if (reduceMotion) return          // no rotating text when motion is reduced
    const id = setInterval(() => setTip(i => (i + 1) % STUDY_TIPS.length), 3500)
    return () => clearInterval(id)
  }, [reduceMotion])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--bg-deep)' }}>
      <MascotWakeLoader petType={petType} evolutionStage={evolutionStage}
        message={message} size={128} restartToken={restartToken}
        accountDataReady={accountDataReady} onComplete={onComplete} onSkip={onSkip}
        error={error} />

      <div className="h-6 mt-4 overflow-hidden text-center">
        <motion.p key={tip} className="text-xs font-nunito" style={{ color: 'var(--text-soft)', maxWidth: 320 }}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}>
          {STUDY_TIPS[tip]}
        </motion.p>
      </div>
    </div>
  )
}

/**
 * Compact inline variant — the short in-form wait (e.g. the quest validity
 * check). Same wake sequence at 56px with the caller's step text beside it, and
 * no Skip control: it gates nothing, so there is nothing to skip.
 */
export function MascotLoaderCompact({ petId = 'dragon', level = 1, text = 'Working…', accent }) {
  const color = accent || WAKE_PETS[petIdOf(petId)].accent
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(19,19,58,0.6)', border: `1px solid ${color}33` }}>
      <MascotWakeLoader petType={petId} evolutionStage={level} size={56}
        showMessage={false} showSkip={false} />
      <motion.p key={text} className="text-xs font-nunito font-semibold flex-1 min-w-0"
        style={{ color }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {text}
      </motion.p>
    </div>
  )
}
