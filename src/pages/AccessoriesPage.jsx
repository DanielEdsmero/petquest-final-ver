import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { ACCESSORIES, RARITY_COLORS, CATEGORIES } from '../data/accessories'
import PetRoom from '../components/PetRoom'
import CountUp from '../components/reactbits/CountUp'

/* Light palette — same values as apps/mobile/src/theme.ts. */
const INK = '#102A43'
const SOFT = '#3E5165'
const MUTED = '#667085'
const TEAL = '#3F8580'
const TEAL_DEEP = '#2F6F6B'
const TEAL_TINT = '#E4EFEE'
const MIST = '#F3F5F2'
const LINE = '#E1E7E3'
const APRICOT = '#EBA66E'
const APRICOT_TINT = '#FBEEDF'

function AccessoryCard({ accessory, owned, equipped, onBuy, onEquip, points }) {
  const rarity = RARITY_COLORS[accessory.rarity]
  const canAfford = points >= accessory.cost

  return (
    <div
      className="w-40 flex-none md:flex-1 md:w-auto md:min-w-[150px] md:max-w-[200px] snap-start rounded-2xl p-3 flex flex-col gap-2 bg-white"
      style={{ border: equipped ? `2px solid ${TEAL}` : `1px solid ${LINE}`, padding: equipped ? 11 : 12 }}
    >
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: MIST }}>
          {accessory.emoji}
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ color: rarity.text, background: rarity.bg, border: `1px solid ${rarity.border}` }}>
          {accessory.rarity}
        </span>
      </div>

      <div className="flex-1">
        <h4 className="font-bold text-sm" style={{ color: INK }}>{accessory.name}</h4>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: MUTED }}>{accessory.description}</p>
      </div>

      {owned ? (
        <motion.button
          onClick={() => onEquip(accessory)}
          className="w-full min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
          style={equipped
            ? { background: '#FFFFFF', border: `1px solid ${TEAL}`, color: TEAL_DEEP }
            : { background: TEAL_TINT, border: `1px solid ${TEAL_TINT}`, color: TEAL_DEEP }}
          whileTap={{ scale: 0.95 }}
          aria-label={equipped ? `Take off ${accessory.name}` : `Equip ${accessory.name}`}
        >
          {equipped ? <><Check size={15} /> Equipped</> : 'Equip'}
        </motion.button>
      ) : (
        <motion.button
          onClick={() => onBuy(accessory)}
          disabled={!canAfford}
          className="w-full min-h-[44px] rounded-xl text-sm font-bold"
          style={canAfford
            ? { background: TEAL_DEEP, color: '#FFFFFF', cursor: 'pointer' }
            : { background: MIST, color: MUTED, cursor: 'not-allowed' }}
          whileTap={canAfford ? { scale: 0.95 } : {}}
        >
          {canAfford ? `Buy · ${accessory.cost} pts` : `Need ${accessory.cost} pts`}
        </motion.button>
      )}
    </div>
  )
}

export default function AccessoriesPage() {
  const navigate = useNavigate()
  const {
    selectedPet,
    points,
    petLevel,
    petStats,
    ownedAccessories,
    equippedAccessories,
    buyAccessory,
    equipAccessory,
  } = useGame()

  // Category order, so the floating glyphs read hat → eyewear → outfit → misc.
  const equipped = CATEGORIES
    .map(c => ACCESSORIES.find(a => a.id === equippedAccessories[c.id]))
    .filter(Boolean)
  const shelves = CATEGORIES.filter(c => c.id !== 'all')

  return (
    <div className="theme-light min-h-screen relative z-10 font-nunito">
      {/* Top nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex items-center justify-between gap-3 px-4 md:px-8 py-3"
        style={{ borderBottom: `1px solid ${LINE}`, background: '#FFFFFF' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="min-h-[44px] flex items-center gap-2 px-3 rounded-xl text-sm font-semibold"
            style={{ background: '#FFFFFF', border: `1px solid ${LINE}`, color: SOFT }}
            whileHover={{ borderColor: TEAL }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft size={15} />
            Dashboard
          </motion.button>
          <h1 className="font-extrabold text-lg truncate" style={{ color: INK }}>Accessories</h1>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0"
          style={{ background: APRICOT_TINT, border: `1px solid ${APRICOT}55` }}>
          <span>⭐</span>
          {/* Ticks down as you spend, so the cost of a purchase is felt. */}
          <span className="font-extrabold" style={{ color: INK }}>
            <CountUp to={points} separator="," duration={0.9} />
          </span>
          <span className="text-xs" style={{ color: SOFT }}>pts</span>
        </div>
      </motion.nav>

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Room banner: the pet wearing what's equipped */}
        <motion.section
          data-pet-spot="shelf"
          className="glass-card p-3 flex flex-col md:flex-row md:items-center gap-4"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        >
          <PetRoom pet={selectedPet} level={petLevel} stats={petStats} accessories={equipped}
            className="w-full md:w-80 flex-none" />
          <div className="px-1 pb-1 md:pb-0">
            <h2 className="font-extrabold text-xl" style={{ color: INK }}>{selectedPet?.name} is wearing</h2>
            {equipped.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {equipped.map(acc => (
                  <button key={acc.id} onClick={() => equipAccessory(acc)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 pl-3 pr-2 rounded-xl text-sm font-bold"
                    style={{ background: MIST, color: INK, border: `1px solid ${LINE}` }}
                    aria-label={`Take off ${acc.name}`} title="Take off">
                    <span>{acc.emoji}</span>{acc.name}<X size={14} style={{ color: MUTED }} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm mt-2" style={{ color: MUTED }}>Nothing yet.</p>
            )}
            <p className="text-sm mt-3" style={{ color: SOFT }}>
              Buy an item with your quest points, then equip it. Tap an equipped item to take it off.
            </p>
          </div>
        </motion.section>

        {/* One shelf per category; each scrolls sideways */}
        {shelves.map((cat, i) => {
          const items = ACCESSORIES.filter(a => a.category === cat.id)
          return (
            <motion.section key={cat.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * (i + 1) }}>
              <h3 className="font-extrabold text-lg mb-3" style={{ color: INK }}>
                {cat.label} <span className="text-sm font-semibold" style={{ color: MUTED }}>{items.length}</span>
              </h3>
              <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-4 px-4 md:mx-0 md:px-0" role="list" aria-label={cat.label}>
                {items.map(acc => (
                  <div role="listitem" key={acc.id} className="flex md:flex-1 md:max-w-[200px]">
                    <AccessoryCard
                      accessory={acc}
                      owned={ownedAccessories.includes(acc.id)}
                      equipped={equippedAccessories[acc.category] === acc.id}
                      onBuy={buyAccessory}
                      onEquip={equipAccessory}
                      points={points}
                    />
                  </div>
                ))}
              </div>
            </motion.section>
          )
        })}
      </div>
    </div>
  )
}
