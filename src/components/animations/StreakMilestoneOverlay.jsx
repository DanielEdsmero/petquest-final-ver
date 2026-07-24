import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MILESTONE_REWARDS } from '../../data/progression'
import useReducedMotion from '../../hooks/useReducedMotion'
import CelebrationRings from './CelebrationRings'

/*
 * Full-screen celebration when a streak reaches 7 / 30 / 100 / 365 days.
 *
 * Deliberately a sibling of EvolutionOverlay rather than a shared abstraction:
 * the two fire on different events, carry different copy, and are tuned to
 * different palettes (fire here, gold there). Folding them together would cost
 * more in indirection than it saves. They share the pieces that are genuinely
 * common — the `.evolution-overlay` backdrop and CelebrationRings.
 *
 * Portalled to <body> so no transformed ancestor can trap the fixed overlay.
 * `milestone` = { id, days } | null
 */
export default function StreakMilestoneOverlay({ milestone, onDone }) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!milestone) return
    const id = setTimeout(onDone, reduceMotion ? 1600 : 2800)
    return () => clearTimeout(id)
  }, [milestone, onDone, reduceMotion])

  return createPortal(
    <AnimatePresence>
      {milestone && (
        <motion.div
          key={milestone.id}
          className="evolution-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Ember-coloured rings behind the sequence. */}
          <CelebrationRings color="#fb923c" colorTwo="#f5a31a" opacity={0.65} speed={1.7} />

          <div className="flex flex-col items-center gap-5 relative" style={{ zIndex: 2 }}>
            <motion.span
              style={{ fontSize: 104, lineHeight: 1, filter: 'drop-shadow(0 0 34px #fb923c)' }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={
                reduceMotion
                  ? { scale: 1, opacity: 1 }
                  : { scale: [0.4, 1.3, 1], rotate: [0, -10, 8, 0], opacity: 1 }
              }
              transition={{ duration: 1.1, ease: 'easeOut' }}
            >
              🔥
            </motion.span>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0.1 : 0.7, duration: 0.5 }}
            >
              <p className="font-cinzel font-black text-4xl mb-1" style={{ color: '#fb923c' }}>
                {milestone.days}-Day Streak!
              </p>
              <p className="font-cinzel font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                Milestone reached
              </p>
              <p className="font-nunito text-sm mt-2 max-w-xs" style={{ color: 'var(--text-soft)' }}>
                You earned {MILESTONE_REWARDS[milestone.days] || 'a reward'}.
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
