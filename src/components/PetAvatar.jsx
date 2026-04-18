import { motion, AnimatePresence } from 'framer-motion'
import { ACCESSORIES } from '../data/accessories'

const SIZE_CONFIG = {
  lg: { container: 180, pet: 100 },
  md: { container: 120, pet: 68 },
  sm: { container: 100, pet: 56 },
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

  const equipped = [hat, eyewear, outfit, misc].filter(Boolean)

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Pet with glow */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: cfg.container, height: cfg.container }}
      >
        {/* Glow orb */}
        {glowing && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${pet?.glowColor || 'rgba(124,58,237,0.4)'} 0%, transparent 70%)`,
              filter: 'blur(18px)',
            }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Pet emoji */}
        <motion.div
          className="relative z-10 select-none leading-none"
          style={{
            fontSize: cfg.pet,
            filter: glowing
              ? `drop-shadow(0 0 16px ${pet?.color || '#7c3aed'}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`
              : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
          }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {pet?.emoji || '🐾'}
        </motion.div>

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