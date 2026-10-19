import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { PRESET_QUESTS, DIFF_META } from '../data/presetQuests'
import { DIFFICULTY_TEXT } from '../data/difficulty'

/* ── constants ── */
const DIFFS        = ['easy', 'medium', 'hard']
const SLOTS_COUNT  = { easy: 3, medium: 3, hard: 2 }

/* Light palette — same values as apps/mobile/src/theme.ts. */
const INK = '#102A43'
const SOFT = '#3E5165'
const MUTED = '#667085'
const TEAL = '#3F8580'
const TEAL_DEEP = '#2F6F6B'
const TEAL_TINT = '#E4EFEE'
const MIST = '#F3F5F2'
const LINE = '#E1E7E3'

const MODES = [
  {
    id: 'fitness',
    emoji: '💪',
    name: 'Fitness Mode',
    tagline: 'Train your body, earn rewards',
    description: 'Home workouts, gym sessions, cardio, and healthy habits. Keep your companion energized!',
  },
  {
    id: 'saitama',
    emoji: '👊',
    name: 'Saitama Mode',
    tagline: 'Become the Caped Baldy',
    description: '100 push-ups, 100 sit-ups, 100 squats & a 10km run — every single day. Train like One Punch Man. A hardcore twist on Fitness Mode.',
  },
  {
    id: 'academic',
    emoji: '📚',
    name: 'Academic Mode',
    tagline: 'Knowledge is power',
    description: 'Study sessions, assignments, reading, and learning milestones. Level up your mind!',
  },
  {
    id: 'custom',
    emoji: '✨',
    name: 'Custom Mode',
    tagline: 'Your adventure, your rules',
    description: 'The classic Pet Quest experience. Add any quests you like and build your own adventure!',
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

/* Normalize a quest title for dedupe: lowercase, strip punctuation, collapse
   whitespace. Shared by the picker (don't offer owned quests) and the insert. */
export const normalizeQuestText = (s) =>
  String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()

const primaryBtn = (disabled) => ({
  background: disabled ? MIST : TEAL_DEEP, color: disabled ? MUTED : '#FFFFFF',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

/* Back on the left, the one main action on the right. */
function StepNav({ onBack, backLabel = '← Back', next, nextLabel, nextDisabled }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-6">
      {onBack
        ? <button onClick={onBack} className="min-h-[44px] px-3 text-sm font-bold" style={{ color: TEAL_DEEP }}>{backLabel}</button>
        : <span />}
      <motion.button onClick={next} disabled={nextDisabled}
        className="min-h-[48px] px-6 rounded-xl text-base font-bold"
        style={primaryBtn(nextDisabled)} whileTap={nextDisabled ? {} : { scale: 0.97 }}>
        {nextLabel}
      </motion.button>
    </div>
  )
}

/* Three bars: which step you are on. */
function Progress({ step, total }) {
  return (
    <div className="flex justify-center gap-1.5 mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}
      aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="h-1.5 w-10 rounded-full" style={{ background: i < step ? TEAL : LINE }} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════
   STEP 3 — PICK STARTER QUESTS
══════════════════════════════════ */
function QuestPicker({ mode, enabledDiffs, ownedTexts, onConfirm, onBack, saving }) {
  const [rerollState, setRerollState] = useState(() => loadRerolls())

  // Only offer quests the user does NOT already own (normalized-title match).
  const poolFor = (diff) =>
    (PRESET_QUESTS[mode]?.[diff] || []).filter(t => !ownedTexts.has(normalizeQuestText(t)))

  const [slots, setSlots] = useState(() => {
    const init = {}
    enabledDiffs.forEach(diff => {
      init[diff] = pickRandom(poolFor(diff), SLOTS_COUNT[diff] || 3)
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
    const pool    = poolFor(diff)
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
  const n = selectedQuests.length

  return (
    <div>
      <h1 className="font-extrabold text-2xl md:text-3xl text-center" style={{ color: INK }}>Pick your starter quests</h1>
      <p className="text-base text-center mt-1 mb-6" style={{ color: SOFT }}>
        Tap a quest to keep or drop it. 🎲 {rerollsLeft}/3 rerolls left today.
      </p>

      <div className="space-y-6">
        {enabledDiffs.map(diff => {
          const meta = DIFF_META[diff]
          const color = DIFFICULTY_TEXT[diff]
          return (
            <section key={diff}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                <h2 className="font-extrabold text-base" style={{ color }}>{meta.emoji} {meta.label}</h2>
                <span className="text-sm" style={{ color: SOFT }}>+{meta.pts} pts each</span>
                <span className="text-sm ml-auto" style={{ color: MUTED }}>{meta.limitDesc}</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AnimatePresence mode="popLayout">
                  {(slots[diff] || []).map((quest, idx) => {
                    const on = selected[diff]?.[idx] ?? true
                    return (
                      <motion.li key={`${diff}_${idx}_${quest}`} layout
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-stretch rounded-xl bg-white overflow-hidden"
                        style={{ border: `${on ? 2 : 1}px solid ${on ? TEAL : LINE}`, margin: on ? 0 : 1 }}>
                        <button onClick={() => toggleQuest(diff, idx)} aria-pressed={on}
                          className="flex-1 min-h-[52px] flex items-center gap-3 px-3 text-left">
                          <span className="w-5 h-5 rounded-md flex-none flex items-center justify-center text-xs font-bold"
                            style={{ background: on ? TEAL_DEEP : '#FFFFFF', border: `2px solid ${TEAL_DEEP}`, color: '#FFFFFF' }}>
                            {on ? '✓' : ''}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: on ? INK : MUTED }}>{quest}</span>
                        </button>
                        <button onClick={() => rerollQuest(diff, idx)} disabled={rerollsLeft <= 0}
                          className="min-w-[48px] flex items-center justify-center text-lg disabled:opacity-40"
                          style={{ borderLeft: `1px solid ${LINE}` }}
                          aria-label={`Reroll: swap "${quest}" for another quest`}
                          title={rerollsLeft > 0 ? 'Swap this quest for a different one' : 'No rerolls left today'}>
                          🎲
                        </button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            </section>
          )
        })}
      </div>

      <StepNav onBack={onBack} next={() => onConfirm(selectedQuests)} nextDisabled={n === 0 || saving}
        nextLabel={saving ? 'Starting…' : n === 0 ? 'Pick at least one' : `Start with ${n} quest${n !== 1 ? 's' : ''}`} />
    </div>
  )
}

/* ══════════════════════════════════
   MAIN PAGE — three short steps
══════════════════════════════════ */
export default function GameModeSelectPage() {
  const { setGameMode, bulkAddPresets, markOnboardingComplete, logout, profile, tasks } = useGame()
  const navigate = useNavigate()
  const ownedTexts = new Set((tasks || []).map(t => normalizeQuestText(t.text)))

  const [step,     setStep]     = useState(1)   // 1 mode · 2 difficulty · 3 quests
  const [selected, setSelected] = useState(profile?.game_mode || null)
  const [enabled,  setEnabled]  = useState({ easy: true, medium: true, hard: true })
  const [saving,   setSaving]   = useState(false)

  const isUpdate   = !!profile?.game_mode
  const hasPresets = selected && selected !== 'custom'
  const modeData   = MODES.find(m => m.id === selected)
  const enabledDiffs = DIFFS.filter(d => enabled[d])
  const total = selected === 'custom' ? 1 : 3   // custom skips difficulty + quests

  const toggleDiff = (diff) => setEnabled(prev => ({ ...prev, [diff]: !prev[diff] }))

  /* Called from step 3, or straight from step 1 for custom */
  const finalize = async (questsToAdd = []) => {
    setSaving(true)
    await setGameMode(selected)
    if (questsToAdd.length) await bulkAddPresets(questsToAdd)
    await markOnboardingComplete()   // Phase 1: never replay onboarding after this
    navigate('/dashboard', { replace: true })
  }

  const step1Label = () => {
    if (saving)   return 'Starting…'
    if (!selected) return 'Pick a mode'
    if (hasPresets) return 'Next'
    if (isUpdate && selected === profile?.game_mode) return 'Already selected'
    return isUpdate ? `Switch to ${modeData?.name}` : `Begin ${modeData?.name}`
  }
  const step1Disabled = !selected || saving || (isUpdate && selected === profile?.game_mode && !hasPresets)

  const page = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: 0.25 } }

  return (
    <div className="theme-light min-h-screen relative z-10 flex flex-col items-center justify-center px-4 py-10 font-nunito">
      <div className="w-full max-w-2xl">
        <Progress step={step} total={total} />

        <AnimatePresence mode="wait">
          {/* ── Step 1: mode ── */}
          {step === 1 && (
            <motion.div key="mode" {...page}>
              <h1 className="font-extrabold text-2xl md:text-3xl text-center" style={{ color: INK }}>
                {isUpdate ? 'Change your mode' : 'Choose your mode'}
              </h1>
              <p className="text-base text-center mt-1 mb-6" style={{ color: SOFT }}>
                It picks your starter quests. You can change it later.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Mode">
                {MODES.map(mode => {
                  const on = selected === mode.id
                  return (
                    <button key={mode.id} onClick={() => setSelected(mode.id)} role="radio" aria-checked={on}
                      className="relative text-left rounded-2xl p-4 bg-white"
                      style={{ border: `${on ? 2 : 1}px solid ${on ? TEAL : LINE}`, padding: on ? 15 : 16, background: on ? '#F7FBFA' : '#FFFFFF' }}>
                      {on && <span className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: TEAL_DEEP }}>✓</span>}
                      {isUpdate && profile?.game_mode === mode.id && !on && (
                        <span className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: TEAL_TINT, color: TEAL_DEEP }}>current</span>
                      )}
                      <div className="text-3xl mb-2">{mode.emoji}</div>
                      <h2 className="font-extrabold text-base" style={{ color: INK }}>{mode.name}</h2>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: SOFT }}>{mode.tagline}</p>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: MUTED }}>{mode.description}</p>
                    </button>
                  )
                })}
              </div>
              <StepNav
                onBack={isUpdate ? () => navigate('/dashboard') : null} backLabel="← Dashboard"
                next={() => (hasPresets ? setStep(2) : finalize())}
                nextLabel={step1Label()} nextDisabled={step1Disabled} />
            </motion.div>
          )}

          {/* ── Step 2: difficulty ── */}
          {step === 2 && (
            <motion.div key="diff" {...page}>
              <h1 className="font-extrabold text-2xl md:text-3xl text-center" style={{ color: INK }}>How hard?</h1>
              <p className="text-base text-center mt-1 mb-6" style={{ color: SOFT }}>
                Pick the levels you want starter quests for.
              </p>
              <div className="space-y-2">
                {DIFFS.map(diff => {
                  const meta = DIFF_META[diff]
                  const on = enabled[diff]
                  return (
                    <button key={diff} onClick={() => toggleDiff(diff)} aria-pressed={on}
                      className="w-full min-h-[60px] flex items-center gap-3 px-4 rounded-2xl text-left"
                      style={{ background: on ? TEAL_TINT : '#FFFFFF', border: `1px solid ${on ? '#3F858055' : LINE}` }}>
                      <span className="text-2xl">{meta.emoji}</span>
                      <span className="flex-1">
                        <span className="block font-extrabold text-base" style={{ color: DIFFICULTY_TEXT[diff] }}>{meta.label} · +{meta.pts} pts</span>
                        <span className="block text-sm" style={{ color: SOFT }}>{meta.limitDesc}</span>
                      </span>
                      <span className="text-sm font-bold" style={{ color: on ? TEAL_DEEP : MUTED }}>{on ? 'Included' : 'Skipped'}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-sm text-center mt-4" style={{ color: enabledDiffs.length ? MUTED : '#8A4B12' }}>
                {enabledDiffs.length
                  ? `Next you'll hand-pick from ${enabledDiffs.reduce((s, d) => s + SLOTS_COUNT[d], 0)} starter quests.`
                  : 'Include at least one level.'}
              </p>
              <StepNav onBack={() => setStep(1)} next={() => setStep(3)} nextLabel="Next" nextDisabled={enabledDiffs.length === 0} />
            </motion.div>
          )}

          {/* ── Step 3: quests ── */}
          {step === 3 && (
            <motion.div key="quests" {...page}>
              <QuestPicker mode={selected} enabledDiffs={enabledDiffs} ownedTexts={ownedTexts}
                onConfirm={finalize} onBack={() => setStep(2)} saving={saving} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Escape hatch so a stuck onboarding user can always reset. */}
        {!isUpdate && (
          <div className="text-center mt-8">
            <button onClick={async () => { await logout(); navigate('/', { replace: true }) }}
              className="min-h-[44px] px-3 text-sm underline" style={{ color: MUTED }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
