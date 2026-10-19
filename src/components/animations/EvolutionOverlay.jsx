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

  const name     = petMeta(petId).name
  const title    = evolution.title    || (isHatch ? 'Hatched!' : `${name} evolved!`)
  const subtitle = evolution.subtitle || (isHatch
    ? `Your companion has hatched: the ${petMeta(petId).species}!`
    : `Your companion is now ${/^[AEIOU]/.test(stageName(level)) ? 'an' : 'a'} ${stageName(level)}.`)
  const button   = evolution.button   || `See ${name}`

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
            className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-xl"
            style={{ color: '#FFFFFF', zIndex: 3 }}
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
          <div className="flex flex-col items-center gap-3 relative bg-white rounded-3xl px-8 pt-6 pb-7 mx-4 font-nunito"
            style={{ zIndex: 2, maxWidth: 360, boxShadow: '0 16px 40px rgba(16,42,67,0.25)' }}
            onClick={(e) => e.stopPropagation()}>
            <p aria-hidden="true" className="text-lg tracking-[0.5em]" style={{ color: '#EBA66E' }}>✦ ✦ ✦</p>
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
                style={{ filter: 'drop-shadow(0 6px 10px rgba(16,42,67,0.18))' }}
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
              <p className="font-extrabold text-3xl mb-1" style={{ color: '#102A43' }}>{title}</p>
              <p className="font-bold text-lg" style={{ color: '#3E5165' }}>{subtitle}</p>
              {!isHatch && (
                <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: '#3E5165' }}>{meta.blurb}</p>
              )}
              <button onClick={(e) => { e.stopPropagation(); onDone?.() }}
                className="w-full min-h-[48px] px-8 mt-5 rounded-xl text-base font-bold text-white"
                style={{ background: '#2F6F6B' }}>
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
