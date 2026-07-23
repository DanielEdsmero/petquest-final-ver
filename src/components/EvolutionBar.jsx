import { motion } from 'framer-motion'
import { evolutionProgress, getLevelMeta } from '../data/progression'

/*
 * "Next evolution: 340/500 pts" progress toward the next pet form.
 * Driven by lifetime points earned, not the spendable balance.
 */
export default function EvolutionBar({ totalEarned = 0, petName = 'Your companion' }) {
  const p = evolutionProgress(totalEarned)
  const nextMeta = p.isMax ? null : getLevelMeta(p.level + 1)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-nunito font-semibold" style={{ color: '#c0c0e0' }}>
          <span className="px-1.5 py-0.5 rounded-md text-xs font-black"
            style={{ background: 'rgba(245,163,26,0.15)', color: 'var(--gold)' }}>
            LV {p.level}
          </span>
          {p.meta.name}
        </span>
        <span className="text-xs font-bold font-nunito tabular-nums" style={{ color: 'var(--text-soft)' }}>
          {p.isMax
            ? 'Max evolution'
            : `${p.current.toLocaleString()}/${p.target.toLocaleString()} pts`}
        </span>
      </div>

      <div className="stat-bar-bg">
        <motion.div
          className="stat-bar-fill"
          style={{
            background: 'linear-gradient(90deg, #f5a31a, #ffd166)',
            boxShadow: '0 0 8px rgba(245, 163, 26, 0.5)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${p.pct}%` }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.25 }}
        />
      </div>

      <p className="text-xs font-nunito" style={{ color: 'var(--text-soft)' }}>
        {p.isMax
          ? `${petName} has reached its final form.`
          : `Next evolution: ${nextMeta.name} — ${p.remaining.toLocaleString()} pts to go`}
      </p>
    </div>
  )
}
