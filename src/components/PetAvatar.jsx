import { motion, AnimatePresence } from 'framer-motion'
import { ACCESSORIES } from '../data/accessories'

/* Size config — all values in px so we can position accessories precisely */
const SIZE_CONFIG = {
  lg: { container: 160, pet: 96,  hat: 36, face: 28, badge: 26, aura: 24, hatTop: -18, faceTop: 44 },
  md: { container: 112, pet: 64,  hat: 28, face: 22, badge: 20, aura: 20, hatTop: -14, faceTop: 30 },
  sm: { container: 96,  pet: 56,  hat: 24, face: 18, badge: 18, aura: 18, hatTop: -12, faceTop: 26 },
}

export default function PetAvatar({ pet, equippedAccessories, size = 'lg', glowing = true }) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.lg

  const getEquipped = (category) => {
    const id = equippedAccessories?.[category]
    return id ? ACCESSORIES.find(a => a.id === id) : null
  }

  const hat     = getEquipped('hat')
  const eyewear = getEquipped('eyewear')
  const outfit  = getEquipped('outfit')
  const misc    = getEquipped('misc')

  const hasAny = hat || eyewear || outfit || misc

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: cfg.container, height: cfg.container }}
    >
      {/* Glow orb */}
      {glowing && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${pet?.glowColor || 'rgba(124,58,237,0.4)'} 0%, transparent 70%)`,
            filter: 'blur(16px)',
          }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* HAT - sits above the pet */}
      <AnimatePresence>
        {hat && (
          <motion.div
            key={hat.id}
            className="absolute pointer-events-none z-30 flex items-center justify-center"
            style={{
              fontSize: cfg.hat,
              top: cfg.hatTop,
              left: '50%',
              transform: 'translateX(-50%)',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            }}
            initial={{ scale: 0, y: -10, rotate: -15 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {hat.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pet main emoji */}
      <motion.div
        className="relative z-10 select-none leading-none"
        style={{
          fontSize: cfg.pet,
          filter: glowing
            ? `drop-shadow(0 0 14px ${pet?.color || '#7c3aed'}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`
            : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
        }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {pet?.emoji || '🐾'}
      </motion.div>

      {/* EYEWEAR - centered over face */}
      <AnimatePresence>
        {eyewear && (
          <motion.div
            key={eyewear.id}
            className="absolute pointer-events-none z-20 flex items-center justify-center"
            style={{
              fontSize: cfg.face,
              top: cfg.faceTop,
              left: '50%',
              transform: 'translateX(-50%)',
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {eyewear.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* OUTFIT - bottom right badge */}
      <AnimatePresence>
        {outfit && (
          <motion.div
            key={outfit.id}
            className="absolute pointer-events-none z-20 flex items-center justify-center rounded-full"
            style={{
              fontSize: cfg.badge,
              bottom: 0,
              right: 0,
              width: cfg.badge + 10,
              height: cfg.badge + 10,
              background: 'rgba(14,14,46,0.85)',
              border: '2px solid rgba(245,163,26,0.5)',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            }}
            initial={{ scale: 0, rotate: 20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {outfit.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MISC - bottom left spinning */}
      <AnimatePresence>
        {misc && (
          <motion.div
            key={misc.id}
            className="absolute pointer-events-none z-20 flex items-center justify-center rounded-full"
            style={{
              fontSize: cfg.aura,
              bottom: 0,
              left: 0,
              width: cfg.aura + 10,
              height: cfg.aura + 10,
              background: 'rgba(14,14,46,0.85)',
              border: '2px solid rgba(124,58,237,0.5)',
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: 360 }}
            exit={{ scale: 0 }}
            transition={{
              scale: { type: 'spring', stiffness: 400, damping: 20 },
              rotate: { duration: 6, repeat: Infinity, ease: 'linear' },
            }}
          >
            {misc.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accessory count badge */}
      {hasAny && (
        <motion.div
          className="absolute pointer-events-none z-30"
          style={{
            top: -4,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #f5a31a, #ffd166)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 900,
            color: '#1a0d00',
            fontFamily: 'Nunito, sans-serif',
            border: '2px solid rgba(6,6,26,0.8)',
            boxShadow: '0 0 8px rgba(245,163,26,0.6)',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500 }}
        >
          {[hat, eyewear, outfit, misc].filter(Boolean).length}
        </motion.div>
      )}
    </div>
  )
}