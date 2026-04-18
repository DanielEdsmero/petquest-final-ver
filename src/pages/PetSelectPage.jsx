import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { PETS } from '../data/pets'

const RARITY_BADGE = {
  Legendary: { color: '#f5a31a', bg: 'rgba(245, 163, 26, 0.15)' },
  Epic: { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
  Rare: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
}

function PetCard({ pet, selected, onSelect }) {
  const badge = RARITY_BADGE[pet.rarity]

  return (
    <motion.div
      className="relative cursor-pointer rounded-2xl p-6 flex flex-col items-center text-center"
      style={{
        background: selected
          ? `linear-gradient(135deg, ${pet.color}22 0%, rgba(14, 14, 46, 0.95) 100%)`
          : 'rgba(14, 14, 46, 0.7)',
        border: `2px solid ${selected ? pet.color : 'rgba(124, 58, 237, 0.2)'}`,
        boxShadow: selected ? `0 0 30px ${pet.glowColor}, 0 8px 32px rgba(0,0,0,0.5)` : '0 4px 24px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(20px)',
        transition: 'all 0.3s ease',
      }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(pet.id)}
    >
      {/* Rarity badge */}
      <div className="absolute top-3 right-3 text-xs font-bold font-nunito px-2 py-0.5 rounded-full"
        style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.color}40` }}>
        {pet.rarity}
      </div>

      {/* Selection ring */}
      {selected && (
        <motion.div
          className="absolute inset-0 rounded-2xl"
          style={{ border: `2px solid ${pet.color}`, boxShadow: `inset 0 0 20px ${pet.glowColor}` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}

      {/* Pet emoji */}
      <motion.div
        className="text-8xl mb-4 relative"
        style={{ filter: selected ? `drop-shadow(0 0 16px ${pet.color})` : 'none' }}
        animate={selected ? { y: [0, -8, 0] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {pet.emoji}
        {selected && (
          <motion.div
            className="absolute -inset-4 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${pet.glowColor} 0%, transparent 70%)` }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* Pet info */}
      <h3 className="font-cinzel font-bold text-xl mb-0.5" style={{ color: selected ? pet.color : '#e2e2ff' }}>
        {pet.name}
      </h3>
      <p className="text-xs font-nunito uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
        {pet.species}
      </p>
      <p className="text-sm font-nunito leading-relaxed" style={{ color: '#9090bb' }}>
        {pet.description}
      </p>

      {/* Trait */}
      <div className="mt-4 px-3 py-1 rounded-full text-xs font-nunito font-semibold"
        style={{ background: `${pet.color}18`, color: pet.color, border: `1px solid ${pet.color}30` }}>
        ✦ {pet.trait}
      </div>

      {/* Select indicator */}
      <div className={`mt-4 w-full py-2 rounded-xl text-sm font-bold font-nunito transition-all duration-300 ${selected ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: `${pet.color}20`, color: pet.color }}>
        ✓ Selected
      </div>
    </motion.div>
  )
}

export default function PetSelectPage() {
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const { selectPet, user } = useGame()
  const navigate = useNavigate()

  const selectedPet = PETS.find(p => p.id === selected)

  const handleConfirm = async () => {
    if (!selected) return
    setConfirming(true)
    await new Promise(r => setTimeout(r, 600))
    selectPet(selected)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.07) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-nunito uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
            Welcome, {user?.username}
          </p>
          <h1 className="font-cinzel font-black text-4xl md:text-5xl gradient-text-gold mb-3">
            Choose Your Companion
          </h1>
          <p className="font-nunito text-base" style={{ color: '#8080aa' }}>
            Your chosen companion will join you on every quest. Choose wisely.
          </p>
        </motion.div>

        {/* Pet cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {PETS.map((pet, i) => (
            <motion.div
              key={pet.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
            >
              <PetCard
                pet={pet}
                selected={selected === pet.id}
                onSelect={setSelected}
              />
            </motion.div>
          ))}
        </div>

        {/* Confirm button */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex justify-center"
            >
              <motion.button
                className="btn-gold px-10 py-4 text-lg font-cinzel font-bold tracking-wide"
                onClick={handleConfirm}
                disabled={confirming}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {confirming ? (
                  <span className="flex items-center gap-3">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}>
                      ⚙️
                    </motion.span>
                    Bonding with {selectedPet?.name}...
                  </span>
                ) : (
                  `✦  Embark with ${selectedPet?.name}`
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {!selected && (
          <p className="text-center text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
            Select a companion to continue your journey
          </p>
        )}
      </div>
    </div>
  )
}
