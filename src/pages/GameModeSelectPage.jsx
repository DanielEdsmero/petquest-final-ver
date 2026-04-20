import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { PRESET_QUESTS, DIFF_META } from '../data/presetQuests'

/* ── constants ── */
const DIFFS        = ['easy', 'medium', 'hard']
const SLOTS_COUNT  = { easy: 3, medium: 3, hard: 2 }

const MODES = [
  {
    id: 'fitness',
    emoji: '💪',
    name: 'Fitness Mode',
    tagline: 'Train your body, earn rewards',
    description: 'Home workouts, gym sessions, cardio, and healthy habits. Keep your companion energized!',
    color: '#f43f5e',
    glow: 'rgba(244,63,94,0.15)',
  },
  {
    id: 'academic',
    emoji: '📚',
    name: 'Academic Mode',
    tagline: 'Knowledge is power',
    description: 'Study sessions, assignments, reading, and learning milestones. Level up your mind!',
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

/* ── reroll localStorage helpers ── */
function todayStr() { return new Date().toISOString().split('T')[0] }
function loadRerolls() {
  try {
    const v = JSON.parse(localStorage.getItem('pq_rerolls') || 'null')
    if (!v || v.date !== todayStr()) return { count: 3, date: todayStr() }
    return v
  } catch { return { count: 3, date: todayStr() } }
}
function saveRerolls(state) {
  try { localStorage.setItem('pq_rerolls', JSON.stringify(state)) } catch {}
}

/* ── random picker ── */
function pickRandom(arr, n, exclude = []) {
  const pool = arr.filter(q => !exclude.includes(q))
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n)
}

/* ══════════════════════════════════
   QUEST CARD (inside picker modal)
══════════════════════════════════ */
function QuestCard({ quest, diff, isSelected, onToggle, onReroll, rerollsLeft, animIndex }) {
  const meta = DIFF_META[diff]
  const canReroll = rerollsLeft > 0

  return (
    <motion.div
      key={quest}
      layout
      initial={{ scale: 0.82, opacity: 0, y: 18 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.82, opacity: 0, y: -12 }}
      transition={{ delay: animIndex * 0.07, type: 'spring', stiffness: 380, damping: 26 }}
      onClick={onToggle}
      className="cursor-pointer rounded-xl p-4 relative select-none"
      style={{
        background:    isSelected ? meta.color + '15' : 'rgba(12,12,38,0.8)',
        border:        `2px solid ${isSelected ? meta.color : 'rgba(124,58,237,0.18)'}`,
        boxShadow:     isSelected ? `0 0 18px ${meta.color}22` : 'none',
        transition:    'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Checkmark */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: meta.color, color: '#fff' }}
          >
            ✓
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quest text */}
      <p className="text-sm font-nunito font-medium leading-snug mb-4 pr-6"
        style={{ color: isSelected ? '#e2e2ff' : '#8080aa', transition: 'color 0.15s' }}>
        {quest}
      </p>

      {/* Footer: pts + reroll */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-nunito font-bold px-2 py-0.5 rounded-lg"
          style={{ background: meta.color + '22', color: meta.color }}>
          +{meta.pts} pts
        </span>
        <motion.button
          onClick={e => { e.stopPropagation(); onReroll() }}
          disabled={!canReroll}
          className="flex items-center gap-1.5 text-xs font-nunito font-bold px-2.5 py-1 rounded-lg"
          style={{
            background: canReroll ? 'rgba(124,58,237,0.18)' : 'rgba(40,40,70,0.4)',
            color:      canReroll ? '#a78bfa' : '#4040aa',
            border:     `1px solid ${canReroll ? 'rgba(124,58,237,0.3)' : 'rgba(60,60,100,0.3)'}`,
            cursor:     canReroll ? 'pointer' : 'not-allowed',
          }}
          whileHover={canReroll ? { scale: 1.06 } : {}}
          whileTap={canReroll ? { scale: 0.93 } : {}}
          title={canReroll ? 'Swap this quest for a different one' : 'No rerolls left today'}
        >
          🎲 Reroll
        </motion.button>
      </div>
    </motion.div>
  )
}

/* ══════════════════════════════════
   QUEST PICKER MODAL
══════════════════════════════════ */
function QuestPickerModal({ mode, enabledDiffs, onConfirm, onClose }) {
  const [rerollState, setRerollState] = useState(() => loadRerolls())

  const [slots, setSlots] = useState(() => {
    const init = {}
    enabledDiffs.forEach(diff => {
      const pool = PRESET_QUESTS[mode]?.[diff] || []
      init[diff] = pickRandom(pool, SLOTS_COUNT[diff] || 3)
    })
    return init
  })

  const [selected, setSelected] = useState(() => {
    const init = {}
    enabledDiffs.forEach(diff => {
      init[diff] = (slots[diff] || []).map(() => true)
    })
    return init
  })

  const rerollsLeft = rerollState.count

  const toggleQuest = (diff, idx) => {
    setSelected(prev => {
      const arr = [...(prev[diff] || [])]
      arr[idx] = !arr[idx]
      return { ...prev, [diff]: arr }
    })
  }

  const rerollQuest = (diff, idx) => {
    if (rerollsLeft <= 0) return
    const pool    = PRESET_QUESTS[mode]?.[diff] || []
    const current = slots[diff] || []
    const [fresh] = pickRandom(pool, 1, current)
    if (!fresh) return

    setSlots(prev => {
      const arr = [...(prev[diff] || [])]
      arr[idx]  = fresh
      return { ...prev, [diff]: arr }
    })
    setSelected(prev => {
      const arr = [...(prev[diff] || [])]
      arr[idx]  = true
      return { ...prev, [diff]: arr }
    })
    const next = { count: rerollsLeft - 1, date: todayStr() }
    setRerollState(next)
    saveRerolls(next)
  }

  const selectedQuests = enabledDiffs.flatMap(diff =>
    (slots[diff] || [])
      .map((text, i) => ({ text, difficulty: diff, sel: selected[diff]?.[i] }))
      .filter(q => q.sel)
      .map(({ text, difficulty }) => ({ text, difficulty }))
  )

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{
          background:  'rgba(7,7,28,0.99)',
          border:      '1px solid rgba(124,58,237,0.3)',
          maxHeight:   '92vh',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
          <div>
            <h2 className="font-cinzel font-black text-lg gradient-text-gold">Pick Your Starter Quests</h2>
            <p className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Click a quest to select or deselect it. Use Reroll to swap any quest.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-nunito font-bold"
              style={{
                background: rerollsLeft > 0 ? 'rgba(124,58,237,0.18)' : 'rgba(40,40,70,0.4)',
                color:      rerollsLeft > 0 ? '#a78bfa' : '#4040aa',
                border:     `1px solid ${rerollsLeft > 0 ? 'rgba(124,58,237,0.35)' : 'rgba(60,60,100,0.3)'}`,
              }}>
              🎲 {rerollsLeft}/3 rerolls
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
        </div>

        {/* ── Quest sections ── */}
        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-5 space-y-7">
          {enabledDiffs.map(diff => {
            const meta      = DIFF_META[diff]
            const diffSlots = slots[diff] || []

            return (
              <div key={diff}>
                {/* Section header */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xl">{meta.emoji}</span>
                  <span className="font-cinzel font-bold text-sm uppercase tracking-widest"
                    style={{ color: meta.color }}>
                    {meta.label} Quests
                  </span>
                  <span className="text-xs font-nunito font-bold px-2 py-0.5 rounded-lg"
                    style={{ background: meta.color + '22', color: meta.color }}>
                    +{meta.pts} pts each
                  </span>
                  <span className="text-xs font-nunito ml-auto" style={{ color: 'var(--text-muted)' }}>
                    {meta.limitDesc}
                  </span>
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {diffSlots.map((quest, idx) => (
                      <QuestCard
                        key={`${diff}_${idx}_${quest}`}
                        quest={quest}
                        diff={diff}
                        isSelected={selected[diff]?.[idx] ?? true}
                        onToggle={() => toggleQuest(diff, idx)}
                        onReroll={() => rerollQuest(diff, idx)}
                        rerollsLeft={rerollsLeft}
                        animIndex={idx}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(124,58,237,0.15)' }}>
          <span className="text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold" style={{ color: '#e2e2ff' }}>{selectedQuests.length}</span>
            {' '}quest{selectedQuests.length !== 1 ? 's' : ''} selected
          </span>
          <motion.button
            onClick={() => onConfirm(selectedQuests)}
            disabled={selectedQuests.length === 0}
            className="btn-gold px-6 py-2.5 font-cinzel font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={selectedQuests.length > 0 ? { scale: 1.04 } : {}}
            whileTap={selectedQuests.length > 0 ? { scale: 0.96 } : {}}
          >
            Add {selectedQuests.length > 0 ? selectedQuests.length + ' ' : ''}Quest{selectedQuests.length !== 1 ? 's' : ''} →
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ══════════════════════════════════
   MAIN PAGE
══════════════════════════════════ */
export default function GameModeSelectPage() {
  const { setGameMode, bulkAddPresets, profile } = useGame()
  const navigate = useNavigate()

  const [selected,     setSelected]     = useState(profile?.game_mode || null)
  const [enabled,      setEnabled]      = useState({ easy: true, medium: true, hard: true })
  const [pickerOpen,   setPickerOpen]   = useState(false)
  const [saving,       setSaving]       = useState(false)

  const isUpdate   = !!profile?.game_mode
  const hasPresets = selected && selected !== 'custom'
  const modeData   = MODES.find(m => m.id === selected)
  const enabledDiffs = DIFFS.filter(d => enabled[d])

  const toggleDiff = (diff) => setEnabled(prev => ({ ...prev, [diff]: !prev[diff] }))

  /* Called when user selects/skips in the picker, or immediately for custom */
  const finalize = async (questsToAdd = []) => {
    setSaving(true)
    setPickerOpen(false)
    await setGameMode(selected)
    if (questsToAdd.length) await bulkAddPresets(questsToAdd)
    navigate('/dashboard', { replace: true })
  }

  const handleConfirmClick = () => {
    if (!selected || saving) return
    if (hasPresets && enabledDiffs.length > 0) {
      setPickerOpen(true)
    } else {
      finalize()
    }
  }

  const confirmLabel = () => {
    if (saving)   return 'Starting Adventure...'
    if (!selected) return 'Select a Mode'
    if (isUpdate && selected === profile?.game_mode && !hasPresets) return 'Already Selected'
    if (hasPresets && enabledDiffs.length > 0) return 'Choose Quests →'
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
          <motion.div className="text-5xl mb-4"
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}>
            🎮
          </motion.div>
          <h1 className="font-cinzel font-black text-3xl md:text-4xl gradient-text-gold mb-3">
            {isUpdate ? 'Change Adventure Mode' : 'Choose Your Adventure'}
          </h1>
          <p className="font-nunito text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
            {isUpdate
              ? 'Switch mode anytime. You can load new starter quests for any difficulty.'
              : 'Pick your mode, choose difficulty levels, then hand-pick your starter quests.'}
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
                background: selected === mode.id ? mode.glow : 'rgba(14,14,46,0.7)',
                border:     `2px solid ${selected === mode.id ? mode.color : 'rgba(124,58,237,0.2)'}`,
                boxShadow:  selected === mode.id ? `0 0 28px ${mode.glow}` : 'none',
                transition: 'all 0.2s ease',
              }}
              whileHover={{ scale: 1.02, borderColor: mode.color }}
              whileTap={{ scale: 0.98 }}
            >
              {selected === mode.id && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: mode.color, color: '#fff' }}>✓
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

        {/* ── Step 2: Difficulty toggles (Fitness/Academic only) ── */}
        <AnimatePresence>
          {hasPresets && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden mb-6"
            >
              <p className="font-cinzel font-bold text-xs uppercase tracking-widest mb-3 px-1"
                style={{ color: 'var(--text-muted)' }}>
                Step 2 — Choose Difficulty Levels
              </p>
              <div className="flex gap-3">
                {DIFFS.map(diff => {
                  const meta = DIFF_META[diff]
                  const on   = enabled[diff]
                  return (
                    <motion.button
                      key={diff}
                      onClick={() => toggleDiff(diff)}
                      className="flex-1 py-4 px-3 rounded-2xl transition-all text-center"
                      style={{
                        background: on ? meta.color + '18' : 'rgba(14,14,46,0.5)',
                        border:     `2px solid ${on ? meta.color + '55' : 'rgba(124,58,237,0.18)'}`,
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <div className="text-2xl mb-1.5">{meta.emoji}</div>
                      <div className="font-cinzel font-bold text-xs mb-0.5"
                        style={{ color: on ? meta.color : '#6060aa' }}>
                        {meta.label}
                      </div>
                      <div className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
                        +{meta.pts} pts
                      </div>
                      <div className="text-xs font-nunito mt-1 font-bold"
                        style={{ color: on ? meta.color : '#4040aa' }}>
                        {on ? 'Included' : 'Skipped'}
                      </div>
                    </motion.button>
                  )
                })}
              </div>
              {enabledDiffs.length === 0 && (
                <p className="text-xs font-nunito text-center mt-3" style={{ color: '#f5a31a' }}>
                  ⚠️ Enable at least one difficulty to load starter quests.
                </p>
              )}
              {enabledDiffs.length > 0 && (
                <p className="text-xs font-nunito text-center mt-3" style={{ color: 'var(--text-muted)' }}>
                  Next you'll hand-pick from {enabledDiffs.length * 3 - (enabled.hard ? 1 : 0)} starter quests · 3 rerolls per day
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm ── */}
        <div className="flex flex-col items-center gap-3">
          <motion.button
            onClick={handleConfirmClick}
            disabled={confirmDisabled}
            className="btn-gold px-10 py-3.5 text-base font-cinzel font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={!confirmDisabled ? { scale: 1.04 } : {}}
            whileTap={!confirmDisabled ? { scale: 0.97 } : {}}
          >
            {confirmLabel()}
          </motion.button>
          {isUpdate && (
            <button onClick={() => navigate('/dashboard')} className="text-sm font-nunito"
              style={{ color: 'var(--text-muted)' }}>
              ← Back to dashboard
            </button>
          )}
          {!isUpdate && (
            <p className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
              You can change mode or reload presets anytime from the dashboard.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Quest Picker Modal ── */}
      <AnimatePresence>
        {pickerOpen && hasPresets && (
          <QuestPickerModal
            mode={selected}
            enabledDiffs={enabledDiffs}
            onConfirm={finalize}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
