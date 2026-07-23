import { motion, AnimatePresence } from 'framer-motion'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Small radial burst of star particles. Absolutely positioned, so the parent
 * needs `position: relative`. Particles fan out evenly and fade as they travel.
 */
// Hard ceiling on concurrent particles so a burst can never flood the DOM.
const MAX_PARTICLES = 20

export default function ParticleBurst({ show, count = 5, color = '#f5a31a', distance = 28 }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  const n = Math.min(Math.max(0, count), MAX_PARTICLES)

  return (
    <AnimatePresence>
      {show && (
        <span className="particle-origin" aria-hidden="true">
          {Array.from({ length: n }).map((_, i) => {
            // Fan evenly around the circle, starting straight up.
            const rad = ((360 / n) * i - 90) * (Math.PI / 180)
            // Alternate the throw distance so the burst doesn't look mechanical.
            const dist = distance + (i % 2 ? 10 : 0)
            return (
              <motion.span
                key={i}
                className="particle-star"
                style={{ color }}
                initial={{ opacity: 1, x: 0, y: 0, scale: 0.3 }}
                animate={{
                  opacity: 0,
                  x: Math.cos(rad) * dist,
                  y: Math.sin(rad) * dist,
                  scale: 1.1,
                  rotate: i % 2 ? 90 : -90,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              >
                ★
              </motion.span>
            )
          })}
        </span>
      )}
    </AnimatePresence>
  )
}
