import { motion, AnimatePresence } from 'framer-motion'
import { ACCESSORIES } from '../data/accessories'
import useReducedMotion from '../hooks/useReducedMotion'
import { getLevelMeta } from '../data/progression'
import PetSprite from './PetSprite'

const SIZE_CONFIG = {
  lg: { container: 180, pet: 100 },
  md: { container: 120, pet: 68 },
  sm: { container: 100, pet: 56 },
}

/* One-shot reactions to care actions. Each overrides the idle float while it
   plays, then the pet settles back into drifting. */
const CARE_ANIMS = {
  // Chewing: squash and stretch on alternating axes.
  feed: {
    scaleX: [1, 1.16, 0.9, 1.12, 1],
    scaleY: [1, 0.86, 1.14, 0.92, 1],
    y: [0, 4, -2, 2, 0],
  },
  // Shaking off water.
  shower: {
    rotate: [0, -9, 9, -6, 4, 0],
    y: [0, -4, 0, -2, 0],
  },
  // Playful leap.
  play: {
    scale: [1, 1.22, 0.92, 1.14, 1],
    y: [0, -22, 2, -12, 0],
  },
  // Streak lost — a slow, heavy droop.
  sad: {
    rotate: [0, -4, 3, -2, 0],
    y: [0, 8, 6, 8, 4],
    scale: [1, 0.94, 0.96, 0.94, 0.96],
  },
}

export default function PetAvatar({
  pet, equippedAccessories, size = 'lg', glowing = true,
  careAction = null, level = 1,
}) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.lg
  const reduceMotion = useReducedMotion()
  const care = careAction ? CARE_ANIMS[careAction] : null
  const lvl = getLevelMeta(level)
  // Evolution scales the pet and the intensity of its glow.
  const petSize = Math.round(cfg.pet * lvl.scale)

  const getEquipped = (category) => {
    const id = equippedAccessories?.[category]
    return id ? ACCESSORIES.find(a => a.id === id) : null
  }

  const hat     = getEquipped('hat')
  const eyewear = getEquipped('eyewear')
  const outfit  = getEquipped('outfit')
  const misc    = getEquipped('misc')

  const equipped = [hat, eyewear, outfit, misc].filter(Boolean)

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Pet with glow */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: cfg.container, height: cfg.container }}
      >
        {/* Elder/Legendary rotating aura */}
        {lvl.aura && !reduceMotion && (
          <motion.div
            className="pet-aura"
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Glow orb — intensity scales with evolution level */}
        {glowing && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${pet?.glowColor || 'rgba(124,58,237,0.4)'} 0%, transparent 70%)`,
              filter: `blur(18px)`,
            }}
            animate={
              reduceMotion
                ? { scale: lvl.glowScale }
                : {
                    scale: [lvl.glowScale, lvl.glowScale * 1.18, lvl.glowScale],
                    opacity: [0.5, 0.9, 0.5],
                  }
            }
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Legendary orbiting particles */}
        {lvl.particles > 0 && !reduceMotion && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-10"
            animate={{ rotate: 360 }}
            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
          >
            {Array.from({ length: lvl.particles }).map((_, i) => {
              const rad = ((360 / lvl.particles) * i) * (Math.PI / 180)
              const r = cfg.container * 0.42
              return (
                <motion.span
                  key={i}
                  className="absolute text-xs"
                  style={{
                    left: '50%', top: '50%',
                    marginLeft: Math.cos(rad) * r,
                    marginTop: Math.sin(rad) * r,
                    color: 'var(--gold-light)',
                    textShadow: '0 0 8px var(--gold)',
                  }}
                  animate={{ opacity: [0.35, 1, 0.35], scale: [0.8, 1.15, 0.8] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
                >
                  ✦
                </motion.span>
              )
            })}
          </motion.div>
        )}

        {/* Pet emoji */}
        <motion.div
          className="relative z-10 select-none leading-none"
          style={{
            fontSize: petSize,
            filter: [
              glowing
                ? `drop-shadow(0 0 ${Math.round(16 * lvl.glowScale)}px ${pet?.color || '#7c3aed'}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`
                : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
              lvl.hue ? `hue-rotate(${lvl.hue}deg)` : '',
            ].filter(Boolean).join(' '),
            transition: 'font-size 0.4s ease-out',
          }}
          animate={
            reduceMotion ? {}
            : care      ? care
            :             { y: [0, -8, 0] }
          }
          transition={
            care
              ? { duration: 0.8, ease: 'easeInOut' }
              : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          {/* Evolution sprite (falls back to the pet emoji if art is missing). */}
          <PetSprite petId={pet?.id} level={level} size={petSize} style={{ display: 'block' }} />
        </motion.div>

        {/* Shower sparkles ring the pet while it shakes off. */}
        <AnimatePresence>
          {careAction === 'shower' && !reduceMotion && (
            <span className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => {
                const rad = ((360 / 6) * i - 90) * (Math.PI / 180)
                const r = cfg.container * 0.34
                return (
                  <motion.span
                    key={i}
                    className="absolute text-base"
                    style={{
                      left: '50%',
                      top: '50%',
                      marginLeft: Math.cos(rad) * r,
                      marginTop: Math.sin(rad) * r,
                    }}
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: [0, 1, 0], scale: [0.3, 1.15, 0.5], rotate: i % 2 ? 40 : -40 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, delay: i * 0.06, ease: 'easeOut' }}
                  >
                    ✨
                  </motion.span>
                )
              })}
            </span>
          )}
        </AnimatePresence>

        {/* Accessory count badge */}
        {equipped.length > 0 && (
          <motion.div
            className="absolute z-30 pointer-events-none"
            style={{
              top: 6, right: 6,
              width: 20, height: 20,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f5a31a, #ffd166)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, color: '#1a0d00',
              border: '2px solid rgba(6,6,26,0.9)',
              boxShadow: '0 0 10px rgba(245,163,26,0.7)',
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
          >
            {equipped.length}
          </motion.div>
        )}
      </div>

      {/* Equipped accessories row — shown below pet */}
      <AnimatePresence>
        {equipped.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-center gap-1.5 flex-wrap justify-center"
          >
            {equipped.map((acc) => (
              <motion.div
                key={acc.id}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 400 }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-nunito font-bold"
                style={{
                  background: 'rgba(245,163,26,0.12)',
                  border: '1px solid rgba(245,163,26,0.35)',
                  color: '#f5a31a',
                  fontSize: 11,
                }}
              >
                <span style={{ fontSize: 14 }}>{acc.emoji}</span>
                {size === 'lg' && <span>{acc.name}</span>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}