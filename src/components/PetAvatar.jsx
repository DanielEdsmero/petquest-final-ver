import { motion } from 'framer-motion'
import { ACCESSORIES } from '../data/accessories'

export default function PetAvatar({ pet, equippedAccessories, size = 'lg', glowing = true }) {
  const emojiSize = size === 'lg' ? 'text-8xl' : size === 'md' ? 'text-6xl' : 'text-5xl'
  const containerSize = size === 'lg' ? 'w-36 h-36' : size === 'md' ? 'w-24 h-24' : 'w-20 h-20'

  // Get equipped items
  const getEquipped = (category) => {
    const id = equippedAccessories?.[category]
    return id ? ACCESSORIES.find(a => a.id === id) : null
  }

  const hat = getEquipped('hat')
  const eyewear = getEquipped('eyewear')
  const outfit = getEquipped('outfit')
  const misc = getEquipped('misc')

  return (
    <div className={`relative ${containerSize} mx-auto flex items-center justify-center`}>
      {/* Glow orb behind pet */}
      {glowing && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${pet.glowColor} 0%, transparent 70%)`,
            filter: 'blur(15px)',
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Hat overlay */}
      {hat && (
        <motion.div
          className="absolute text-3xl pointer-events-none z-20"
          style={{ top: size === 'lg' ? '-12px' : '-8px', left: '50%', transform: 'translateX(-50%)' }}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {hat.emoji}
        </motion.div>
      )}

      {/* Pet main emoji */}
      <motion.div
        className={`${emojiSize} select-none relative z-10`}
        style={{ filter: glowing ? `drop-shadow(0 0 12px ${pet.color})` : 'none' }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {pet.emoji}
      </motion.div>

      {/* Eyewear overlay */}
      {eyewear && (
        <motion.div
          className="absolute text-2xl pointer-events-none z-20"
          style={{
            top: size === 'lg' ? '30%' : '28%',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {eyewear.emoji}
        </motion.div>
      )}

      {/* Outfit badge */}
      {outfit && (
        <motion.div
          className="absolute text-xl pointer-events-none z-20"
          style={{ bottom: size === 'lg' ? '4px' : '2px', right: size === 'lg' ? '4px' : '2px' }}
          initial={{ scale: 0, rotate: 20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {outfit.emoji}
        </motion.div>
      )}

      {/* Misc aura */}
      {misc && (
        <motion.div
          className="absolute text-lg pointer-events-none z-20"
          style={{ bottom: size === 'lg' ? '4px' : '2px', left: size === 'lg' ? '4px' : '2px' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          {misc.emoji}
        </motion.div>
      )}
    </div>
  )
}
