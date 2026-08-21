import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { LogOut, Sparkles, Star, ShoppingBag, Droplets, Heart, Utensils, Shield, Settings, Trophy, Scroll, CheckCircle2, Lightbulb } from 'lucide-react'
import { useGame, DIFF_POINTS } from '../context/GameContext'

const MODE_META = {
  fitness:  { emoji: '💪', label: 'Fitness',  color: '#f43f5e' },
  saitama:  { emoji: '👊', label: 'Saitama',  color: '#facc15' },
  academic: { emoji: '📚', label: 'Academic', color: '#06b6d4' },
  custom:   { emoji: '✨', label: 'Custom',   color: '#f5a31a' },
}

/* Per-care-action feedback: the emoji that floats up and the tint wash. */
const CARE_META = {
  feed:   { emoji: '🍖', tint: '#f59e0b' },
  shower: { emoji: '🛁', tint: '#06b6d4' },
  play:   { emoji: '✨', tint: '#a78bfa' },
}
import StatBar from '../components/StatBar'
import TaskList from '../components/TaskList'
import PetAvatar from '../components/PetAvatar'
import FloatingText from '../components/animations/FloatingText'
import StreakCounter from '../components/StreakCounter'
import EvolutionBar from '../components/EvolutionBar'
import EvolutionOverlay from '../components/animations/EvolutionOverlay'
import ConnectionStatus from '../components/ConnectionStatus'
import CountUp from '../components/reactbits/CountUp'
import { getStageForPoints } from '../config/pets'

