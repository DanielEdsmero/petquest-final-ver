import { motion, AnimatePresence } from 'framer-motion'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Reward text that rises and fades (e.g. "+10 pts", "+🍖").
 * Parent needs `position: relative`. Default 800ms.
 */
export default function FloatingText({
  show,
  children,
  color = '#f5a31a',
  rise = 56,
  duration = 0.8,
  fontSize = '1rem',
}) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="floating-text"
          style={{ color, fontSize }}
          aria-hidden="true"
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={
            reduceMotion
              ? { opacity: [0, 1, 1, 0], y: 0, scale: 1 }
              : { opacity: [0, 1, 1, 0], y: -rise, scale: 1 }
          }
          exit={{ opacity: 0 }}
          transition={{ duration, ease: 'easeOut', times: [0, 0.15, 0.6, 1] }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}
