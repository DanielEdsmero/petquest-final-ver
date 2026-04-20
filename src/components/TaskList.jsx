import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Plus, CheckCircle2, Circle, BookOpen, Clock, ChevronUp } from 'lucide-react'
import { useGame, HARD_PERIOD_MS, MEDIUM_PERIOD_MS } from '../context/GameContext'

const DIFF_CONFIG = {
  easy:   { label: 'Easy',   emoji: '🌱', pts: 10, color: '#22c55e', limit: null, desc: 'Unlimited · Daily quests' },
  medium: { label: 'Medium', emoji: '⚡', pts: 25, color: '#f5a31a', limit: 3,    desc: '3 quests per 3 days' },
  hard:   { label: 'Hard',   emoji: '🔥', pts: 50, color: '#f43f5e', limit: 1,    desc: '1 quest per week' },
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

function TaskItem({ task, onComplete, onDelete, onAddProgress, logs, canLog }) {
  const [showFloat, setShowFloat] = useState(false)
  const [expanded,  setExpanded]  = useState(false)
  const cfg = DIFF_CONFIG[task.difficulty || 'easy']

  const handleComplete = () => {
    if (task.completed) return
    setShowFloat(true)
    setTimeout(() => setShowFloat(false), 1200)
    onComplete(task.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`task-item relative px-4 py-3 mb-2 ${task.completed ? 'completed' : ''}`}
    >
      <AnimatePresence>
        {showFloat && (
          <motion.div
            className="float-label font-bold text-sm"
            style={{ color: cfg.color, top: '-10px' }}
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -50, opacity: 0 }}
            exit={{}}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            +{cfg.pts} ✨
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        <motion.button
          onClick={handleComplete}
          disabled={task.completed}
          className="flex-shrink-0"
          whileTap={{ scale: 0.85 }}
          aria-label={task.completed ? 'Completed' : 'Mark complete'}
        >
          {task.completed
            ? <CheckCircle2 size={22} className="text-green-500" />
            : <Circle size={22} style={{ color: cfg.color + '70' }} className="hover:opacity-100 transition-opacity" />
          }
        </motion.button>

        <span
          className={`flex-1 text-sm font-nunito font-medium ${task.completed ? 'line-through' : ''}`}
          style={{ color: task.completed ? '#5050aa' : '#c0c0e0' }}
        >
          {task.text}
        </span>

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
  const inputRef = useRef(null)
  const { tasks, addTask, completeTask, deleteTask, addProgressLog, progressLogs, profile } = useGame()

  const cfg = DIFF_CONFIG[activeDiff]

  const now        = Date.now()
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
    const ok = await addTask(input, activeDiff)
    if (ok) {
      setInput('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAdd() }

  const canLog = activeDiff === 'medium' || activeDiff === 'hard'

  return (
    <div className="flex flex-col h-full">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <div className="text-3xl mb-2">{cfg.emoji}</div>
            <p className="text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
              No {cfg.label.toLowerCase()} quests yet.
            </p>
            <p className="text-xs font-nunito mt-1" style={{ color: 'var(--text-muted)' }}>
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
