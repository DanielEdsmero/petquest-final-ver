import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { spriteFor, petMeta } from '../../config/pets'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * "Mascot Idle" loading screen. The companion sleeps (dim, gentle breathing)
 * for ~2s, then wakes with a bounce and a pet-specific flourish. Falls back to
 * the pet emoji if the sprite is missing (never a broken image). Mobile-first:
 * centered, small footprint, no heavy assets beyond the already-cached sprite.
 */
const PET_FX = {
  dragon: { message: 'Warm breath…',     accent: '#ff9f6b' },
  cat:    { message: 'Purring softly…',  accent: '#c4b5fd' },
  wolf:   { message: 'Ready to hunt…',   accent: '#7dd3fc' },
}

const STUDY_TIPS = [
  '🎯 Specific goals lead to higher success rates.',
  '📅 Planning ahead reduces cognitive load.',
  '⚡ P1 tasks deserve your freshest energy.',
]

export default function MascotLoader({ petId = 'dragon', level = 1, text = 'Loading Pet Quest…' }) {
  const reduceMotion = useReducedMotion()
  const [awake, setAwake] = useState(reduceMotion)     // reduced motion → straight to awake
  const [tip, setTip] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const wake = reduceMotion ? null : setTimeout(() => setAwake(true), 2000)
    const rot  = setInterval(() => setTip(i => (i + 1) % STUDY_TIPS.length), 3500)
    return () => { if (wake) clearTimeout(wake); clearInterval(rot) }
  }, [reduceMotion])

  const meta = petMeta(petId)
  const fx = PET_FX[meta.id] || PET_FX.dragon

  // Pet-specific wake flourish.
  const wakeAnim =
    meta.id === 'cat'  ? { scaleX: [1, 1.14, 1], scaleY: [1, 0.9, 1] }      // stretch
    : meta.id === 'wolf' ? { rotate: [0, -10, 6, 0] }                        // head tilt / howl
    :                      { y: [0, -14, 0], scale: [1, 1.06, 1] }           // dragon: bouncy lift

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg-deep)' }}>
      {/* Glow that brightens as the pet wakes */}
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{ width: 170, height: 170, background: `radial-gradient(circle, ${fx.accent}66 0%, transparent 70%)`, filter: 'blur(18px)' }}
          animate={{ opacity: awake ? [0.5, 0.85, 0.5] : 0.25, scale: awake ? [1, 1.12, 1] : 1 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Dragon sparks — only after waking */}
        {meta.id === 'dragon' && awake && !reduceMotion && (
          <span className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => {
              const rad = ((360 / 5) * i - 90) * (Math.PI / 180)
              return (
                <motion.span key={i} className="absolute" style={{
                  left: '50%', top: '42%', width: 5, height: 5, borderRadius: '50%',
                  background: fx.accent, boxShadow: `0 0 8px ${fx.accent}`,
                }}
                  initial={{ opacity: 0, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], x: Math.cos(rad) * 60, y: Math.sin(rad) * 60 }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeOut' }} />
              )
            })}
          </span>
        )}

        {/* The companion */}
        <motion.div
          className="relative z-10"
          initial={false}
          animate={awake
            ? { opacity: 1, ...wakeAnim }
            : { opacity: 0.55, scale: reduceMotion ? 1 : [1, 1.05, 1], rotate: -6 }}
          transition={awake
            ? { duration: 0.9, ease: 'easeOut', repeat: meta.id === 'wolf' ? 0 : Infinity, repeatDelay: 0.6 }
            : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ filter: `drop-shadow(0 6px 14px rgba(0,0,0,0.5))` }}
        >
          {failed
            ? <span style={{ fontSize: 96, lineHeight: 1 }}>{meta.emoji}</span>
            : <img src={spriteFor(petId, level)} alt={meta.species} onError={() => setFailed(true)}
                style={{ width: 128, height: 128, objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }} />}
        </motion.div>

        {/* "Zzz" while sleeping */}
        {!awake && !reduceMotion && (
          <motion.span className="absolute font-cinzel" style={{ top: 8, right: 20, color: fx.accent, fontSize: 20 }}
            animate={{ opacity: [0.2, 1, 0.2], y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            z
          </motion.span>
        )}
      </div>

      {/* Status line — flips to the pet's flourish once awake */}
      <motion.p key={awake ? 'wake' : 'sleep'} className="font-cinzel font-bold text-lg mt-2 text-center"
        style={{ color: awake ? fx.accent : 'var(--text-muted)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        {awake ? fx.message : text}
      </motion.p>

      {/* Rotating research study tips */}
      <div className="h-6 mt-4 overflow-hidden text-center">
        <motion.p key={tip} className="text-xs font-nunito" style={{ color: 'var(--text-soft)', maxWidth: 320 }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          {STUDY_TIPS[tip]}
        </motion.p>
      </div>
    </div>
  )
}
