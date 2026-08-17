import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { getLevelMeta } from '../../data/progression'
import { stageName, petMeta } from '../../config/pets'
import PetSprite from '../PetSprite'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Full-screen companion celebration — used for BOTH pet evolution (Phase 2) and
 * egg hatching (Phase 3). Dims the screen, flashes gold, expands rings, then
 * reveals the new-stage sprite with a scale-in and a CTA button.
 *
 * It is a REAL modal: the backdrop, the X, and the CTA all dismiss via onDone.
 * The overlay captures pointer events (see .evolution-overlay) so a click can
 * never fall through to the task list behind it. A safety timer guarantees it
 * can never get stuck, even if a handler is somehow missed.
 *
 * `evolution` (name kept for back-compat) = {
 *   id, level, petId,
 *   kind?: 'evolve' | 'hatch',   // default 'evolve'
 *   title?, subtitle?, button?,  // optional overrides (Phase 3 hatch copy)
 * } | null
 */
export default function EvolutionOverlay({ evolution, onDone }) {
  const reduceMotion = useReducedMotion()

  // Safety net: never let the celebration trap the screen. Manual dismissal
  // (backdrop / X / CTA) normally fires long before this.
  useEffect(() => {
    if (!evolution) return
    const t = setTimeout(() => onDone?.(), 9000)
    return () => clearTimeout(t)
  }, [evolution, onDone])

  if (!evolution) return null

  const { level = 1, petId, kind = 'evolve' } = evolution
  const meta = getLevelMeta(level)
  const isHatch = kind === 'hatch'

  const title    = evolution.title    || (isHatch ? 'Hatched!' : 'Evolution!')
  const subtitle = evolution.subtitle || (isHatch
    ? `Your companion has hatched: the ${petMeta(petId).species}!`
    : `Your companion evolved to ${stageName(level)}!`)
  const button   = evolution.button   || 'View your companion'

  return createPortal(
    <AnimatePresence>
      {evolution && (
        <motion.div
          key={evolution.id}
          className="evolution-overlay"
          onClick={onDone}                      /* backdrop click dismisses */
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Close button — top-right, always dismisses (only). */}
          <button
            onClick={(e) => { e.stopPropagation(); onDone?.() }}
            aria-label="Close"
            className="absolute top-5 right-5 p-2 rounded-lg"
            style={{ color: 'var(--text-soft)', zIndex: 3 }}
          >
            <X size={22} />
          </button>

          {/* Screen flash */}
          {!reduceMotion && (
            <motion.div
              className="evolution-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{ duration: 0.7, times: [0, 0.25, 1], ease: 'easeOut' }}
            />
          )}

          {/* Clicking the card itself should NOT dismiss (only backdrop/X/CTA). */}
          <div className="flex flex-col items-center gap-5 relative" style={{ zIndex: 2 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
              {/* Expanding gold rings */}
              {!reduceMotion && [0, 0.25, 0.5].map((delay, i) => (
                <motion.span
                  key={i}
                  className="evolution-ring"
                  initial={{ scale: 0.3, opacity: 0.9 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 1.5, delay, repeat: Infinity, ease: 'easeOut' }}
                />
              ))}

              {/* New-stage sprite (falls back to emoji if art is missing) */}
              <motion.div
                style={{ filter: 'drop-shadow(0 0 30px var(--gold))' }}
                initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
                animate={
                  reduceMotion
                    ? { scale: 1, rotate: 0, opacity: 1 }
                    : { scale: [0.4, 1.28, 1], rotate: [-12, 6, 0], opacity: 1 }
                }
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
              >
                <PetSprite petId={petId} level={level} size={150} style={{ display: 'block' }} />
              </motion.div>
            </div>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0.1 : 0.9, duration: 0.5 }}
            >
              <p className="font-cinzel font-black text-3xl gradient-text-gold mb-1">{title}</p>
              <p className="font-cinzel font-bold text-xl" style={{ color: 'var(--text-primary)' }}>{subtitle}</p>
              {!isHatch && (
                <p className="font-nunito text-sm mt-2 max-w-xs" style={{ color: 'var(--text-soft)' }}>{meta.blurb}</p>
              )}
              <button onClick={(e) => { e.stopPropagation(); onDone?.() }}
                className="btn-gold px-8 py-2.5 mt-5 font-cinzel font-bold tracking-wide">
                {button}
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
