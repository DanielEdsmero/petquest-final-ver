import { motion } from 'framer-motion'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Idle companion shown when a difficulty tab has no quests. Each tier gets its
 * own personality:
 *   easy   — asleep (slow breathing)
 *   medium — looking around (head tilt)
 *   hard   — push-ups (repeated vertical bounce)
 *
 * Uses whichever pet the player actually chose rather than assuming Ember.
 */
const IDLE_ANIMS = {
  easy: {
    animate: { scale: [0.95, 1, 0.95] },
    transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
  },
  medium: {
    animate: { rotate: [-8, 8, -8] },
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  hard: {
    animate: { y: [0, -10, 0] },
    transition: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' },
  },
}

export default function EmptyStatePet({ difficulty = 'easy', emoji = '🐾' }) {
  const reduceMotion = useReducedMotion()
  const idle = IDLE_ANIMS[difficulty] || IDLE_ANIMS.easy

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex items-center justify-center" style={{ height: 56 }}>
        <motion.span
          className="empty-pet"
          animate={reduceMotion ? {} : idle.animate}
          transition={idle.transition}
        >
          {emoji}
        </motion.span>

        {/* Sleeping companions get drifting Zs. */}
        {difficulty === 'easy' && !reduceMotion && (
          <motion.span
            className="absolute text-sm"
            style={{ right: -14, top: -2, color: 'var(--text-soft)' }}
            animate={{ y: [0, -12, -20], opacity: [0, 1, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
          >
            💤
          </motion.span>
        )}
      </div>

      <motion.p
        className="text-sm font-nunito italic text-center"
        style={{ color: 'var(--text-soft)' }}
        animate={reduceMotion ? {} : { opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        The realm awaits your quests...
      </motion.p>
    </div>
  )
}
