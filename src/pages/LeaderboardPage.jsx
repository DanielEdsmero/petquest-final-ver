import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Flame, Trophy, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { PETS } from '../data/pets'
import { getLevelMeta } from '../data/progression'
import { DIFFICULTY_COLORS } from '../data/difficulty'

/* The two ranking modes. "Quests" additionally lets you rank by a single
   difficulty — the "most quests done per difficulty" board. */
const BOARDS = {
  streak:  { label: '🔥 Streaks',  metric: 'current_streak' },
  quests:  { label: '📜 Quests',   metric: 'total_completed' },
}

const QUEST_METRICS = [
  { key: 'total_completed', label: 'All',    color: '#f5a31a' },
  { key: 'easy_done',       label: 'Easy',   color: DIFFICULTY_COLORS.easy },
  { key: 'medium_done',     label: 'Medium', color: DIFFICULTY_COLORS.medium },
  { key: 'hard_done',       label: 'Hard',   color: DIFFICULTY_COLORS.hard },
  { key: 'boss_done',       label: 'Boss',   color: DIFFICULTY_COLORS.boss },
]

const MEDALS = ['🥇', '🥈', '🥉']

function petEmoji(id) {
  return PETS.find(p => p.id === id)?.emoji || '👤'
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { profile } = useGame()

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [board, setBoard]     = useState('streak')
  const [questMetric, setQuestMetric] = useState('total_completed')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('get_leaderboard')
    if (error) { setError(error.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Active sort metric: for the streak board it's the streak; for quests it's
  // whichever difficulty is selected.
  const metric = board === 'streak' ? 'current_streak' : questMetric

  const ranked = [...rows]
    .sort((a, b) => (Number(b[metric]) - Number(a[metric]))
      || (Number(b.longest_streak) - Number(a.longest_streak))
      || (Number(b.total_completed) - Number(a.total_completed)))
    .filter(r => Number(r[metric]) > 0 || board === 'streak')

  const metricColor = board === 'streak'
    ? '#fb923c'
    : QUEST_METRICS.find(m => m.key === questMetric)?.color || '#f5a31a'

  const metricValue = (r) => Number(r[metric]) || 0
  const isMe = (r) => r.username === profile?.username

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,163,26,0.1) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* Nav */}
      <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-4"
        style={{ borderBottom: '1px solid rgba(124,58,237,0.12)', background: 'rgba(6,6,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3">
          <motion.button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}
            whileHover={{ background: 'rgba(124,58,237,0.2)' }} whileTap={{ scale: 0.95 }}>
            <ArrowLeft size={15} /> Dashboard
          </motion.button>
          <h1 className="font-cinzel font-black text-lg gradient-text-gold flex items-center gap-2">
            <Trophy size={18} style={{ color: '#f5a31a' }} /> Leaderboard
          </h1>
        </div>
        <motion.button onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
          style={{ background: 'rgba(245,163,26,0.1)', border: '1px solid rgba(245,163,26,0.25)', color: '#f5a31a' }}
          whileTap={{ scale: 0.9, rotate: 180 }}>
          <RefreshCw size={14} />
        </motion.button>
      </motion.nav>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="p-4 rounded-xl text-sm font-nunito"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#fb7185' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Board selector */}
        <div className="flex gap-2">
          {Object.entries(BOARDS).map(([key, b]) => (
            <button key={key} onClick={() => setBoard(key)}
              className="flex-1 py-2.5 rounded-xl text-sm font-nunito font-bold transition-all"
              style={{
                background: board === key ? 'rgba(245,163,26,0.18)' : 'rgba(19,19,58,0.5)',
                color:      board === key ? '#f5a31a' : '#8080aa',
                border:     `1px solid ${board === key ? 'rgba(245,163,26,0.45)' : 'rgba(124,58,237,0.15)'}`,
              }}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Difficulty sub-filter (quests board only) */}
        {board === 'quests' && (
          <div className="flex flex-wrap gap-2">
            {QUEST_METRICS.map(m => (
              <button key={m.key} onClick={() => setQuestMetric(m.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-nunito font-bold transition-all"
                style={{
                  background: questMetric === m.key ? m.color + '22' : 'rgba(19,19,58,0.5)',
                  color:      questMetric === m.key ? m.color : '#8080aa',
                  border:     `1px solid ${questMetric === m.key ? m.color + '66' : 'rgba(124,58,237,0.15)'}`,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="text-3xl">⚙️</motion.div>
          </div>
        ) : ranked.length === 0 ? (
          <div className="text-center py-16 font-nunito" style={{ color: 'var(--text-muted)' }}>
            <div className="text-4xl mb-3">🏆</div>
            No ranked players yet — complete some quests to claim a spot!
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((r, i) => (
              <motion.div
                key={r.username + i}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: isMe(r) ? 'rgba(245,163,26,0.1)' : 'rgba(14,14,46,0.7)',
                  border: `1px solid ${isMe(r) ? 'rgba(245,163,26,0.4)' : i < 3 ? 'rgba(245,163,26,0.2)' : 'rgba(124,58,237,0.15)'}`,
                }}
              >
                {/* Rank */}
                <div className="w-8 text-center font-cinzel font-black flex-shrink-0"
                  style={{ color: i < 3 ? '#f5a31a' : '#8080aa', fontSize: i < 3 ? 20 : 14 }}>
                  {i < 3 ? MEDALS[i] : i + 1}
                </div>

                {/* Pet + name */}
                <div className="text-2xl flex-shrink-0">{petEmoji(r.pet_id)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-nunito font-bold text-sm truncate" style={{ color: '#e2e2ff' }}>
                    {r.username}
                    {isMe(r) && <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(245,163,26,0.15)', color: '#f5a31a' }}>You</span>}
                  </p>
                  <p className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
                    Lv {r.pet_level} {getLevelMeta(r.pet_level).name}
                    {board === 'streak' && <> · best {r.longest_streak}🔥</>}
                    {board === 'quests' && <> · {r.total_completed} total</>}
                  </p>
                </div>

                {/* Metric value */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {board === 'streak' && <Flame size={16} style={{ color: metricColor }} />}
                  <span className="font-cinzel font-black text-xl tabular-nums" style={{ color: metricColor }}>
                    {metricValue(r)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
