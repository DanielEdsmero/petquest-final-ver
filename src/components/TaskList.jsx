import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Plus, Circle, BookOpen, Clock, ChevronUp, CalendarClock } from 'lucide-react'
import { useGame, HARD_PERIOD_MS, MEDIUM_PERIOD_MS, DIFF_MIN_COMPLETE_MS } from '../context/GameContext'
import CompletionFx from './animations/CompletionFx'
import CheckDraw from './animations/CheckDraw'
import EmptyStatePet from './animations/EmptyStatePet'
import { DIFFICULTY_COLORS } from '../data/difficulty'

const DIFF_CONFIG = {
  easy:   { label: 'Easy',   emoji: '🌱', pts: 10, color: DIFFICULTY_COLORS.easy,   limit: null, desc: 'Unlimited · Daily quests' },
  medium: { label: 'Medium', emoji: '⚡', pts: 25, color: DIFFICULTY_COLORS.medium, limit: 3,    desc: '3 quests per 3 days' },
  hard:   { label: 'Hard',   emoji: '🔥', pts: 50, color: DIFFICULTY_COLORS.hard,   limit: 1,    desc: '1 quest per week' },
}

/* M:SS countdown for the per-quest completion gate. */
function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTimeLeft(ms) {
  if (ms <= 0) return null
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function ProgressLogs({ taskId, logs = [], onAdd }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    await onAdd(taskId, input)
    setInput('')
    setLoading(false)
  }

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
      <p className="text-xs font-nunito font-semibold uppercase tracking-widest mb-2"
        style={{ color: 'var(--text-muted)' }}>
        Progress Log
      </p>
      {logs.length > 0 && (
        <div className="space-y-1.5 mb-3 max-h-28 overflow-y-auto custom-scroll">
          {logs.map(log => (
            <div key={log.id} className="text-xs font-nunito px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(19,19,58,0.6)', color: '#c0c0e0' }}>
              <span className="mr-2" style={{ color: 'var(--text-muted)' }}>
                {new Date(log.logged_at).toLocaleDateString()} {new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {log.note}
            </div>
          ))}
        </div>
      )}
      {logs.length === 0 && (
        <p className="text-xs font-nunito mb-2" style={{ color: 'var(--text-muted)' }}>
          No progress logged yet. Track your effort here!
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1 text-xs py-1.5"
          placeholder="Log your progress..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={200}
        />
        <motion.button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="px-3 py-1.5 rounded-lg text-xs font-nunito font-bold flex-shrink-0"
          style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}
          whileTap={{ scale: 0.95 }}
        >
          Log
        </motion.button>
      </div>
    </div>
  )
}

/* Minimum time the spinner stays up. The RPC is real work, so we don't pad the
   request — we just hold the spinner long enough that a fast response doesn't
   make it flash. */
const MIN_SPINNER_MS = 400
const PRESS_MS = 100

function TaskItem({ task, onComplete, onDelete, onAddProgress, logs, canLog, now, locked, onReward }) {
  const [expanded, setExpanded] = useState(false)
  /* idle -> pressing -> processing -> (success | idle) */
  const [stage, setStage] = useState('idle')
  const cardRef = useRef(null)
  const btnRef  = useRef(null)
  const alive   = useRef(true)
  /* Set on mount, not just cleared on unmount: React StrictMode runs the
     cleanup once immediately after mounting, and refs survive that cycle — so
     a cleanup-only effect would leave this false forever and every completion
     would bail out after the press stage. */
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const cfg = DIFF_CONFIG[task.difficulty || 'easy']

  /* Anti-cheat gate: a quest can only be completed after its difficulty's
     minimum active time. The server re-checks this in complete_task(). */
  const startedMs = new Date(task.started_at || task.created_at).getTime()
  const remaining = startedMs + DIFF_MIN_COMPLETE_MS[task.difficulty || 'easy'] - now
  /* `gated` = genuinely blocked (timer or lock) and drives the countdown pill.
     `ready` additionally requires an idle button, so the pill doesn't reappear
     mid-animation while a completion is being processed. */
  const pending = !task.completed && !!task.pending  // queued offline, awaiting verify
  const gated = !task.completed && !pending && (remaining > 0 || locked)
  const ready = !task.completed && !pending && !gated && stage === 'idle'

  const wait = (ms) => new Promise(r => setTimeout(r, ms))

  /* Reward feedback only fires once the server has actually awarded the
     points — a too_soon/locked rejection rewinds to idle with nothing shown. */
  const handleComplete = async () => {
    if (task.completed || !ready) return

    // Stage 1 — press.
    setStage('pressing')
    await wait(PRESS_MS)
    if (!alive.current) return

    // Stage 2 — validating against the server.
    setStage('processing')
    const startedAt = Date.now()
    const ok = await onComplete(task.id)
    const elapsed = Date.now() - startedAt
    if (elapsed < MIN_SPINNER_MS) await wait(MIN_SPINNER_MS - elapsed)
    if (!alive.current) return

    if (!ok) { setStage('idle'); return }

    // Stage 3 — success. Measured before React re-parents the card into the
    // Completed list, then handed to a portal so it survives the unmount.
    setStage('success')
    const card = cardRef.current?.getBoundingClientRect()
    const btn  = btnRef.current?.getBoundingClientRect()
    if (card && btn) {
      onReward?.({
        cardX: card.left + card.width / 2,
        cardY: card.top + card.height / 2,
        btnY:  btn.top + btn.height / 2,
        color: cfg.color,
        label: `+${cfg.pts} pts`,
      })
    }
  }

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`task-item relative px-4 py-3 mb-2 ${task.completed ? 'completed' : ''}`}
    >
      <div className="flex items-center gap-3">
        <motion.button
          ref={btnRef}
          onClick={handleComplete}
          disabled={task.completed || !ready}
          className="flex-shrink-0 relative"
          whileTap={ready ? { scale: 0.85 } : {}}
          animate={
            stage === 'pressing' ? { scale: 0.95 }
            : ready              ? { scale: [1, 1.12, 1] }
            :                      { scale: 1 }
          }
          transition={
            stage === 'pressing' ? { duration: PRESS_MS / 1000 }
            : ready              ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            :                      { duration: 0.2 }
          }
          style={{
            borderRadius: '50%',
            cursor: task.completed || !ready ? 'not-allowed' : 'pointer',
            boxShadow: ready ? `0 0 10px ${cfg.color}66` : 'none',
          }}
          aria-label={task.completed ? 'Completed' : ready ? 'Mark complete' : 'Not yet available'}
        >
          {stage === 'processing' ? (
            <motion.span
              className="spinner-ring"
              style={{ borderTopColor: cfg.color }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
            />
          ) : task.completed || stage === 'success' ? (
            /* Draws itself in on mount — including when the card re-mounts
               into the Completed list right after a successful completion. */
            <CheckDraw size={22} />
          ) : (
            <Circle size={22} style={{ color: cfg.color + (ready ? 'ff' : '38') }} className="transition-opacity" />
          )}
        </motion.button>

        <span
          className={`flex-1 text-sm font-nunito font-medium ${task.completed ? 'line-through' : ''}`}
          style={{ color: task.completed ? '#5050aa' : '#c0c0e0' }}
        >
          {task.text}
        </span>

        {pending && (
          <span
            className="flex items-center gap-1 text-xs font-nunito font-semibold flex-shrink-0 px-2 py-0.5 rounded-lg"
            style={{
              background: 'rgba(245,163,26,0.12)',
              color: 'var(--gold)',
              border: '1px solid rgba(245,163,26,0.3)',
            }}
            title="Completed offline — points are awarded once your connection returns"
          >
            <Clock size={11} />
            Pending verification
          </span>
        )}

        {gated && (
          <span
            className="flex items-center gap-1 text-xs font-nunito font-semibold flex-shrink-0 px-2 py-0.5 rounded-lg"
            style={{
              background: 'rgba(19,19,58,0.8)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(124,58,237,0.15)',
            }}
            title={locked
              ? 'Completions are temporarily locked'
              : `This ${cfg.label.toLowerCase()} quest unlocks after ${DIFF_MIN_COMPLETE_MS[task.difficulty || 'easy'] / 60000} min`}
          >
            <Clock size={11} style={{ color: cfg.color }} />
            {locked ? 'Locked' : `Available in ${formatCountdown(remaining)}`}
          </span>
        )}

        {canLog && !task.completed && (
          <motion.button
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 p-1 rounded-lg transition-colors"
            style={{ color: expanded ? '#a78bfa' : '#5050aa' }}
            whileHover={{ color: '#a78bfa' }}
            whileTap={{ scale: 0.9 }}
            title="Log progress"
          >
            {expanded ? <ChevronUp size={14} /> : <BookOpen size={14} />}
          </motion.button>
        )}

        {canLog && !task.completed && logs.length > 0 && !expanded && (
          <span className="text-xs font-nunito flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {logs.length}
          </span>
        )}

        <motion.button
          onClick={() => onDelete(task.id)}
          className="flex-shrink-0 p-1 rounded-lg"
          style={{ color: '#5050aa' }}
          whileHover={{ color: '#f43f5e', scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          aria-label="Delete task"
        >
          <Trash2 size={15} />
        </motion.button>
      </div>

      <AnimatePresence>
        {expanded && canLog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ProgressLogs taskId={task.id} logs={logs} onAdd={onAddProgress} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function TaskList() {
  const [activeDiff, setActiveDiff] = useState('easy')
  const [input, setInput] = useState('')
  const [plannedDate, setPlannedDate] = useState('')  // research: intended finish, '' = skipped
  const inputRef = useRef(null)
  const { tasks, addTask, completeTask, deleteTask, addProgressLog, progressLogs, profile, selectedPet } = useGame()

  const cfg = DIFF_CONFIG[activeDiff]

  /* One shared 1s tick drives every quest's completion countdown
     (and keeps the period "resets in" labels live too). */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const lockedUntil = profile?.completion_lock_until
    ? new Date(profile.completion_lock_until).getTime()
    : 0
  const locked = lockedUntil > now

  /* Celebration effects for a just-completed quest, anchored to viewport
     coordinates so they outlive the card being moved into the Completed list. */
  const [reward, setReward] = useState(null)
  const rewardTimer = useRef(null)
  const fireReward = useCallback((payload) => {
    setReward({ id: Date.now(), ...payload })
    clearTimeout(rewardTimer.current)
    // Clear once the longest effect (the 800ms float) has finished.
    rewardTimer.current = setTimeout(() => setReward(null), 900)
  }, [])
  useEffect(() => () => clearTimeout(rewardTimer.current), [])

  const hardStart  = new Date(profile?.hard_period_start  || 0).getTime()
  const medStart   = new Date(profile?.medium_period_start || 0).getTime()
  const hardLeft   = HARD_PERIOD_MS   - (now - hardStart)
  const medLeft    = MEDIUM_PERIOD_MS - (now - medStart)

  const hardInPeriod = hardLeft > 0
    ? tasks.filter(t => t.difficulty === 'hard'   && new Date(t.created_at).getTime() >= hardStart)
    : []
  const medInPeriod  = medLeft  > 0
    ? tasks.filter(t => t.difficulty === 'medium' && new Date(t.created_at).getTime() >= medStart)
    : []

  const hardSlots = hardInPeriod.length
  const medSlots  = medInPeriod.length

  const filteredTasks = tasks.filter(t => (t.difficulty || 'easy') === activeDiff)
  const activeTasks    = filteredTasks.filter(t => !t.completed)
  const completedTasks = filteredTasks.filter(t => t.completed)

  const atLimit =
    (activeDiff === 'hard'   && hardLeft > 0 && hardSlots >= 1) ||
    (activeDiff === 'medium' && medLeft  > 0 && medSlots  >= 3)

  const canAdd = !!input.trim() && !atLimit

  const handleAdd = async () => {
    if (!input.trim()) return
    const ok = await addTask(input, activeDiff, plannedDate || null)
    if (ok) {
      setInput('')
      setPlannedDate('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAdd() }

  const canLog = activeDiff === 'medium' || activeDiff === 'hard'

  return (
    <div className="flex flex-col h-full">
      <CompletionFx reward={reward} onDone={() => setReward(null)} />

      {/* Difficulty tabs */}
      <div className="flex gap-2 mb-4">
        {Object.entries(DIFF_CONFIG).map(([diff, c]) => (
          <button
            key={diff}
            onClick={() => setActiveDiff(diff)}
            className="flex-1 py-2 px-2 rounded-xl text-xs font-nunito font-bold transition-all"
            style={{
              background: activeDiff === diff ? c.color + '22' : 'rgba(19,19,58,0.5)',
              color:      activeDiff === diff ? c.color : '#8080aa',
              border:     `1px solid ${activeDiff === diff ? c.color + '55' : 'rgba(124,58,237,0.15)'}`,
            }}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Period / slot info */}
      {activeDiff !== 'easy' && (
        <motion.div
          key={activeDiff}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl text-xs font-nunito"
          style={{ background: cfg.color + '10', border: `1px solid ${cfg.color}25` }}
        >
          <div className="flex items-center gap-2">
            <Clock size={11} style={{ color: cfg.color }} />
            <span style={{ color: cfg.color }} className="font-bold">
              {activeDiff === 'hard' ? `${hardSlots}/1` : `${medSlots}/3`} slots used
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>
            {activeDiff === 'hard'
              ? hardLeft > 0  ? `Resets in ${formatTimeLeft(hardLeft)}` : 'Period reset — slot available!'
              : medLeft  > 0  ? `Resets in ${formatTimeLeft(medLeft)}`  : 'Period reset — slots available!'}
          </span>
          <span className="font-bold px-1.5 py-0.5 rounded-lg"
            style={{ background: cfg.color + '20', color: cfg.color }}>
            +{cfg.pts} pts
          </span>
        </motion.div>
      )}

      {/* Hard mode description */}
      {activeDiff === 'hard' && (
        <p className="text-xs font-nunito mb-3 px-1" style={{ color: 'var(--text-muted)' }}>
          Hard quests are intense, week-long challenges. Log your daily progress to stay on track.
        </p>
      )}

      {activeDiff === 'medium' && (
        <p className="text-xs font-nunito mb-3 px-1" style={{ color: 'var(--text-muted)' }}>
          Medium quests span 3 days. Example: study 12 hours split across the period. Log progress as you go.
        </p>
      )}

      {/* Add input */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          className="input-field flex-1"
          placeholder={atLimit ? `${cfg.label} quest limit reached` : `Add a ${cfg.label.toLowerCase()} quest...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
          disabled={atLimit}
        />
        <motion.button
          className="btn-gold px-4 py-2.5 flex items-center gap-1.5 text-sm font-nunito font-bold flex-shrink-0"
          onClick={handleAdd}
          whileTap={{ scale: 0.95 }}
          disabled={!canAdd}
        >
          <Plus size={16} />
          Add
        </motion.button>
      </div>

      {/* Planned finish — research: measures planning/scheduling behaviour.
          Optional; left blank it saves null. min=now discourages back-dating a
          plan, though the server does not reject it. */}
      <div className="flex items-center gap-2 mb-4 -mt-1 px-1">
        <CalendarClock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <label htmlFor="planned-date" className="text-xs font-nunito flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          Plan to finish?
        </label>
        <input
          id="planned-date"
          type="datetime-local"
          className="input-field text-xs py-1.5 flex-1"
          value={plannedDate}
          min={new Date().toISOString().slice(0, 16)}
          onChange={e => setPlannedDate(e.target.value)}
          disabled={atLimit}
          title="Optional — when do you plan to finish this quest?"
        />
        {plannedDate && (
          <button
            onClick={() => setPlannedDate('')}
            className="text-xs font-nunito px-2 py-1 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-muted)', background: 'rgba(19,19,58,0.6)' }}
            title="Clear planned date"
          >
            Clear
          </button>
        )}
      </div>

      {activeDiff === 'easy' && (
        <div className="flex justify-end mb-2">
          <span className="text-xs font-nunito px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(245,163,26,0.1)', color: '#f5a31a', border: '1px solid rgba(245,163,26,0.2)' }}>
            +10 pts per quest
          </span>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto max-h-60 pr-1 custom-scroll">
        {filteredTasks.length === 0 && (
          <motion.div
            key={activeDiff}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6"
          >
            <EmptyStatePet difficulty={activeDiff} emoji={selectedPet?.emoji || cfg.emoji} />
            <p className="text-xs font-nunito mt-2" style={{ color: 'var(--text-soft)' }}>
              {cfg.desc} · +{cfg.pts} pts each
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {activeTasks.map(task => (
            <div key={task.id} className="group">
              <TaskItem
                task={task}
                onComplete={completeTask}
                onDelete={deleteTask}
                onAddProgress={addProgressLog}
                logs={progressLogs[task.id] || []}
                canLog={canLog}
                now={now}
                locked={locked}
                onReward={fireReward}
              />
            </div>
          ))}

          {completedTasks.length > 0 && (
            <motion.div key="completed-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-xs uppercase tracking-widest font-nunito font-semibold mb-2 mt-3 px-1"
                style={{ color: 'var(--text-muted)' }}>
                Completed ({completedTasks.length})
              </p>
              {completedTasks.slice(-5).map(task => (
                <div key={task.id} className="group">
                  <TaskItem
                    task={task}
                    onComplete={completeTask}
                    onDelete={deleteTask}
                    onAddProgress={addProgressLog}
                    logs={progressLogs[task.id] || []}
                    canLog={false}
                    now={now}
                    locked={locked}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {filteredTasks.length > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs font-nunito"
          style={{ borderColor: 'rgba(124,58,237,0.15)', color: 'var(--text-muted)' }}>
          <span>{activeTasks.length} quest{activeTasks.length !== 1 ? 's' : ''} remaining</span>
          <span className="font-semibold" style={{ color: '#22c55e' }}>
            {completedTasks.length} completed ✓
          </span>
        </div>
      )}
    </div>
  )
}
