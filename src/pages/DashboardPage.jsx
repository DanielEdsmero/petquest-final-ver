import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { LogOut, Sparkles, Star, ShoppingBag, Droplets, Heart, Utensils, Shield, Settings, Trophy, Scroll, CheckCircle2, Lightbulb } from 'lucide-react'
import { useGame, DIFF_POINTS } from '../context/GameContext'
import { useCompanion } from '../context/CompanionContext'
import { isGuideDone } from '../data/petCompanion'

const MODE_META = {
  fitness:  { emoji: '💪', label: 'Fitness' },
  saitama:  { emoji: '👊', label: 'Saitama' },
  academic: { emoji: '📚', label: 'Academic' },
  custom:   { emoji: '✨', label: 'Custom' },
}

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
const APRICOT_INK = '#8A4B12'
const CORAL = '#E58A73'
const CORAL_TINT = '#FBE8E3'
const CORAL_INK = '#A3412A'
const LEAF = '#5EAF7B'

/* Plain header button: white, thin border, ink text. */
const NAV_BTN = { background: '#FFFFFF', border: `1px solid ${LINE}`, color: SOFT }

import TaskList from '../components/TaskList'
import PetRoom from '../components/PetRoom'
import StreakCounter from '../components/StreakCounter'
import EvolutionBar from '../components/EvolutionBar'
import EvolutionOverlay from '../components/animations/EvolutionOverlay'
import ConnectionStatus from '../components/ConnectionStatus'
import CountUp from '../components/reactbits/CountUp'
import { getStageForPoints } from '../config/pets'
import { ACCESSORIES } from '../data/accessories'

