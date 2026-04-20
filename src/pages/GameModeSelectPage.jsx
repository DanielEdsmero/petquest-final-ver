import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { PRESET_QUESTS, DIFF_META } from '../data/presetQuests'

const MODES = [
  {
    id: 'fitness',
    emoji: '💪',
    name: 'Fitness Mode',
    tagline: 'Train your body, earn rewards',
    description: 'Track workouts, runs, yoga, and healthy habits. Keep your companion energized!',
    color: '#f43f5e',
    glow: 'rgba(244,63,94,0.15)',
  },
  {
    id: 'academic',
    emoji: '📚',
    name: 'Academic Mode',
    tagline: 'Knowledge is power',
    description: 'Log study sessions, complete assignments, and hit learning milestones. Level up your mind!',
    color: '#06b6d4',
    glow: 'rgba(6,182,212,0.15)',
  },
  {
    id: 'custom',
    emoji: '✨',
    name: 'Custom Mode',
    tagline: 'Your adventure, your rules',
    description: 'The classic Pet Quest experience. Add any quests you like and build your own adventure!',
    color: '#f5a31a',
    glow: 'rgba(245,163,26,0.15)',
  },
]

const DIFFS = ['easy', 'medium', 'hard']

function DifficultyToggle({ diff, quests, enabled, onToggle, modeColor }) {
  const [expanded, setExpanded] = useState(false)
  const meta = DIFF_META[diff]

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        border: `1px solid ${enabled ? meta.color + '55' : 'rgba(124,58,237,0.15)'}`,
        background: enabled ? meta.color + '08' : 'rgba(14,14,46,0.4)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle switch */}
        <button
          onClick={() => onToggle(diff)}
          className="relative flex-shrink-0 w-10 h-5 rounded-full transition-all"
          style={{ background: enabled ? meta.color : 'rgba(80,80,120,0.5)' }}
        >
          <motion.div
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
            animate={{ left: enabled ? '1.25rem' : '0.125rem' }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>

        {/* Difficulty info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{meta.emoji}</span>
            <span className="font-cinzel font-bold text-sm" style={{ color: enabled ? meta.color : '#8080aa' }}>
              {meta.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded font-nunito font-bold"
              style={{ background: meta.color + '20', color: meta.color }}>
              +{meta.pts} pts
            </span>
          </div>
          <p className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {meta.limitDesc} · {quests.length} starter quest{quests.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Expand preview */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-nunito flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {expanded ? 'hide ▲' : 'preview ▼'}
        </button>
      </div>

      {/* Quest preview */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5 border-t" style={{ borderColor: meta.color + '20' }}>
              {quests.map((q, i) => (
                <div key={i} className="flex items-start gap-2 text-xs font-nunito mt-2"
                  style={{ color: enabled ? '#c0c0e0' : '#5050aa' }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                    style={{ background: enabled ? meta.color : '#5050aa' }} />
                  {q}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function GameModeSelectPage() {
  const { setGameMode, bulkAddPresets, profile } = useGame()
  const navigate = useNavigate()

  const [selected,  setSelected]  = useState(profile?.game_mode || null)
  const [enabled,   setEnabled]   = useState({ easy: true, medium: true, hard: true })
  const [saving,    setSaving]    = useState(false)

  const isUpdate   = !!profile?.game_mode
  const hasPresets = selected && selected !== 'custom'
  const modeData   = MODES.find(m => m.id === selected)

  const toggleDiff = (diff) => setEnabled(prev => ({ ...prev, [diff]: !prev[diff] }))

  const totalSelected = hasPresets
    ? DIFFS.filter(d => enabled[d]).reduce((sum, d) => sum + (PRESET_QUESTS[selected]?.[d]?.length || 0), 0)
    : 0

  const handleConfirm = async () => {
    if (!selected || saving) return
    setSaving(true)

    await setGameMode(selected)

    if (hasPresets && totalSelected > 0) {
      const quests = DIFFS
        .filter(d => enabled[d])
        .flatMap(d => (PRESET_QUESTS[selected]?.[d] || []).map(text => ({ text, difficulty: d })))
      await bulkAddPresets(quests)
    }

    navigate('/dashboard', { replace: true })
  }

  const confirmLabel = () => {
    if (saving) return 'Starting Adventure...'
    if (!selected) return 'Select a Mode'
    if (isUpdate && selected === profile?.game_mode && !hasPresets) return 'Already Selected'
    if (hasPresets && totalSelected > 0)
      return isUpdate
        ? `Load ${totalSelected} quest${totalSelected !== 1 ? 's' : ''} & Switch Mode`
        : `Begin with ${totalSelected} starter quest${totalSelected !== 1 ? 's' : ''}`
    return isUpdate ? `Switch to ${modeData?.name}` : `Begin ${modeData?.name}`
  }

  const confirmDisabled = !selected || saving ||
    (isUpdate && selected === profile?.game_mode && !hasPresets)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative"
      style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient */}
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
        {/* Header */}
        <div className="text-center mb-8">
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
              ? 'Switch mode anytime. You can also load new preset quests for any difficulty.'
              : 'Pick a mode and choose which difficulty levels to start with.'}
          </p>
        </div>

        {/* ── Step 1: Mode cards ── */}
        <p className="font-cinzel font-bold text-xs uppercase tracking-widest mb-3 px-1"
          style={{ color: 'var(--text-muted)' }}>
          Step 1 — Choose Mode
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {MODES.map((mode, i) => (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.08 }}
              onClick={() => setSelected(mode.id)}
              className="cursor-pointer rounded-2xl p-5 relative"
              style={{
                background:  selected === mode.id ? mode.glow : 'rgba(14,14,46,0.7)',
                border:      `2px solid ${selected === mode.id ? mode.color : 'rgba(124,58,237,0.2)'}`,
                boxShadow:   selected === mode.id ? `0 0 28px ${mode.glow}` : 'none',
                transition:  'all 0.2s ease',
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
              <div className="text-3xl mb-2">{mode.emoji}</div>
              <h2 className="font-cinzel font-bold text-sm mb-1" style={{ color: mode.color }}>{mode.name}</h2>
              <p className="text-xs font-nunito font-semibold mb-1" style={{ color: 'rgba(180,180,220,0.8)' }}>
                {mode.tagline}
              </p>
              <p className="text-xs font-nunito leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {mode.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* ── Step 2: Difficulty presets (Fitness/Academic only) ── */}
        <AnimatePresence>
          {hasPresets && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(14,14,46,0.7)', border: `1px solid ${modeData?.color}30` }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-cinzel font-bold text-xs uppercase tracking-widest"
                      style={{ color: 'var(--text-muted)' }}>
                      Step 2 — Choose Difficulty Levels
                    </p>
                    <p className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Toggle which preset quests get added to your quest log.
                    </p>
                  </div>
                  {totalSelected > 0 && (
                    <motion.div
                      key={totalSelected}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="text-xs font-nunito font-bold px-3 py-1.5 rounded-xl flex-shrink-0"
                      style={{ background: modeData?.color + '20', color: modeData?.color, border: `1px solid ${modeData?.color}40` }}
                    >
                      {totalSelected} quest{totalSelected !== 1 ? 's' : ''} selected
                    </motion.div>
                  )}
                </div>

                <div className="space-y-3">
                  {DIFFS.map(diff => (
                    <DifficultyToggle
                      key={diff}
                      diff={diff}
                      quests={PRESET_QUESTS[selected]?.[diff] || []}
                      enabled={enabled[diff]}
                      onToggle={toggleDiff}
                      modeColor={modeData?.color}
                    />
                  ))}
                </div>

                {totalSelected === 0 && (
                  <p className="text-xs font-nunito text-center mt-3" style={{ color: '#f5a31a' }}>
                    ⚠️ No difficulties selected — you'll start with an empty quest log.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm ── */}
        <div className="flex flex-col items-center gap-3">
          <motion.button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="btn-gold px-10 py-3.5 text-base font-cinzel font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={!confirmDisabled ? { scale: 1.04 } : {}}
            whileTap={!confirmDisabled ? { scale: 0.97 } : {}}
          >
            {confirmLabel()}
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
              You can change mode or add more presets anytime from the dashboard.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}
