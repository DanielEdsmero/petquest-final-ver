import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target, Clock, CalendarCheck, Flame } from 'lucide-react'
import { useGame } from '../context/GameContext'

/*
 * "My Stats" — the participant's own self-regulation feedback (research construct
 * 2.5). Surfaces the time-management / planning numbers the study measures, so a
 * participant sees their own on-time rate and delay — the feedback loop the
 * theory rests on. All derived from the local task list; no extra fetch.
 */
export default function MyStats() {
  const { tasks, currentStreak } = useGame()

  const s = useMemo(() => {
    const completed = tasks.filter(t => t.completed)
    const planned   = completed.filter(t => t.planned_completion_date && t.completed_at)
    const onTime    = planned.filter(t => new Date(t.completed_at) <= new Date(t.planned_completion_date))
    const late      = planned.filter(t => new Date(t.completed_at) > new Date(t.planned_completion_date))
    const onTimeRate = planned.length ? Math.round((onTime.length / planned.length) * 100) : null
    const avgDelayMin = late.length
      ? Math.round(late.reduce((sum, t) =>
          sum + (new Date(t.completed_at) - new Date(t.planned_completion_date)) / 60000, 0) / late.length)
      : 0
    const goalsSet = tasks.filter(t => t.goal).length
    return { onTimeRate, lateCount: late.length, avgDelayMin, goalsSet, plannedCount: planned.length }
  }, [tasks])

  const fmtDelay = (min) => min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`

  const cards = [
    { Icon: CalendarCheck, color: '#4ade80', label: 'On-time rate',
      value: s.onTimeRate == null ? '—' : `${s.onTimeRate}%`,
      sub: s.plannedCount ? `${s.plannedCount} planned quest${s.plannedCount !== 1 ? 's' : ''}` : 'no planned quests yet' },
    { Icon: Clock, color: '#fb7185', label: 'Completed late', value: s.lateCount,
      sub: s.lateCount ? `avg ${fmtDelay(s.avgDelayMin)} late` : 'none late' },
    { Icon: Flame, color: '#f5a31a', label: 'Current streak', value: currentStreak || 0, sub: 'verified days' },
    { Icon: Target, color: '#a78bfa', label: 'Goals set', value: s.goalsSet, sub: 'quests with a goal' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
      <h3 className="font-cinzel font-bold text-base flex items-center gap-2 mb-4">
        <Target size={16} style={{ color: '#f5a31a' }} /> My Stats
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ Icon, color, label, value, sub }) => (
          <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(19,19,58,0.4)', border: '1px solid rgba(124,58,237,0.12)' }}>
            <Icon size={15} style={{ color }} />
            <div className="font-cinzel font-black text-xl mt-1" style={{ color }}>{value}</div>
            <div className="text-[11px] font-nunito font-bold" style={{ color: 'var(--text-soft)' }}>{label}</div>
            <div className="text-[10px] font-nunito" style={{ color: 'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
