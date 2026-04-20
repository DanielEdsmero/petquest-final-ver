import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGame } from '../context/GameContext'

const MODES = [
  {
    id: 'fitness',
    emoji: '💪',
    name: 'Fitness Mode',
    tagline: 'Train your body, earn rewards',
    description: 'Track workouts, runs, yoga, and healthy habits. Stay active and keep your companion energized!',
    examples: ['Complete 30-min cardio', 'Drink 8 glasses of water', 'Do 100 push-ups this week', 'Run 5km today'],
    color: '#f43f5e',
    glow: 'rgba(244,63,94,0.15)',
  },
  {
    id: 'academic',
    emoji: '📚',
    name: 'Academic Mode',
    tagline: 'Knowledge is power',
    description: 'Log study sessions, complete assignments, and hit learning milestones. Level up your mind!',
    examples: ['Study 2 hours of math', 'Finish chapter 5 reading', 'Complete practice exam', 'Review flashcards'],
    color: '#06b6d4',
    glow: 'rgba(6,182,212,0.15)',
  },
  {
    id: 'custom',
    emoji: '✨',
    name: 'Custom Mode',
    tagline: 'Your adventure, your rules',
    description: 'The classic Pet Quest experience. Add any quests you like and build your own adventure!',
    examples: ['Clean my room', 'Call a friend', 'Read for 20 minutes', 'Cook a new recipe'],
    color: '#f5a31a',
    glow: 'rgba(245,163,26,0.15)',
  },
]

export default function GameModeSelectPage() {
  const { setGameMode, profile } = useGame()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(profile?.game_mode || null)
  const [saving, setSaving] = useState(false)

  const isUpdate = !!profile?.game_mode

  const handleConfirm = async () => {
    if (!selected || saving) return
    setSaving(true)
    await setGameMode(selected)
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative"
      style={{ background: 'var(--bg-deep)' }}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-4xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-center mb-10">
          <motion.div
            className="text-5xl mb-4"
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
          >
            🎮
          </motion.div>
          <h1 className="font-cinzel font-black text-3xl md:text-4xl gradient-text-gold mb-3">
            {isUpdate ? 'Change Adventure Mode' : 'Choose Your Adventure'}
          </h1>
          <p className="font-nunito text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
            {isUpdate
              ? 'Switch your quest theme at any time. Your quests and progress are always kept.'
              : 'Select a mode to personalize your quest experience. Shapes your quest log theme and suggestions.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {MODES.map((mode, i) => (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              onClick={() => setSelected(mode.id)}
              className="cursor-pointer rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: selected === mode.id ? mode.glow : 'rgba(14,14,46,0.7)',
                border: `2px solid ${selected === mode.id ? mode.color : 'rgba(124,58,237,0.2)'}`,
                boxShadow: selected === mode.id ? `0 0 30px ${mode.glow}` : 'none',
                transition: 'all 0.2s ease',
              }}
              whileHover={{ scale: 1.02, borderColor: mode.color }}
              whileTap={{ scale: 0.98 }}
            >
              {selected === mode.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: mode.color, color: '#fff' }}
                >
                  ✓
                </motion.div>
              )}
              {isUpdate && profile?.game_mode === mode.id && selected !== mode.id && (
                <div className="absolute top-3 right-3 text-xs px-1.5 py-0.5 rounded font-nunito"
                  style={{ background: mode.color + '20', color: mode.color }}>current</div>
              )}
              <div className="text-4xl mb-3">{mode.emoji}</div>
              <h2 className="font-cinzel font-bold text-base mb-1" style={{ color: mode.color }}>{mode.name}</h2>
              <p className="text-xs font-nunito font-semibold mb-2" style={{ color: 'rgba(180,180,220,0.8)' }}>
                {mode.tagline}
              </p>
              <p className="text-xs font-nunito leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
                {mode.description}
              </p>
              <div className="space-y-1.5">
                {mode.examples.map(ex => (
                  <div key={ex} className="flex items-center gap-2 text-xs font-nunito"
                    style={{ color: 'rgba(160,160,200,0.7)' }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: mode.color }} />
                    {ex}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <motion.button
            onClick={handleConfirm}
            disabled={!selected || saving || (isUpdate && selected === profile?.game_mode)}
            className="btn-gold px-10 py-3.5 text-base font-cinzel font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={selected ? { scale: 1.04 } : {}}
            whileTap={selected ? { scale: 0.97 } : {}}
          >
            {saving
              ? 'Saving...'
              : !selected
              ? 'Select a Mode'
              : isUpdate && selected === profile?.game_mode
              ? 'Already Selected'
              : isUpdate
              ? `Switch to ${MODES.find(m => m.id === selected)?.name}`
              : `Begin ${MODES.find(m => m.id === selected)?.name}`}
          </motion.button>
          {isUpdate && (
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm font-nunito"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Back to dashboard
            </button>
          )}
          {!isUpdate && (
            <p className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
              You can change your mode anytime from the dashboard.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}
