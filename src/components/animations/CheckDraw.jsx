import { motion } from 'framer-motion'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Checkmark that draws itself in via SVG pathLength, with the ring sweeping
 * around it. Used when a quest completes successfully.
 */
export default function CheckDraw({ size = 22, color = '#22c55e', duration = 0.4 }) {
  const reduceMotion = useReducedMotion()

  // Reduced motion: show the finished mark with no drawing animation.
  const draw = reduceMotion
    ? { initial: { pathLength: 1, opacity: 1 }, animate: { pathLength: 1, opacity: 1 } }
    : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <motion.circle
        cx="12" cy="12" r="10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        {...draw}
        transition={{ duration, ease: 'easeOut' }}
      />
      <motion.path
        d="M7 12.5 L10.5 16 L17 8.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw}
        transition={{ duration, ease: 'easeOut', delay: reduceMotion ? 0 : duration * 0.45 }}
      />
    </svg>
  )
}
