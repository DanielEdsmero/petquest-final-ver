import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Plus, Circle, BookOpen, Clock, ChevronUp, CalendarClock, RefreshCw, PencilLine, ShieldCheck, Target } from 'lucide-react'
import { useGame, HARD_PERIOD_MS, MEDIUM_PERIOD_MS, DIFF_MIN_COMPLETE_MS, DIFF_POINTS } from '../context/GameContext'
import CompletionFx from './animations/CompletionFx'
import CheckDraw from './animations/CheckDraw'
import EmptyStatePet from './animations/EmptyStatePet'
import { MascotLoaderCompact } from './animations/MascotLoader'
import VerificationModal from './VerificationModal'
import { DIFFICULTY_COLORS } from '../data/difficulty'
import {
  EVIDENCE_TYPES, evidenceMeta, PRIORITIES, VALIDITY_META, isQuestEligible, CHECK_STEPS, CHECK_EXPLAINER,
} from '../data/questValidity'

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

/* ISO timestamp → the local "YYYY-MM-DDTHH:MM" a datetime-local input expects. */
function toLocalInput(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function TaskItem({ task, onVerify, onDelete, onAddProgress, onRevise, onRecheck, logs, canLog, now, locked }) {
  const [expanded, setExpanded] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  /* Completion now goes through the VerificationModal (opened via onVerify),
     so the button only needs an idle/ready/completed view. */
  const [stage] = useState('idle')
  const cardRef = useRef(null)
  const btnRef  = useRef(null)

  const cfg = DIFF_CONFIG[task.difficulty || 'easy']

  /* Anti-farm cooldown: anchored to the LAST completion, not creation, so brand
     new starter quests are instantly verifiable while re-completing the same
     quest still waits out its difficulty cooldown. The server mirrors this in
     complete_task(). A never-completed quest has no cooldown. */
  const lastDoneMs = task.completed_at ? new Date(task.completed_at).getTime() : 0
  const remaining = lastDoneMs ? (lastDoneMs + DIFF_MIN_COMPLETE_MS[task.difficulty || 'easy'] - now) : 0
  /* `gated` = genuinely blocked (timer or lock) and drives the countdown pill.
     `ready` additionally requires an idle button, so the pill doesn't reappear
     mid-animation while a completion is being processed. */
  const verifying = !task.completed && !!task.verifying  // proof submitted, awaiting AI verdict
  const pending = !task.completed && !verifying && !!task.pending
  const gated = !task.completed && !pending && !verifying && (remaining > 0 || locked)
  /* Phase 12: a custom quest is completable only once its validity check has
     accepted it (or it is an exempt starter quest). Mirrored server-side by the
     tasks_validity_guard trigger, so this is UX, not the enforcement. */
  const eligible = isQuestEligible(task)
  const validity = !task.completed && !eligible ? VALIDITY_META[task.validity_status] : null
  const ready = !task.completed && !pending && !verifying && !gated && eligible && stage === 'idle'
  const pri = PRIORITIES.find(p => p.id === task.priority)
  const evidence = task.evidence_type ? evidenceMeta(task.evidence_type) : null

  const handleRecheck = async () => {
    if (rechecking) return
    setRechecking(true)
    await onRecheck?.(task)
    setRechecking(false)
  }

  /* Completion requires evidence — open the verification modal (which handles
     photo + log + provisional award). The time-gate `ready` check gates it. */
  const handleComplete = () => {
    if (task.completed || !ready) return
    onVerify?.(task)
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
          animate={ready ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={ready
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }}
          style={{
            borderRadius: '50%',
            cursor: task.completed || !ready ? 'not-allowed' : 'pointer',
            boxShadow: ready ? `0 0 10px ${cfg.color}66` : 'none',
          }}
          aria-label={task.completed ? 'Completed' : ready ? 'Verify & complete' : validity ? validity.hint : 'Not yet available'}
          title={validity ? validity.hint : undefined}
        >
          {task.completed
            ? <CheckDraw size={22} />
            : <Circle size={22} style={{ color: cfg.color + (ready ? 'ff' : '38') }} className="transition-opacity" />}
        </motion.button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {pri && pri.id !== 'P2' && (
              <span className="text-[9px] font-nunito font-black px-1 py-0.5 rounded flex-shrink-0"
                style={{ background: pri.color + '22', color: pri.color }} title={`Priority ${pri.id} · ${pri.label}`}>
                {pri.id}
              </span>
            )}
            <span
              className={`text-sm font-nunito font-medium truncate ${task.completed ? 'line-through' : ''}`}
              style={{ color: task.completed ? '#5050aa' : '#c0c0e0' }}
              title={task.text}
            >
              {task.text}
            </span>
          </div>
          {(task.goal || evidence) && !task.completed && (
            <div className="flex items-center gap-2 mt-0.5 text-[10px] font-nunito min-w-0" style={{ color: 'var(--text-muted)' }}>
              {task.goal && <span className="truncate" title={task.goal}>🎯 {task.goal}</span>}
              {evidence && <span className="flex-shrink-0" title={`Evidence: ${evidence.label}`}>{evidence.emoji}</span>}
            </div>
          )}
          {validity && task.validity_reason && (
            <p className="text-[10px] font-nunito mt-0.5" style={{ color: validity.color }}>{task.validity_reason}</p>
          )}
        </div>

        {validity && (
          <span
            className="flex items-center gap-1 text-xs font-nunito font-semibold flex-shrink-0 px-2 py-0.5 rounded-lg"
            style={{ background: validity.color + '1f', color: validity.color, border: `1px solid ${validity.color}4d` }}
            title={validity.hint}
          >
            <ShieldCheck size={11} />
            {validity.label}
          </span>
        )}

        {validity && task.validity_status === 'pending_ai_review' && (
          <motion.button
            onClick={handleRecheck}
            disabled={rechecking}
            className="flex-shrink-0 p-1 rounded-lg"
            style={{ color: '#22d3ee' }}
            whileTap={{ scale: 0.9 }}
            title="Run the quest check again"
            aria-label="Run the quest check again"
          >
            <motion.span animate={rechecking ? { rotate: 360 } : { rotate: 0 }}
              transition={rechecking ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
              style={{ display: 'inline-flex' }}>
              <RefreshCw size={14} />
            </motion.span>
          </motion.button>
        )}

        {validity && task.validity_status !== 'pending_ai_review' && (
          <motion.button
            onClick={() => onRevise?.(task)}
            className="flex-shrink-0 p-1 rounded-lg"
            style={{ color: validity.color }}
            whileTap={{ scale: 0.9 }}
            title="Revise this quest and check it again"
            aria-label="Revise this quest"
          >
            <PencilLine size={14} />
          </motion.button>
        )}

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

        {verifying && (
          <span
            className="flex items-center gap-1 text-xs font-nunito font-semibold flex-shrink-0 px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}
            title="Proof submitted — verifying. Points are pending until the verdict."
          >
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-flex' }}>
              <Clock size={11} />
            </motion.span>
            Verifying…
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
  const [plannedDate, setPlannedDate] = useState('')  // research: intended finish, required for medium/hard
  const [goal, setGoal] = useState('')                // research: goal statement (what does "done" look like?)
  const [priority, setPriority] = useState('P2')       // research: prioritization P1/P2/P3
  const [evidenceType, setEvidenceType] = useState('photo')  // Phase 12: how completion will be shown
  const [revisingId, setRevisingId] = useState(null)   // a saved quest being revised → deleted once the new one is accepted
  /* Phase 12 check state: null | { step } while checking; result = the last
     clarify/reject/pending message shown above the form. */
  const [checking, setChecking] = useState(null)
  const [checkResult, setCheckResult] = useState(null)
  const inputRef = useRef(null)
  const { tasks, addTask, recheckQuest, deleteTask, addProgressLog, progressLogs, profile, selectedPet, addNotification } = useGame()

  /* The quest currently being verified (opens VerificationModal). Owned here,
     not in TaskItem, so it survives the card re-parenting on completion. */
  const [verifyingTask, setVerifyingTask] = useState(null)

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

  /* Required research inputs (client-side gate; the server re-validates):
     a goal statement on every quest, a planned finish date on Medium/Hard,
     a priority and an evidence type. Easy quests keep the date optional. */
  const needsPlan = activeDiff !== 'easy'
  const goalOk = goal.trim().length >= 10
  const planOk = !needsPlan || !!plannedDate
  const showDetails = !!input.trim() || !!goal || !!plannedDate || !!revisingId
  const canAdd = !!input.trim() && goalOk && planOk && !atLimit && !checking

  /* Advance the loading label on a gentle timer while the single server call is
     in flight; the final "Saving" step is set when the response lands. */
  useEffect(() => {
    if (!checking) return
    const id = setInterval(() => setChecking(c => c && c.step < CHECK_STEPS.length - 2 ? { step: c.step + 1 } : c), 1600)
    return () => clearInterval(id)
  }, [checking])

  const resetForm = () => {
    setInput(''); setPlannedDate(''); setGoal(''); setPriority('P2'); setEvidenceType('photo'); setRevisingId(null)
  }

  const handleAdd = async () => {
    if (!input.trim() || checking) return
    if (!goalOk) { addNotification('Add a goal statement — what does “done” look like? (at least 10 characters)', 'error'); return }
    if (!planOk) { addNotification(`${cfg.label} quests need a planned finish date.`, 'error'); return }
    setCheckResult(null)
    setChecking({ step: 0 })
    const res = await addTask(input, activeDiff, plannedDate || null, { goal, priority, evidenceType })
    if (res.ok) {   // something was saved → show the last step briefly
      setChecking({ step: CHECK_STEPS.length - 1 })
      await new Promise(r => setTimeout(r, 400))
    }
    setChecking(null)

    if (res.ok) {
      if (revisingId) deleteTask(revisingId)   // the revised draft replaces the old row
      if (res.decision === 'accept') {
        addNotification('✅ Quest accepted — it’s in your log.', 'success')
        setCheckResult(null)
      } else {
        setCheckResult({ tone: 'info', title: 'Saved — awaiting check', reason: res.reason })
      }
      resetForm()
      inputRef.current?.focus()
      return
    }
    /* Not saved: keep the draft so the participant can revise and resubmit. */
    if (res.decision === 'clarify') {
      setCheckResult({ tone: 'warn', title: 'Almost there — a bit more detail needed', reason: res.reason, evidence: res.recommendedEvidenceType })
    } else if (res.decision === 'reject') {
      setCheckResult({ tone: 'bad', title: 'This quest wasn’t accepted yet', reason: res.reason, evidence: res.recommendedEvidenceType })
    } else if (res.decision === 'invalid') {
      addNotification(res.reason, 'error')
    } else if (res.decision !== 'limit') {
      setCheckResult({ tone: 'info', title: 'Quest check unavailable', reason: res.reason })
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAdd() }

  /* Pre-fill the form from a saved quest the check sent back. The old row is
     removed only once the revised quest is accepted or saved as pending. */
  const handleRevise = (task) => {
    setActiveDiff(task.difficulty || 'easy')
    setInput(task.text || '')
    setGoal(task.goal || '')
    setPriority(['P1', 'P2', 'P3'].includes(task.priority) ? task.priority : 'P2')
    setEvidenceType(task.evidence_type || 'photo')
    setPlannedDate(task.planned_completion_date ? toLocalInput(task.planned_completion_date) : '')
    setRevisingId(task.id)
    setCheckResult(task.validity_reason ? { tone: 'warn', title: 'Revise and check again', reason: task.validity_reason } : null)
    inputRef.current?.focus()
  }

  const handleRecheck = async (task) => {
    const res = await recheckQuest(task.id)
    if (res.decision === 'accept') addNotification('✅ Quest accepted — you can work on it now.', 'success')
    else if (res.decision === 'pending') addNotification(res.reason, 'info')
    else if (res.ok === false && res.reason) addNotification(res.reason, res.decision === 'clarify' || res.decision === 'reject' ? 'info' : 'error')
  }

  const canLog = activeDiff === 'medium' || activeDiff === 'hard'

  /* Fired when the modal reports a provisional award — plays the reward burst
     from screen centre (the card is already moving to the Completed list). */
  const handleVerified = () => {
    fireReward({
      cardX: window.innerWidth / 2, cardY: window.innerHeight / 2,
      btnY: window.innerHeight / 2, color: '#f5a31a', label: '+pts',
    })
  }

  return (
    <div className="flex flex-col h-full">
      <CompletionFx reward={reward} onDone={() => setReward(null)} />

      {verifyingTask && (
        <VerificationModal
          task={verifyingTask}
          onClose={() => setVerifyingTask(null)}
          onVerified={handleVerified}
        />
      )}

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
              {activeTasks.length} {cfg.label.toLowerCase()} quest{activeTasks.length !== 1 ? 's' : ''} active
            </span>
          </div>
          {/* Only show reset/countdown text when a period is actually anchored;
              otherwise the "Period reset" line is misleading (no period running). */}
          {(activeDiff === 'hard' ? hardStart > 0 : medStart > 0) && (
            <span style={{ color: 'var(--text-muted)' }}>
              {activeDiff === 'hard'
                ? (hardLeft > 0 ? `Resets in ${formatTimeLeft(hardLeft)}` : 'Period reset — slot available!')
                : (medLeft  > 0 ? `Resets in ${formatTimeLeft(medLeft)}`  : 'Period reset — slots available!')}
            </span>
          )}
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

      {/* Phase 12: outcome of the last quest check (clarify / reject / pending). */}
      <AnimatePresence>
        {checkResult && !checking && (
          <motion.div
            key={checkResult.title + checkResult.reason}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-3 px-3 py-2.5 rounded-xl text-xs font-nunito"
            style={{
              background: (checkResult.tone === 'bad' ? '#fb7185' : checkResult.tone === 'warn' ? '#f5a31a' : '#22d3ee') + '14',
              border: `1px solid ${(checkResult.tone === 'bad' ? '#fb7185' : checkResult.tone === 'warn' ? '#f5a31a' : '#22d3ee')}40`,
            }}
            role="status"
          >
            <p className="font-bold mb-0.5" style={{ color: checkResult.tone === 'bad' ? '#fb7185' : checkResult.tone === 'warn' ? '#f5a31a' : '#22d3ee' }}>
              {checkResult.title}
            </p>
            <p style={{ color: '#c0c0e0' }}>{checkResult.reason}</p>
            {checkResult.evidence && checkResult.evidence !== evidenceType && (
              <button type="button" onClick={() => setEvidenceType(checkResult.evidence)}
                className="mt-1.5 px-2 py-1 rounded-lg font-bold"
                style={{ background: 'rgba(19,19,58,0.7)', color: '#e2e2ff', border: '1px solid rgba(124,58,237,0.3)' }}>
                Use {evidenceMeta(checkResult.evidence).emoji} {evidenceMeta(checkResult.evidence).label} as evidence
              </button>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setCheckResult(null)} className="mt-1 px-2 py-0.5 rounded-lg"
                style={{ color: 'var(--text-muted)' }}>
                {checkResult.tone === 'info' ? 'OK' : 'OK, I’ll revise'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 12: compact Mascot Idle loader while the server + AI check runs. */}
      {checking && (
        <div className="mb-4">
          <MascotLoaderCompact petId={profile?.selected_pet_id || 'dragon'} level={profile?.pet_level || 1}
            text={CHECK_STEPS[checking.step] + '…'} accent={cfg.color} />
        </div>
      )}

      {/* Add input */}
      <div className="flex gap-2 mb-3" style={checking ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
        <input
          ref={inputRef}
          type="text"
          className="input-field flex-1"
          placeholder={atLimit ? `${cfg.label} quest limit reached` : `Add a ${cfg.label.toLowerCase()} quest...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
          disabled={atLimit || !!checking}
          aria-label="Quest title"
        />
        <motion.button
          className="btn-gold px-4 py-2.5 flex items-center gap-1.5 text-sm font-nunito font-bold flex-shrink-0"
          onClick={handleAdd}
          whileTap={{ scale: 0.95 }}
          disabled={!canAdd}
          title={!input.trim() ? 'Type a quest title' : !goalOk ? 'Add a goal statement (10+ characters)' : !planOk ? 'Pick a planned finish date' : revisingId ? 'Check the revised quest' : 'Check & add quest'}
        >
          <Plus size={16} />
          {revisingId ? 'Re-check' : 'Add'}
        </motion.button>
      </div>

      {/* Quest details — revealed once a title is being typed so the empty form
          stays uncluttered. Goal + priority + evidence are research inputs the
          validity check reads; the planned date is required on Medium/Hard. */}
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={checking ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            {revisingId && (
              <div className="flex items-center justify-between mb-2 px-1 text-[10px] font-nunito" style={{ color: 'var(--text-muted)' }}>
                <span>✏️ Revising a saved quest — the old version is replaced once this one is accepted.</span>
                <button type="button" onClick={resetForm} style={{ color: '#a78bfa' }}>Cancel</button>
              </div>
            )}

            {/* Goal statement (goal-setting construct) — required on every quest. */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <Target size={13} style={{ color: goalOk ? '#4ade80' : 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Goal — what does “done” look like? (e.g. all 10 problems solved & checked)"
                value={goal}
                onChange={e => setGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={140}
                disabled={atLimit}
                aria-label="Goal statement"
              />
              <span className="text-[10px] font-nunito flex-shrink-0 w-10 text-right"
                style={{ color: goalOk ? '#4ade80' : 'var(--text-muted)' }}>
                {goal.trim().length < 10 ? `${goal.trim().length}/10` : '✓'}
              </span>
            </div>

            {/* Priority (prioritization construct) + evidence type (verifiability). */}
            <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
              <span className="text-xs font-nunito flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Priority</span>
              {PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                  className="text-xs font-nunito font-bold px-2 py-1 rounded-lg"
                  style={{
                    background: priority === p.id ? p.color + '22' : 'rgba(19,19,58,0.5)',
                    color: priority === p.id ? p.color : '#8080aa',
                    border: `1px solid ${priority === p.id ? p.color + '66' : 'rgba(124,58,237,0.15)'}`,
                  }}
                  title={p.label} aria-pressed={priority === p.id}>
                  {p.id}
                </button>
              ))}
              <label htmlFor="evidence-type" className="text-xs font-nunito flex-shrink-0 ml-auto" style={{ color: 'var(--text-muted)' }}>
                Evidence
              </label>
              <select
                id="evidence-type"
                className="input-field text-xs py-1 pr-6 flex-shrink-0"
                style={{ width: 'auto', maxWidth: 190 }}
                value={evidenceType}
                onChange={e => setEvidenceType(e.target.value)}
                disabled={atLimit}
                title={evidenceMeta(evidenceType).desc}
              >
                {EVIDENCE_TYPES.map(e => (
                  <option key={e.id} value={e.id}>{e.emoji} {e.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] font-nunito mb-2 px-1 text-right" style={{ color: 'var(--text-muted)' }}>
              {evidenceMeta(evidenceType).desc}
            </p>

            {/* Planned finish — research: planning/scheduling behaviour. Required on
                Medium/Hard; optional on Easy. min=now discourages back-dating (the
                server rejects clearly past dates). */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <CalendarClock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <label htmlFor="planned-date" className="text-xs font-nunito flex-shrink-0"
                style={{ color: needsPlan && !plannedDate ? '#fb7185' : 'var(--text-muted)' }}>
                Plan to finish?{needsPlan ? ' *' : ''}
              </label>
              <input
                id="planned-date"
                type="datetime-local"
                className="input-field text-xs py-1.5 flex-1"
                value={plannedDate}
                min={new Date().toISOString().slice(0, 16)}
                onChange={e => setPlannedDate(e.target.value)}
                disabled={atLimit}
                title={needsPlan ? 'Required — when do you plan to finish this quest?' : 'Optional — when do you plan to finish this quest?'}
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

            <p className="flex items-start gap-1.5 text-[10px] font-nunito mb-3 px-1" style={{ color: 'var(--text-soft)' }}>
              <ShieldCheck size={12} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 1 }} />
              <span>{CHECK_EXPLAINER}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end mb-2">
        <span className="text-xs font-nunito px-2 py-0.5 rounded-lg"
          style={{ background: 'rgba(245,163,26,0.1)', color: '#f5a31a', border: '1px solid rgba(245,163,26,0.2)' }}>
          +{DIFF_POINTS[activeDiff] ?? DIFF_POINTS.easy} pts per quest
        </span>
      </div>

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
                onVerify={setVerifyingTask}
                onDelete={deleteTask}
                onAddProgress={addProgressLog}
                onRevise={handleRevise}
                onRecheck={handleRecheck}
                logs={progressLogs[task.id] || []}
                canLog={canLog}
                now={now}
                locked={locked}
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
                    onVerify={setVerifyingTask}
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