/* One care stat as a ring, like the phone app. Low (<35) turns coral. */
function StatRing({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  const low = pct < 35
  const r = 22, c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center gap-1" title={`${label} ${pct}%`}>
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${label} ${pct}%`}>
        <circle cx="28" cy="28" r={r} fill="none" stroke={LINE} strokeWidth="6" />
        <motion.circle cx="28" cy="28" r={r} fill="none" stroke={low ? CORAL : color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c} transform="rotate(-90 28 28)"
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.2 }} />
        <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="800" fill={INK} fontFamily="Nunito, sans-serif">{pct}</text>
      </svg>
      <span className="text-xs font-nunito font-semibold" style={{ color: low ? CORAL_INK : SOFT }}>{label}</span>
    </div>
  )
}

function CareButton({ icon: Icon, label, cost, onClick, disabled }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 p-3 rounded-xl"
      style={{
        background: MIST, border: `1px solid ${LINE}`, color: INK,
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      whileHover={!disabled ? { borderColor: TEAL } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <Icon size={20} style={{ color: TEAL_DEEP }} />
      <span className="text-sm font-nunito font-bold">{label}</span>
      <span className="text-xs font-nunito" style={{ color: MUTED }}>-{cost} pts</span>
    </motion.button>
  )
}

function PointsDisplay({ points }) {
  const reduceMotion = useReducedMotion()
  const prevPoints = useRef(points)
  /* Bumped only when points go UP, so spending on care/accessories doesn't
     trigger a reward animation. Doubles as the remount key that replays it. */
  const [gain, setGain] = useState(0)

  useEffect(() => {
    if (points > prevPoints.current) setGain(g => g + 1)
    prevPoints.current = points
  }, [points])

  const animated = gain > 0 && !reduceMotion

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl relative"
      style={{ background: APRICOT_TINT, border: `1px solid ${APRICOT}55` }}
      key={gain}
      animate={animated ? { scale: [1, 1.15, 1] } : { scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <motion.span
        animate={reduceMotion ? {} : { rotate: [0, 20, -20, 0] }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative flex"
      >
        <Star size={18} style={{ color: APRICOT, fill: APRICOT }} />
      </motion.span>
      <div className="relative">
        <div className="font-nunito font-extrabold text-lg leading-none" style={{ color: INK }}>
          <CountUp to={points} separator="," duration={0.8} animateOnMount={false} />
        </div>
        <div className="text-xs font-nunito" style={{ color: APRICOT_INK }}>Points</div>
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const {
    user, profile, logout,
    selectedPet, petStats,
    points,
    feedPet, showerPet, playWithPet,
    equippedAccessories,
    tasks,
    totalPointsEarned, currentStreak, longestStreak, petLevel,
    evolution, clearEvolution,
    streakBroken, clearStreakBroken,
    connection, pendingCount,
  } = useGame()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [actionAnim, setActionAnim] = useState(null)
  const companion = useCompanion()
  const reducedMotion = useReducedMotion()

  /* A student's first visit opens the pet's quick tour once; "Replay the tour" reopens it. */
  useEffect(() => {
    if (!profile?.id || !selectedPet) return
    let store = null
    try { store = window.localStorage } catch { /* blocked storage: skip the auto-open */ return }
    if (!isGuideDone(store, profile.id)) {
      const id = setTimeout(() => companion.openGuide(), 600)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, selectedPet?.id])

  /* Sanity log: confirm the right evolution sprite resolves for this user's pet.
     Remove once the sprites are visually confirmed. */
  useEffect(() => {
    if (!selectedPet?.id) return
    const stage = getStageForPoints(selectedPet.id, totalPointsEarned)
    console.log(`[pets] ${selectedPet.id} · ${totalPointsEarned}pts → ${stage.label} (L${stage.level}) → ${stage.sprite}`)
  }, [selectedPet?.id, totalPointsEarned])

  /* A broken streak plays the pet's sad reaction once, then clears. */
  useEffect(() => {
    if (!streakBroken) return
    setActionAnim('sad')
    const id = setTimeout(() => { setActionAnim(null); clearStreakBroken() }, 1200)
    return () => clearTimeout(id)
  }, [streakBroken, clearStreakBroken])

  const triggerAction = async (actionFn, type) => {
    const success = actionFn()
    if (success !== false) {
      setActionAnim(type)
      // Long enough for the pet's reaction bubble to read.
      setTimeout(() => setActionAnim(null), 900)
    }
  }

  const statWarnings = [
    petStats.hunger < 30 && 'Hungry',
    petStats.cleanliness < 30 && 'Dirty',
    petStats.happiness < 30 && 'Sad',
  ].filter(Boolean)

  const equipped = Object.values(equippedAccessories || {})
    .map(id => ACCESSORIES.find(a => a.id === id))
    .filter(Boolean)

  const reveal = (delay) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay },
  })

  return (
    <div className="theme-light min-h-screen relative z-10 font-nunito">
      <EvolutionOverlay
        evolution={evolution ? { ...evolution, petId: evolution.petId || selectedPet?.id } : null}
        onDone={clearEvolution}
      />

      {/* Top navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-3"
        style={{ borderBottom: `1px solid ${LINE}`, background: '#FFFFFF' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐾</span>
          <span className="font-nunito font-extrabold text-xl hidden sm:block" style={{ color: INK }}>PetQuest</span>
        </div>

        {/* Warnings */}
        <AnimatePresence>
          {statWarnings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-nunito font-bold"
              style={{ background: CORAL_TINT, color: CORAL_INK }}
            >
              ⚠️ {selectedPet?.name} is {statWarnings.join(', ').toLowerCase()}!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right: points + user + logout */}
        <div className="flex items-center gap-1 sm:gap-3">
          <ConnectionStatus connection={connection} pendingCount={pendingCount} />
          <div data-pet-spot="streak"><StreakCounter streak={currentStreak} longest={longestStreak} /></div>
          <div data-pet-spot="points"><PointsDisplay points={points} /></div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: MIST }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: TEAL_TINT, color: TEAL_DEEP }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-nunito font-semibold" style={{ color: INK }}>
              {user?.username}
            </span>
          </div>

          {/* Leaderboard */}
          <motion.button
            onClick={() => navigate('/leaderboard')}
            className="tap-target flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-nunito font-bold"
            style={NAV_BTN}
            whileHover={{ borderColor: TEAL }}
            whileTap={{ scale: 0.93 }}
            title="Leaderboard"
          >
            <Trophy size={15} />
            <span className="hidden md:inline">Leaderboard</span>
          </motion.button>

          {/* Mode badge — guard against a game_mode not in MODE_META so an
              unexpected value can never crash the whole dashboard. */}
          {profile?.game_mode && MODE_META[profile.game_mode] && (() => {
            const m = MODE_META[profile.game_mode]
            return (
              <motion.button
                onClick={() => navigate('/mode-select')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-nunito font-bold"
                style={NAV_BTN}
                whileHover={{ borderColor: TEAL }}
                whileTap={{ scale: 0.93 }}
                title="Change mode"
              >
                {m.emoji} {m.label}
                <Settings size={11} className="opacity-60" />
              </motion.button>
            )
          })()}

          {isAdmin && (
            <motion.button
              onClick={() => navigate('/admin')}
              className="tap-target flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-nunito font-bold"
              style={{ background: TEAL_TINT, border: `1px solid ${TEAL}55`, color: TEAL_DEEP }}
              whileHover={{ borderColor: TEAL }}
              whileTap={{ scale: 0.93 }}
              title="Admin Panel"
            >
              <Shield size={15} />
              <span className="hidden sm:inline">Admin</span>
            </motion.button>
          )}

          <motion.button
            onClick={logout}
            className="tap-target p-2 rounded-xl transition-colors"
            aria-label="Log out"
            style={{ background: CORAL_TINT, border: `1px solid ${CORAL}55`, color: CORAL_INK }}
            whileTap={{ scale: 0.93 }}
            title="Logout"
          >
            <LogOut size={16} />
          </motion.button>
        </div>
      </motion.nav>

      {/* Offline / degraded banner */}
      <AnimatePresence>
        {connection !== 'online' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-20 overflow-hidden"
          >
            <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-nunito font-semibold text-center"
              style={{ background: APRICOT_TINT, borderBottom: `1px solid ${APRICOT}55`, color: APRICOT_INK }}>
              <span>⚠️</span>
              Offline mode — completions are queued and points will be verified when your connection resumes.
              {pendingCount > 0 && <span className="font-black">({pendingCount} pending)</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content. Phone order: pet, quests, care, evolution, shop.
          Desktop: pet column on the left, quests on the right (see .dash-layout). */}
      <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="dash-layout">
          {/* Pet in its home */}
          <motion.section style={{ gridArea: 'room' }} className="glass-card p-3 self-start" {...reveal(0.05)}>
            <PetRoom pet={selectedPet} level={petLevel} stats={petStats} careAction={actionAnim} accessories={equipped} home />
            <div className="flex items-center justify-between gap-2 mt-3 px-1 flex-wrap">
              <div className="min-w-0">
                <h2 className="font-nunito font-extrabold text-xl leading-tight" style={{ color: INK }}>
                  {selectedPet?.name}
                </h2>
                <p className="text-sm font-nunito" style={{ color: MUTED }}>{selectedPet?.species}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-nunito font-bold"
                style={{ background: TEAL_TINT, color: TEAL_DEEP }}>
                <Sparkles size={11} />
                {selectedPet?.trait}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 px-1">
              {!reducedMotion && (
                <button type="button" onClick={() => companion.walk()} disabled={companion.away || companion.dnd}
                  className="tap-target px-3 rounded-xl text-xs font-nunito font-bold"
                  style={{ ...NAV_BTN, opacity: (companion.away || companion.dnd) ? 0.5 : 1 }}>
                  {companion.away ? `${selectedPet?.name} is out` : `Let ${selectedPet?.name} out`}
                </button>
              )}
              <button type="button" onClick={() => companion.setDnd(!companion.dnd)} aria-pressed={companion.dnd}
                className="tap-target px-3 rounded-xl text-xs font-nunito font-bold"
                style={companion.dnd ? { background: TEAL_TINT, border: `1px solid ${TEAL}`, color: TEAL_DEEP } : NAV_BTN}>
                Do not disturb
              </button>
              <button type="button" onClick={() => companion.openGuide()}
                className="tap-target px-2 text-xs font-nunito font-bold underline" style={{ color: TEAL_DEEP }}>
                Replay the tour
              </button>
            </div>
            {equipped.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 px-1">
                {equipped.map(acc => (
                  <span key={acc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-nunito font-bold"
                    style={{ background: MIST, color: SOFT }}>
                    <span>{acc.emoji}</span>{acc.name}
                  </span>
                ))}
              </div>
            )}
          </motion.section>

          {/* Quests */}
          <motion.section style={{ gridArea: 'quests' }} className="flex flex-col gap-4 min-w-0" {...reveal(0.1)}>
            {/* Stats summary — earned points carry the weight, active/completed sit beside them.
                On phone it drops below the quest log so quests sit right under the pet. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 order-2 lg:order-none">
              <div className="glass-card p-4 col-span-2 flex items-center gap-4" style={{ borderLeft: `4px solid ${APRICOT}` }}>
                <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: APRICOT_TINT }}>
                  <Star size={22} style={{ color: APRICOT, fill: APRICOT }} />
                </div>
                <div>
                  <div className="font-nunito font-extrabold text-2xl leading-none" style={{ color: INK }}>
                    <CountUp to={tasks.filter(t => t.completed).length * 10} duration={0.8} animateOnMount={false} />
                    <span className="text-base font-bold" style={{ color: MUTED }}> pts</span>
                  </div>
                  <div className="text-xs font-nunito mt-1 uppercase tracking-wide" style={{ color: MUTED }}>Earned Today</div>
                </div>
              </div>
              {[
                { label: 'Active', value: tasks.filter(t => !t.completed).length, Icon: Scroll, color: TEAL_DEEP },
                { label: 'Completed', value: tasks.filter(t => t.completed).length, Icon: CheckCircle2, color: '#2F7A4D' },
              ].map(({ label, value, Icon, color }) => (
                <div key={label} className="glass-card p-4 flex flex-col justify-center gap-1">
                  <Icon size={16} style={{ color }} />
                  <div className="font-nunito font-extrabold text-xl" style={{ color: INK }}>
                    <CountUp to={value} duration={0.8} animateOnMount={false} />
                  </div>
                  <div className="text-xs font-nunito" style={{ color: MUTED }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Quest log */}
            <div className="glass-card p-5" data-pet-spot="quests">
              <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
                <h3 className="font-nunito font-extrabold text-lg flex items-center gap-2" style={{ color: INK }}>
                  <Star size={16} style={{ color: APRICOT, fill: APRICOT }} />
                  Today's Quests
                </h3>
                <div className="text-xs font-nunito font-semibold px-2 py-1 rounded-lg" style={{ background: TEAL_TINT, color: TEAL_DEEP }}>
                  +{DIFF_POINTS.easy}/{DIFF_POINTS.medium}/{DIFF_POINTS.hard} pts by difficulty
                </div>
              </div>
              <TaskList />
            </div>

            {/* Tips card */}
            <div className="glass-card p-4 order-3 lg:order-none">
              <div className="flex items-start gap-3">
                <Lightbulb size={20} style={{ color: APRICOT_INK, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="font-nunito font-bold text-sm mb-1" style={{ color: INK }}>Quest Tips</p>
                  <p className="text-sm font-nunito leading-relaxed" style={{ color: SOFT }}>
                    Complete quests to earn points. Spend points on pet care or accessories.
                    Your companion's stats decrease over time — keep them happy.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Stats + care */}
          <motion.section style={{ gridArea: 'care' }} data-pet-spot="care" className="glass-card p-5 self-start" {...reveal(0.15)}>
            <h3 className="font-nunito font-bold text-sm mb-3" style={{ color: INK }}>How {selectedPet?.name} is doing</h3>
            <div className="flex justify-around mb-4">
              <StatRing label="Hunger" value={petStats.hunger} color={APRICOT} />
              <StatRing label="Clean" value={petStats.cleanliness} color={TEAL} />
              <StatRing label="Happy" value={petStats.happiness} color={LEAF} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <CareButton icon={Utensils} label="Feed" cost={10} onClick={() => triggerAction(feedPet, 'feed')} disabled={points < 10} />
              <CareButton icon={Droplets} label="Shower" cost={10} onClick={() => triggerAction(showerPet, 'shower')} disabled={points < 10} />
              <CareButton icon={Heart} label="Play" cost={10} onClick={() => triggerAction(playWithPet, 'play')} disabled={points < 10} />
            </div>
            {points < 10 && (
              <p className="text-sm text-center mt-3 font-nunito" style={{ color: CORAL_INK }}>
                Complete quests to earn points!
              </p>
            )}
          </motion.section>

          {/* Evolution */}
          <motion.section style={{ gridArea: 'evo' }} data-pet-spot="evolution" className="glass-card p-5 self-start" {...reveal(0.2)}>
            <h3 className="font-nunito font-bold text-sm mb-3" style={{ color: INK }}>Evolution</h3>
            <EvolutionBar totalEarned={totalPointsEarned} petName={selectedPet?.name} />
          </motion.section>

          {/* Accessories shortcut */}
          <motion.button
            style={{ gridArea: 'shop' }}
            data-pet-spot="shop"
            className="w-full glass-card p-4 flex items-center justify-between self-start cursor-pointer"
            onClick={() => navigate('/accessories')}
            whileHover={{ borderColor: TEAL }}
            whileTap={{ scale: 0.98 }}
            {...reveal(0.25)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: TEAL_TINT }}>
                <ShoppingBag size={18} style={{ color: TEAL_DEEP }} />
              </div>
              <div className="text-left">
                <p className="font-nunito font-bold text-sm" style={{ color: INK }}>Accessories Shop</p>
                <p className="font-nunito text-sm" style={{ color: MUTED }}>Customize your companion</p>
              </div>
            </div>
            <span aria-hidden="true" style={{ color: TEAL_DEEP }}>→</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
}
