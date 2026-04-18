import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ShoppingCart, CheckCircle, Sparkles } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { ACCESSORIES, RARITY_COLORS, CATEGORIES } from '../data/accessories'
import PetAvatar from '../components/PetAvatar'

function AccessoryCard({ accessory, owned, equipped, onBuy, onEquip, points }) {
  const rarity = RARITY_COLORS[accessory.rarity]
  const canAfford = points >= accessory.cost || owned

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`acc-card p-4 flex flex-col gap-3 ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}`}
      style={{
        background: equipped
          ? 'rgba(245, 163, 26, 0.07)'
          : owned
          ? 'rgba(34, 197, 94, 0.04)'
          : 'rgba(14, 14, 46, 0.7)',
      }}
    >
      {/* Top: emoji + rarity badge */}
      <div className="flex items-start justify-between">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
          style={{
            background: equipped
              ? 'rgba(245, 163, 26, 0.15)'
              : `${rarity.bg}`,
            border: `1px solid ${equipped ? 'rgba(245, 163, 26, 0.4)' : rarity.border}`,
          }}
        >
          {accessory.emoji}
        </div>
        <div
          className="text-xs font-bold font-nunito px-2 py-0.5 rounded-full"
          style={{ color: rarity.text, background: rarity.bg, border: `1px solid ${rarity.border}` }}
        >
          {accessory.rarity}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1">
        <h4 className="font-nunito font-bold text-sm" style={{ color: '#e2e2ff' }}>
          {accessory.name}
        </h4>
        <p className="text-xs font-nunito mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {accessory.description}
        </p>
      </div>

      {/* Category tag */}
      <div className="text-xs font-nunito font-semibold uppercase tracking-wider" style={{ color: '#5050aa' }}>
        {accessory.category}
      </div>

      {/* Action button */}
      {owned ? (
        <motion.button
          onClick={() => onEquip(accessory)}
          className="w-full py-2 rounded-xl text-xs font-bold font-nunito transition-all"
          style={{
            background: equipped ? 'rgba(245, 163, 26, 0.15)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${equipped ? 'rgba(245, 163, 26, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`,
            color: equipped ? '#f5a31a' : '#4ade80',
          }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          {equipped ? '✦ Equipped' : '⚙ Equip'}
        </motion.button>
      ) : (
        <motion.button
          onClick={() => onBuy(accessory)}
          disabled={!canAfford}
          className="w-full py-2 rounded-xl text-xs font-bold font-nunito flex items-center justify-center gap-1.5 transition-all"
          style={{
            background: canAfford ? 'rgba(245, 163, 26, 0.12)' : 'rgba(30, 30, 60, 0.4)',
            border: `1px solid ${canAfford ? 'rgba(245, 163, 26, 0.35)' : 'rgba(50,50,80,0.5)'}`,
            color: canAfford ? '#f5a31a' : '#404060',
            cursor: canAfford ? 'pointer' : 'not-allowed',
          }}
          whileTap={canAfford ? { scale: 0.95 } : {}}
          whileHover={canAfford ? { scale: 1.02 } : {}}
        >
          <span>⭐</span>
          {accessory.cost} pts
          {!canAfford && <span className="ml-1 opacity-70">(Need more)</span>}
        </motion.button>
      )}
    </motion.div>
  )
}

export default function AccessoriesPage() {
  const navigate = useNavigate()
  const {
    selectedPet,
    points,
    ownedAccessories,
    equippedAccessories,
    buyAccessory,
    equipAccessory,
  } = useGame()

  const [activeCategory, setActiveCategory] = useState('all')
  const [previewEquipped, setPreviewEquipped] = useState(null)

  const filteredAccessories = activeCategory === 'all'
    ? ACCESSORIES
    : ACCESSORIES.filter(a => a.category === activeCategory)

  const handleBuy = (accessory) => {
    buyAccessory(accessory)
  }

  const handleEquip = (accessory) => {
    equipAccessory(accessory)
  }

  // Count owned by rarity
  const ownedCount = ownedAccessories.length
  const equippedCount = Object.keys(equippedAccessories).length

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245, 163, 26, 0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Top nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-4"
        style={{ borderBottom: '1px solid rgba(124, 58, 237, 0.12)', background: 'rgba(6, 6, 26, 0.8)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={{ background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.25)', color: '#a78bfa' }}
            whileHover={{ background: 'rgba(124, 58, 237, 0.2)' }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft size={15} />
            Dashboard
          </motion.button>
          <div className="hidden sm:block">
            <h1 className="font-cinzel font-bold text-lg gradient-text-gold">Accessories Shop</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
            <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.08)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              {ownedCount} owned
            </span>
            <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(245, 163, 26, 0.08)', color: '#f5a31a', border: '1px solid rgba(245, 163, 26, 0.2)' }}>
              {equippedCount} equipped
            </span>
          </div>

          {/* Points */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(245, 163, 26, 0.1)', border: '1px solid rgba(245, 163, 26, 0.3)' }}>
            <span className="text-lg">⭐</span>
            <span className="font-cinzel font-black gradient-text-gold">{points.toLocaleString()}</span>
            <span className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>pts</span>
          </div>
        </div>
      </motion.nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* === LEFT: Pet Preview === */}
          <motion.div
            className="lg:col-span-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="glass-card p-6 text-center sticky top-6">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                Preview
              </h3>

              {/* Pet with currently equipped accessories */}
              <div className="py-4">
                <PetAvatar
                  pet={selectedPet}
                  equippedAccessories={equippedAccessories}
                  size="lg"
                  glowing={true}
                />
              </div>

              <h2 className="font-cinzel font-bold text-lg mt-2" style={{ color: selectedPet?.color }}>
                {selectedPet?.name}
              </h2>
              <p className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
                {selectedPet?.species}
              </p>

              {/* Equipped list */}
              {Object.keys(equippedAccessories).length > 0 && (
                <div className="mt-5 space-y-2 text-left">
                  <p className="text-xs font-nunito uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Equipped
                  </p>
                  {Object.entries(equippedAccessories).map(([cat, id]) => {
                    const acc = ACCESSORIES.find(a => a.id === id)
                    if (!acc) return null
                    return (
                      <motion.div
                        key={cat}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                        style={{ background: 'rgba(245, 163, 26, 0.08)', border: '1px solid rgba(245, 163, 26, 0.15)' }}
                      >
                        <span className="text-base">{acc.emoji}</span>
                        <span className="text-xs font-nunito font-semibold" style={{ color: '#f5a31a' }}>{acc.name}</span>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              {Object.keys(equippedAccessories).length === 0 && (
                <p className="text-xs font-nunito mt-4" style={{ color: 'var(--text-muted)' }}>
                  No accessories equipped yet
                </p>
              )}
            </div>
          </motion.div>

          {/* === RIGHT: Accessories Grid === */}
          <motion.div
            className="lg:col-span-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Page title (mobile) */}
            <div className="lg:hidden mb-4">
              <h1 className="font-cinzel font-bold text-2xl gradient-text-gold">Accessories Shop</h1>
              <p className="text-sm font-nunito mt-1" style={{ color: 'var(--text-muted)' }}>
                Customize {selectedPet?.name} with unique items
              </p>
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {CATEGORIES.map(cat => (
                <motion.button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="px-4 py-2 rounded-xl text-sm font-nunito font-bold transition-all"
                  style={{
                    background: activeCategory === cat.id ? 'rgba(245, 163, 26, 0.15)' : 'rgba(19, 19, 58, 0.6)',
                    border: `1px solid ${activeCategory === cat.id ? 'rgba(245, 163, 26, 0.5)' : 'rgba(124, 58, 237, 0.2)'}`,
                    color: activeCategory === cat.id ? '#f5a31a' : '#8080aa',
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {cat.label}
                  <span className="ml-1.5 text-xs opacity-60">
                    ({cat.id === 'all' ? ACCESSORIES.length : ACCESSORIES.filter(a => a.category === cat.id).length})
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Info banner */}
            <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
              style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
              <Sparkles size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
              <p className="text-xs font-nunito" style={{ color: '#9090bb' }}>
                <strong style={{ color: '#c4b5fd' }}>Buy</strong> an item to add it to your collection, then <strong style={{ color: '#c4b5fd' }}>Equip</strong> it on your companion.
                Click an equipped item to unequip it.
              </p>
            </div>

            {/* Accessories grid */}
            <motion.div
              layout
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-4"
            >
              <AnimatePresence mode="popLayout">
                {filteredAccessories.map(acc => (
                  <AccessoryCard
                    key={acc.id}
                    accessory={acc}
                    owned={ownedAccessories.includes(acc.id)}
                    equipped={equippedAccessories[acc.category] === acc.id}
                    onBuy={handleBuy}
                    onEquip={handleEquip}
                    points={points}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {filteredAccessories.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🎭</div>
                <p className="font-nunito" style={{ color: 'var(--text-muted)' }}>
                  No items in this category yet
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
