import { motion } from 'framer-motion'
import { isStreakMilestone, STREAK_MILESTONES } from '../data/progression'
import useReducedMotion from '../hooks/useReducedMotion'

/*
 * Daily streak counter for the navbar. Pulses continuously once the streak is
 * sitting on a milestone (7 / 30 / 100 / 365).
 */
export default function StreakCounter({ streak = 0, longest = 0 }) {
  const reduceMotion = useReducedMotion()
  const milestone = isStreakMilestone(streak)
  const active = streak > 0

  const next = STREAK_MILESTONES.find(m => m > streak)
  const title = active
    ? `${streak}-day streak · best ${Math.max(longest, streak)}` +
      (next ? ` · next reward at ${next}` : '')
    : 'Complete a quest today to start a streak'

  return (
    <motion.div
      className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-xl relative flex-shrink-0"
      style={{
        background: active ? 'rgba(249, 115, 22, 0.12)' : 'rgba(30, 30, 60, 0.5)',
        border: `1px solid ${active ? 'rgba(249, 115, 22, 0.35)' : 'rgba(80, 80, 120, 0.35)'}`,
      }}
      title={title}
      animate={milestone && !reduceMotion ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={
        milestone && !reduceMotion
          ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.2 }
      }
    >
      {/* Milestone halo */}
      {milestone && !reduceMotion && (
        <motion.span
          className="streak-halo"
          animate={{ opacity: [0.5, 0, 0.5], scale: [0.9, 1.35, 0.9] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <motion.span
        className="text-lg relative"
        style={{ zIndex: 1, filter: active ? 'none' : 'grayscale(100%) opacity(0.5)' }}
        animate={active && !reduceMotion ? { rotate: [0, -8, 8, 0] } : {}}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
      >
        🔥
      </motion.span>

      <div className="relative leading-none" style={{ zIndex: 1 }}>
        <div
          className="font-cinzel font-black text-base"
          style={{ color: active ? '#fb923c' : 'var(--text-muted)' }}
        >
          {streak}
        </div>
        <div className="text-xs font-nunito hidden sm:block" style={{ color: 'var(--text-soft)' }}>
          {streak === 1 ? 'day' : 'days'}
        </div>
      </div>
    </motion.div>
  )
}
