import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Sparkles, Star, ShoppingBag, Droplets, Heart, Utensils, Shield } from 'lucide-react'
import { useGame } from '../context/GameContext'
import StatBar from '../components/StatBar'
import TaskList from '../components/TaskList'
import PetAvatar from '../components/PetAvatar'

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
  return (
    <motion.div
      className="flex items-center gap-2 px-4 py-2 rounded-xl"
      style={{
        background: 'rgba(245, 163, 26, 0.1)',
        border: '1px solid rgba(245, 163, 26, 0.3)',
      }}
      key={points}
      animate={{ scale: [1, 1.08, 1] }}
      transition={{ duration: 0.4 }}
    >
      <motion.span
        animate={{ rotate: [0, 20, -20, 0] }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-xl"
      >
        ⭐
      </motion.span>
      <div>
        <div className="font-cinzel font-black text-lg leading-none gradient-text-gold">
          {points.toLocaleString()}
        </div>
        <div className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>Points</div>
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
  } = useGame()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [actionAnim, setActionAnim] = useState(null)

  const triggerAction = async (actionFn, type) => {
    const success = actionFn()
    if (success !== false) {
      setActionAnim(type)
      setTimeout(() => setActionAnim(null), 600)
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
        <div className="flex items-center gap-3">
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

              {/* Action animation overlay */}
              <AnimatePresence>
                {actionAnim && (
                  <motion.div
                    className="absolute inset-0 rounded-2xl pointer-events-none z-20 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ background: `${selectedPet?.color}15` }}
                  >
                    <motion.div
                      className="text-5xl"
                      initial={{ scale: 0.5, y: 0 }}
                      animate={{ scale: 1.5, y: -30, opacity: 0 }}
                      transition={{ duration: 0.6 }}
                    >
                      {actionAnim === 'feed' ? '🍖' : actionAnim === 'shower' ? '💧' : '🎉'}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pet avatar */}
              <div className="relative z-10">
                <PetAvatar
                  pet={selectedPet}
                  equippedAccessories={equippedAccessories}
                  size="lg"
                  glowing={true}
                />
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
                { label: 'Active Quests', value: tasks.filter(t => !t.completed).length, icon: '📜', color: '#7c3aed' },
                { label: 'Completed', value: tasks.filter(t => t.completed).length, icon: '✅', color: '#22c55e' },
                { label: 'Earned Today', value: `${tasks.filter(t => t.completed).length * 10}`, icon: '⭐', color: '#f5a31a', suffix: ' pts' },
              ].map(({ label, value, icon, color, suffix }) => (
                <div key={label} className="glass-card p-4 text-center">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="font-cinzel font-black text-xl" style={{ color }}>
                    {value}{suffix || ''}
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
                  +10 pts per quest
                </div>
              </div>
              <TaskList />
            </div>

            {/* Tips card */}
            <div className="glass-card p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💡</div>
                <div>
                  <p className="font-nunito font-bold text-sm mb-1" style={{ color: '#a78bfa' }}>Quest Tips</p>
                  <p className="text-xs font-nunito leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Complete quests to earn points. Spend points on pet care or accessories.
                    Your companion's stats decrease over time — keep them happy! 🐾
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
