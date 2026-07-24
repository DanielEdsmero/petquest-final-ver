import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target } from 'lucide-react'
import { useGame } from '../context/GameContext'
import CountUp from './reactbits/CountUp'

/*
 * Research feedback widget: shows the player their own planning accuracy and
 * procrastination, computed straight from the tasks already in context — no
 * extra query, and it updates the moment a completion mirrors its metrics back.
 *
 * Planning accuracy uses the same definition as the admin study RPC: of the
 * completed quests that HAD a planned date, the share finished on or before it.
 * Quests completed without a plan are excluded — you can't be on time for a
 * deadline you never set — so the widget hides itself until at least one
 * planned quest has been completed, rather than showing a hollow 0%.
 */
export default function PlanningStats() {
  const { tasks } = useGame()

  const stats = useMemo(() => {
    const completed = tasks.filter(t => t.completed)
    const planned = completed.filter(t => t.planned_completion_date)
    const onTime = planned.filter(t =>
      new Date(t.completed_at) <= new Date(t.planned_completion_date))
    const procrastinated = completed.filter(t => t.is_procrastinated)

    return {
      plannedCount: planned.length,
      accuracy: planned.length ? Math.round((onTime.length / planned.length) * 100) : null,
      onTime: onTime.length,
      completedCount: completed.length,
      procrastinatedCount: procrastinated.length,
    }
  }, [tasks])

  // Nothing meaningful to show until the player has finished a planned quest.
  if (stats.accuracy == null) return null

  const color = stats.accuracy >= 70 ? '#4ade80' : stats.accuracy >= 40 ? '#f5a31a' : '#f43f5e'
  const message = stats.accuracy >= 70
    ? 'Great planning — keep it up!'
    : stats.accuracy >= 40
    ? 'Getting there — aim to beat your deadlines.'
    : 'Try setting realistic deadlines and beating them.'

  return (
    <motion.div
      className="glass-card p-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-3 flex items-center gap-2"
        style={{ color: 'var(--text-muted)' }}>
        <Target size={14} style={{ color }} /> Planning Stats
      </h3>

      <div className="flex items-center gap-4">
        {/* Accuracy dial */}
        <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
          <svg width="68" height="68" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="34" cy="34" r="29" fill="none" stroke="rgba(30,30,74,0.8)" strokeWidth="6" />
            <motion.circle
              cx="34" cy="34" r="29" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 29}
              initial={{ strokeDashoffset: 2 * Math.PI * 29 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 29 * (1 - stats.accuracy / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-cinzel font-black text-lg"
            style={{ color }}>
            <CountUp to={stats.accuracy} suffix="%" duration={1.1} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-nunito font-bold text-sm" style={{ color: '#e2e2ff' }}>
            You finished {stats.onTime} of {stats.plannedCount} planned quest{stats.plannedCount !== 1 ? 's' : ''} on time!
          </p>
          <p className="text-xs font-nunito mt-1" style={{ color: 'var(--text-soft)' }}>
            {message}
          </p>
          {stats.procrastinatedCount > 0 && (
            <p className="text-xs font-nunito mt-1.5" style={{ color: 'var(--text-muted)' }}>
              ⏰ {stats.procrastinatedCount} completed late overall
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
