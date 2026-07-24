import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { LogOut, Sparkles, Star, ShoppingBag, Droplets, Heart, Utensils, Shield, Settings, Trophy } from 'lucide-react'
import { useGame } from '../context/GameContext'

const MODE_META = {
  fitness:  { emoji: '💪', label: 'Fitness',  color: '#f43f5e' },
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
import StreakMilestoneOverlay from '../components/animations/StreakMilestoneOverlay'
import CountUp from '../components/reactbits/CountUp'
import SpotlightCard from '../components/reactbits/SpotlightCard'
import Aurora from '../components/reactbits/Aurora'

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
        className="text-xl relative"
        style={{ zIndex: 1 }}
      >
        ⭐
      </motion.span>
      <div className="relative" style={{ zIndex: 1 }}>
        {/* The counter springs to each new total rather than snapping, so
            earning points reads as a climb. CountUp re-targets whenever
            `to` changes, which is exactly the spend/earn cycle here. */}
        <div className="font-cinzel font-black text-lg leading-none gradient-text-gold">
          <CountUp to={points} separator="," duration={1.1} />
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
    streakMilestone, clearStreakMilestone,
    streakBroken, clearStreakBroken,
    connection, pendingCount,
  } = useGame()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [actionAnim, setActionAnim] = useState(null)

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
        evolution={evolution}
        petEmoji={selectedPet?.emoji}
        onDone={clearEvolution}
      />

      <StreakMilestoneOverlay
        milestone={streakMilestone}
        onDone={clearStreakMilestone}
      />

      {/* Slow aurora, in the app's own gold / arcane / teal. Amplitude and
          blend are kept low so it reads as atmosphere behind the cards rather
          than something competing with them for attention. */}
      <div className="dashboard-aurora">
        <Aurora
          colorStops={['#f5a31a', '#7c3aed', '#06b6d4']}
          amplitude={0.7}
          blend={0.6}
          speed={0.4}
        />
      </div>

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-50"
          style={{ background: `radial-gradient(circle, ${selectedPet?.glowColor || 'rgba(124,58,237,0.1)'} 0%, transparent 70%)`, filter: 'blur(80px)' }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Top navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-4"
        style={{ borderBottom: '1px solid rgba(124, 58, 237, 0.12)', background: 'rgba(6, 6, 26, 0.7)', backdropFilter: 'blur(20px)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐾</span>
          <span className="font-cinzel font-black text-xl gradient-text-gold hidden sm:block">Pet Quest</span>
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

          {/* Mode badge */}
          {profile?.game_mode && (() => {
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
            <SpotlightCard
              baseClassName="glass-card p-6 text-center"
              spotlightColor={`${selectedPet?.color || '#7c3aed'}33`}
            >
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
            </SpotlightCard>

            {/* Evolution card */}
            <SpotlightCard baseClassName="glass-card p-5" spotlightColor="rgba(245, 163, 26, 0.2)">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Evolution
              </h3>
              <EvolutionBar totalEarned={totalPointsEarned} petName={selectedPet?.name} />
            </SpotlightCard>

            {/* Stats card */}
            <SpotlightCard baseClassName="glass-card p-5 space-y-4" spotlightColor="rgba(6, 182, 212, 0.2)">
              <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Companion Stats
              </h3>
              <StatBar stat="hunger" value={petStats.hunger} />
              <StatBar stat="cleanliness" value={petStats.cleanliness} />
              <StatBar stat="happiness" value={petStats.happiness} />
            </SpotlightCard>

            {/* Care actions */}
            <SpotlightCard baseClassName="glass-card p-5" spotlightColor="rgba(167, 139, 250, 0.2)">
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
            </SpotlightCard>

            {/* Accessories shortcut */}
            <motion.button
              className="w-full glass-card p-4 flex items-center justify-between group cursor-pointer"
              style={{ border: '1px solid rgba(245, 163, 26, 0.2)' }}
              onClick={() => navigate('/accessories')}
              whileHover={{ borderColor: 'rgba(245, 163, 26, 0.5)', boxShadow: '0 0 20px rgba(245, 163, 26, 0.1)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: 'rgba(245, 163, 26, 0.15)' }}>
                  🎁
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
            {/* Stats summary row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Active Quests', value: tasks.filter(t => !t.completed).length, icon: '📜', color: '#7c3aed', spotlight: 'rgba(124, 58, 237, 0.25)' },
                { label: 'Completed',     value: completedToday,                          icon: '✅', color: '#22c55e', spotlight: 'rgba(34, 197, 94, 0.22)' },
                { label: 'Earned Today',  value: completedToday * 10,                     icon: '⭐', color: '#f5a31a', spotlight: 'rgba(245, 163, 26, 0.25)', suffix: ' pts' },
              ].map(({ label, value, icon, color, suffix, spotlight }) => (
                <SpotlightCard
                  key={label}
                  baseClassName="glass-card p-4 text-center"
                  spotlightColor={spotlight}
                >
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="font-cinzel font-black text-xl" style={{ color }}>
                    <CountUp to={value} suffix={suffix || ''} duration={1.4} />
                  </div>
                  <div className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>{label}</div>
                </SpotlightCard>
              ))}
            </div>

            {/* Quest log */}
            <SpotlightCard baseClassName="glass-card p-5 flex-1" spotlightColor="rgba(245, 163, 26, 0.18)">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-cinzel font-bold text-base flex items-center gap-2">
                  <Star size={16} style={{ color: '#f5a31a' }} />
                  Quest Log
                </h3>
                <div className="text-xs font-nunito px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(245, 163, 26, 0.1)', color: '#f5a31a', border: '1px solid rgba(245, 163, 26, 0.2)' }}>
                  +10 pts per quest
                </div>
              </div>
              <TaskList />
            </SpotlightCard>

            {/* Tips card */}
            <SpotlightCard baseClassName="glass-card p-4" spotlightColor="rgba(124, 58, 237, 0.2)">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💡</div>
                <div>
                  <p className="font-nunito font-bold text-sm mb-1" style={{ color: '#a78bfa' }}>Quest Tips</p>
                  <p className="text-xs font-nunito leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                    Complete quests to earn points. Spend points on pet care or accessories.
                    Your companion's stats decrease over time — keep them happy! 🐾
                  </p>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