function CareButton({ icon: Icon, label, cost, color, glowColor, onClick, disabled }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all relative overflow-hidden"
      style={{
        background: disabled ? 'rgba(30, 30, 60, 0.4)' : `${color}18`,
        border: `1px solid ${disabled ? 'rgba(50,50,80,0.5)' : `${color}40`}`,
        color: disabled ? '#404060' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      whileHover={!disabled ? { scale: 1.05, boxShadow: `0 0 20px ${glowColor}` } : {}}
      whileTap={!disabled ? { scale: 0.93 } : {}}
    >
      <Icon size={22} />
      <span className="text-xs font-nunito font-bold">{label}</span>
      <span className="text-xs font-nunito opacity-70">-{cost} pts</span>
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
      className="flex items-center gap-2 px-4 py-2 rounded-xl relative"
      style={{
        background: 'rgba(245, 163, 26, 0.1)',
        border: '1px solid rgba(245, 163, 26, 0.3)',
      }}
      key={gain}
      animate={animated ? { scale: [1, 1.2, 1] } : { scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {animated && (
        <motion.div
          className="points-glow"
          initial={{ opacity: 0.85, scale: 0.7 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}

      <motion.span
        animate={reduceMotion ? {} : { rotate: [0, 20, -20, 0] }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative flex"
        style={{ zIndex: 1 }}
      >
        <Star size={20} style={{ color: '#ffd166', fill: '#ffd166' }} />
      </motion.span>
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="font-cinzel font-black text-lg leading-none"
          style={{ color: '#ffd166', textShadow: '0 0 16px rgba(245,163,26,0.35)' }}>
          <CountUp to={points} separator="," duration={0.8} animateOnMount={false} />
        </div>
        <div className="text-xs font-nunito" style={{ color: 'var(--text-soft)' }}>Points</div>
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
      // Long enough for the pet reaction (800ms) and the floating emoji to finish.
      setTimeout(() => setActionAnim(null), 900)
    }
  }

  const completedToday = tasks.filter(t => t.completed).length
  const statWarnings = [
    petStats.hunger < 30 && 'Hungry',
    petStats.cleanliness < 30 && 'Dirty',
    petStats.happiness < 30 && 'Sad',
  ].filter(Boolean)

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-deep)' }}>
      <EvolutionOverlay
        evolution={evolution ? { ...evolution, petId: evolution.petId || selectedPet?.id } : null}
        onDone={clearEvolution}
      />

      {/* Top navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-4"
        style={{ borderBottom: '1px solid var(--card-border)', background: '#0d1120' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐾</span>
          <span className="font-cinzel font-black text-xl hidden sm:block"
            style={{ color: '#ffd166', textShadow: '0 0 16px rgba(245,163,26,0.3)' }}>Pet Quest</span>
        </div>

        {/* Warnings */}
        <AnimatePresence>
          {statWarnings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-nunito font-bold"
              style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185' }}
            >
              ⚠️ {selectedPet?.name} is {statWarnings.join(', ').toLowerCase()}!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right: points + user + logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectionStatus connection={connection} pendingCount={pendingCount} />
          <StreakCounter streak={currentStreak} longest={longestStreak} />
          <PointsDisplay points={points} />

          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(245, 163, 26, 0.2)', color: '#f5a31a' }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-nunito font-semibold" style={{ color: '#c0b0ff' }}>
              {user?.username}
            </span>
          </div>

          {/* Leaderboard */}
          <motion.button
            onClick={() => navigate('/leaderboard')}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-nunito font-bold"
            style={{ background: 'rgba(245,163,26,0.1)', border: '1px solid rgba(245,163,26,0.25)', color: '#f5a31a' }}
            whileHover={{ background: 'rgba(245,163,26,0.2)' }}
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
                style={{ background: m.color + '12', border: `1px solid ${m.color}35`, color: m.color }}
                whileHover={{ background: m.color + '22' }}
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-nunito font-bold"
              style={{ background: 'rgba(245,163,26,0.12)', border: '1px solid rgba(245,163,26,0.35)', color: '#f5a31a' }}
              whileHover={{ background: 'rgba(245,163,26,0.22)' }}
              whileTap={{ scale: 0.93 }}
              title="Admin Panel"
            >
              <Shield size={15} />
              <span className="hidden sm:inline">Admin</span>
            </motion.button>
          )}

          <motion.button
            onClick={logout}
            className="p-2 rounded-xl transition-colors"
            style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', color: '#fb7185' }}
            whileHover={{ background: 'rgba(244, 63, 94, 0.18)' }}
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
              style={{ background: 'rgba(245, 163, 26, 0.12)', borderBottom: '1px solid rgba(245, 163, 26, 0.3)', color: '#f5a31a' }}>
              <span>⚠️</span>
              Offline mode — completions are queued and points will be verified when your connection resumes.
              {pendingCount > 0 && <span className="font-black">({pendingCount} pending)</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 dashboard-grid">
          {/* === PET PANEL (left, 2 cols) === */}
          <motion.div
            className="lg:col-span-2 space-y-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Pet display card */}
            <div className="glass-card p-6 text-center relative overflow-hidden">
              {/* Background shimmer based on pet color */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${selectedPet?.color}15 0%, transparent 70%)` }} />

              {/* Action tint wash */}
              <AnimatePresence>
                {actionAnim && (
                  <motion.div
                    className="absolute inset-0 rounded-2xl pointer-events-none z-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ background: `${CARE_META[actionAnim]?.tint || selectedPet?.color}15` }}
                  />
                )}
              </AnimatePresence>

              {/* Pet avatar + rising care emoji */}
              <div className="relative z-10">
                <PetAvatar
                  pet={selectedPet}
                  equippedAccessories={equippedAccessories}
                  size="lg"
                  glowing={true}
                  careAction={actionAnim}
                  level={petLevel}
                />
                <FloatingText
                  show={!!actionAnim}
                  color={CARE_META[actionAnim]?.tint || '#f5a31a'}
                  fontSize="1.6rem"
                  rise={70}
                >
                  +{CARE_META[actionAnim]?.emoji}
                </FloatingText>
              </div>

              {/* Pet name & species */}
              <motion.div className="mt-4 relative z-10">
                <h2 className="font-cinzel font-black text-2xl" style={{ color: selectedPet?.color }}>
                  {selectedPet?.name}
                </h2>
                <p className="text-xs font-nunito uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {selectedPet?.species}
                </p>
              </motion.div>

              {/* Trait badge */}
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-nunito font-bold"
                style={{ background: `${selectedPet?.color}15`, color: selectedPet?.color, border: `1px solid ${selectedPet?.color}30` }}>
                <Sparkles size={10} />
                {selectedPet?.trait}
              </div>
            </div>

            {/* Evolution card */}
            <div className="glass-card p-5">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Evolution
              </h3>
              <EvolutionBar totalEarned={totalPointsEarned} petName={selectedPet?.name} />
            </div>

            {/* Stats card */}
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Companion Stats
              </h3>
              <StatBar stat="hunger" value={petStats.hunger} />
              <StatBar stat="cleanliness" value={petStats.cleanliness} />
              <StatBar stat="happiness" value={petStats.happiness} />
            </div>

            {/* Care actions */}
            <div className="glass-card p-5">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                Care Actions <span className="normal-case font-nunito font-normal" style={{ color: 'var(--text-muted)' }}>(10 pts each)</span>
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <CareButton
                  icon={Utensils}
                  label="Feed"
                  cost={10}
                  color="#f59e0b"
                  glowColor="rgba(245, 158, 11, 0.4)"
                  onClick={() => triggerAction(feedPet, 'feed')}
                  disabled={points < 10}
                />
                <CareButton
                  icon={Droplets}
                  label="Shower"
                  cost={10}
                  color="#06b6d4"
                  glowColor="rgba(6, 182, 212, 0.4)"
                  onClick={() => triggerAction(showerPet, 'shower')}
                  disabled={points < 10}
                />
                <CareButton
                  icon={Heart}
                  label="Play"
                  cost={10}
                  color="#a78bfa"
                  glowColor="rgba(167, 139, 250, 0.4)"
                  onClick={() => triggerAction(playWithPet, 'play')}
                  disabled={points < 10}
                />
              </div>

              {points < 10 && (
                <p className="text-xs text-center mt-3 font-nunito" style={{ color: '#f43f5e' }}>
                  ⚠️ Complete quests to earn points!
                </p>
              )}
            </div>

            {/* Accessories shortcut */}
            <motion.button
              className="w-full glass-card p-4 flex items-center justify-between group cursor-pointer"
              onClick={() => navigate('/accessories')}
              whileHover={{ borderColor: 'var(--card-border-hi)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(245, 163, 26, 0.12)' }}>
                  <ShoppingBag size={18} style={{ color: '#f5a31a' }} />
                </div>
                <div className="text-left">
                  <p className="font-nunito font-bold text-sm" style={{ color: '#f5a31a' }}>Accessories Shop</p>
                  <p className="font-nunito text-xs" style={{ color: 'var(--text-muted)' }}>Customize your companion</p>
                </div>
              </div>
              <ShoppingBag size={16} style={{ color: '#f5a31a' }} className="group-hover:scale-110 transition-transform" />
            </motion.button>
          </motion.div>

          {/* === QUEST PANEL (right, 3 cols) === */}
          <motion.div
            className="lg:col-span-3 space-y-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Stats summary — asymmetric: earned points carry the weight,
                active/completed sit compact beside them. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Earned today — the prominent metric (spans two columns) */}
              <div className="glass-card p-4 sm:col-span-2 flex items-center gap-4"
                style={{ borderLeft: '3px solid #f5a31a' }}>
                <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,163,26,0.12)' }}>
                  <Star size={22} style={{ color: '#f5a31a', fill: '#f5a31a' }} />
                </div>
                <div>
                  <div className="font-cinzel font-black text-2xl leading-none" style={{ color: '#ffd166' }}>
                    <CountUp to={tasks.filter(t => t.completed).length * 10} duration={0.8} animateOnMount={false} />
                    <span className="text-base font-nunito font-bold" style={{ color: 'var(--text-muted)' }}> pts</span>
                  </div>
                  <div className="text-xs font-nunito mt-1 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Earned Today
                  </div>
                </div>
              </div>

              {/* Active + completed — compact */}
              {[
                { label: 'Active', value: tasks.filter(t => !t.completed).length, Icon: Scroll, color: '#a78bfa' },
                { label: 'Completed', value: tasks.filter(t => t.completed).length, Icon: CheckCircle2, color: '#22c55e' },
              ].map(({ label, value, Icon, color }) => (
                <div key={label} className="glass-card p-4 flex flex-col justify-center gap-1">
                  <Icon size={16} style={{ color }} />
                  <div className="font-cinzel font-black text-xl" style={{ color }}>
                    <CountUp to={value} duration={0.8} animateOnMount={false} />
                  </div>
                  <div className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Quest log */}
            <div className="glass-card p-5 flex-1">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-cinzel font-bold text-base flex items-center gap-2">
                  <Star size={16} style={{ color: '#f5a31a' }} />
                  Quest Log
                </h3>
                <div className="text-xs font-nunito px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(245, 163, 26, 0.1)', color: '#f5a31a', border: '1px solid rgba(245, 163, 26, 0.2)' }}>
                  +{DIFF_POINTS.easy}/{DIFF_POINTS.medium}/{DIFF_POINTS.hard} pts by difficulty
                </div>
              </div>
              <TaskList />
            </div>

            {/* Tips card */}
            <div className="glass-card p-4">
              <div className="flex items-start gap-3">
                <Lightbulb size={20} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="font-nunito font-bold text-sm mb-1" style={{ color: '#a78bfa' }}>Quest Tips</p>
                  <p className="text-xs font-nunito leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                    Complete quests to earn points. Spend points on pet care or accessories.
                    Your companion's stats decrease over time — keep them happy.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
