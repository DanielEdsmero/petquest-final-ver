import { motion } from 'framer-motion'
import useReducedMotion from '../hooks/useReducedMotion'

/*
 * Small connectivity dot for the navbar.
 *   online   → green (steady)
 *   degraded → amber (a call failed, or quests are queued) — pulses
 *   offline  → amber (no network) — pulses
 * Two colours per spec (green / yellow); offline and degraded share amber and
 * are distinguished by the tooltip.
 */
const META = {
  online:   { color: '#22c55e', label: 'Connected' },
  degraded: { color: '#f59e0b', label: 'Degraded connection' },
  offline:  { color: '#f59e0b', label: 'Offline' },
}

export default function ConnectionStatus({ connection = 'online', pendingCount = 0 }) {
  const reduceMotion = useReducedMotion()
  const m = META[connection] || META.online
  const unsettled = connection !== 'online'

  const title =
    connection === 'online'
      ? 'Connected'
      : `${m.label}${pendingCount ? ` — ${pendingCount} quest${pendingCount > 1 ? 's' : ''} pending verification` : ''}`

  return (
    <span
      className="flex items-center gap-1.5 flex-shrink-0"
      role="status"
      aria-label={title}
      title={title}
    >
      <motion.span
        style={{
          width: 9, height: 9, borderRadius: '50%',
          background: m.color,
          boxShadow: `0 0 8px ${m.color}`,
          display: 'block',
        }}
        animate={unsettled && !reduceMotion ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
        transition={{ duration: 1.2, repeat: unsettled ? Infinity : 0, ease: 'easeInOut' }}
      />
      {pendingCount > 0 && (
        <span className="text-xs font-nunito font-bold tabular-nums" style={{ color: m.color }}>
          {pendingCount}
        </span>
      )}
    </span>
  )
}
