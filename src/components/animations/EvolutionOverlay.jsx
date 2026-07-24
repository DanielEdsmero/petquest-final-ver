import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getLevelMeta } from '../../data/progression'
import useReducedMotion from '../../hooks/useReducedMotion'
import CelebrationRings from './CelebrationRings'

/*
 * Full-screen transformation sequence when the pet evolves:
 * white flash -> expanding gold rings -> the new form announced.
 *
 * Portalled to <body> so no transformed ancestor can trap the fixed overlay.
 * `evolution` = { id, level } | null
 */
export default function EvolutionOverlay({ evolution, petEmoji = '🐾', onDone }) {
  const reduceMotion = useReducedMotion()

  // Auto-dismiss; the whole sequence runs ~2.6s.
  useEffect(() => {
    if (!evolution) return
    const id = setTimeout(onDone, reduceMotion ? 1600 : 2600)
    return () => clearTimeout(id)
  }, [evolution, onDone, reduceMotion])

  const meta = evolution ? getLevelMeta(evolution.level) : null

  return createPortal(
    <AnimatePresence>
      {evolution && meta && (
        <motion.div
          key={evolution.id}
          className="evolution-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Magic rings bloom behind the whole sequence. */}
          <CelebrationRings color="#f5a31a" colorTwo="#7c3aed" opacity={0.6} />

          {/* Screen flash */}
          {!reduceMotion && (
            <motion.div
              className="evolution-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{ duration: 0.7, times: [0, 0.25, 1], ease: 'easeOut' }}
            />
          )}

          <div className="flex flex-col items-center gap-5 relative" style={{ zIndex: 2 }}>
            <div className="relative flex items-center justify-center" style={{ width: 190, height: 190 }}>
              {/* Expanding rings */}
              {!reduceMotion && [0, 0.25, 0.5].map((delay, i) => (
                <motion.span
                  key={i}
                  className="evolution-ring"
                  initial={{ scale: 0.3, opacity: 0.9 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 1.5, delay, repeat: Infinity, ease: 'easeOut' }}
                />
              ))}

              <motion.span
                style={{ fontSize: 96, lineHeight: 1, filter: 'drop-shadow(0 0 30px var(--gold))' }}
                initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
                animate={
                  reduceMotion
                    ? { scale: 1, rotate: 0, opacity: 1 }
                    : { scale: [0.4, 1.28, 1], rotate: [-12, 6, 0], opacity: 1 }
                }
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
              >
                {petEmoji}
              </motion.span>
            </div>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0.1 : 0.9, duration: 0.5 }}
            >
              <p className="font-cinzel font-black text-3xl gradient-text-gold mb-1">
                Evolution!
              </p>
              <p className="font-cinzel font-bold text-xl" style={{ color: 'var(--text-primary)' }}>
                Level {meta.level} — {meta.name}
              </p>
              <p className="font-nunito text-sm mt-2 max-w-xs" style={{ color: 'var(--text-soft)' }}>
                {meta.blurb}
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
