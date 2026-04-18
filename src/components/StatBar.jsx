import { motion } from 'framer-motion'

const STAT_CONFIG = {
  hunger: {
    label: 'Hunger',
    icon: '🍖',
    colors: {
      high: { bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)', glow: 'rgba(245, 158, 11, 0.5)' },
      mid: { bar: 'linear-gradient(90deg, #f97316, #fb923c)', glow: 'rgba(249, 115, 22, 0.4)' },
      low: { bar: 'linear-gradient(90deg, #ef4444, #f87171)', glow: 'rgba(239, 68, 68, 0.5)' },
    }
  },
  cleanliness: {
    label: 'Cleanliness',
    icon: '🛁',
    colors: {
      high: { bar: 'linear-gradient(90deg, #06b6d4, #22d3ee)', glow: 'rgba(6, 182, 212, 0.5)' },
      mid: { bar: 'linear-gradient(90deg, #3b82f6, #60a5fa)', glow: 'rgba(59, 130, 246, 0.4)' },
      low: { bar: 'linear-gradient(90deg, #ef4444, #f87171)', glow: 'rgba(239, 68, 68, 0.5)' },
    }
  },
  happiness: {
    label: 'Happiness',
    icon: '✨',
    colors: {
      high: { bar: 'linear-gradient(90deg, #a78bfa, #c4b5fd)', glow: 'rgba(167, 139, 250, 0.5)' },
      mid: { bar: 'linear-gradient(90deg, #8b5cf6, #a78bfa)', glow: 'rgba(139, 92, 246, 0.4)' },
      low: { bar: 'linear-gradient(90deg, #ef4444, #f87171)', glow: 'rgba(239, 68, 68, 0.5)' },
    }
  },
}

function getLevel(value) {
  if (value >= 60) return 'high'
  if (value >= 30) return 'mid'
  return 'low'
}

export default function StatBar({ stat, value }) {
  const config = STAT_CONFIG[stat]
  const level = getLevel(value)
  const colors = config.colors[level]
  const pct = Math.max(0, Math.min(100, value))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-nunito font-semibold" style={{ color: '#c0c0e0' }}>
          <span>{config.icon}</span>
          {config.label}
        </span>
        <span className="text-xs font-bold font-nunito tabular-nums"
          style={{ color: level === 'low' ? '#ef4444' : level === 'mid' ? '#f97316' : '#a0a0cc' }}>
          {Math.round(pct)}%
          {level === 'low' && <span className="ml-1 animate-pulse">⚠️</span>}
        </span>
      </div>
      <div className="stat-bar-bg">
        <motion.div
          className="stat-bar-fill"
          style={{
            background: colors.bar,
            boxShadow: `0 0 8px ${colors.glow}`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
