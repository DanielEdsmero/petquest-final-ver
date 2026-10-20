import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Flame, Trophy, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { getLevelMeta } from '../data/progression'
import { DIFFICULTY_TEXT } from '../data/difficulty'
import CountUp from '../components/reactbits/CountUp'
import PetSprite from '../components/PetSprite'

/* Light palette — same values as apps/mobile/src/theme.ts. */
const INK = '#102A43'
const SOFT = '#3E5165'
const MUTED = '#667085'
const TEAL = '#3F8580'
const TEAL_DEEP = '#2F6F6B'
const TEAL_TINT = '#E4EFEE'
const LINE = '#E1E7E3'
const APRICOT = '#EBA66E'
const APRICOT_INK = '#8A4B12'

/* The two ranking modes. "Quests" additionally lets you rank by a single
   difficulty — the "most quests done per difficulty" board. */
const BOARDS = {
  streak:  { label: '🔥 Streaks',  metric: 'current_streak' },
  quests:  { label: '📜 Quests',   metric: 'total_completed' },
}

const QUEST_METRICS = [
  { key: 'total_completed', label: 'All',    color: APRICOT_INK },
  { key: 'easy_done',       label: 'Easy',   color: DIFFICULTY_TEXT.easy },
  { key: 'medium_done',     label: 'Medium', color: DIFFICULTY_TEXT.medium },
  { key: 'hard_done',       label: 'Hard',   color: DIFFICULTY_TEXT.hard },
  { key: 'boss_done',       label: 'Boss',   color: '#5B4C9A' },
]

const MEDALS = ['🥇', '🥈', '🥉']
/* Your own row is pinned to the bottom once it would sit below this many rows. */
const PIN_AFTER = 8

const chip = (on) => on
  ? { background: TEAL_TINT, color: TEAL_DEEP, border: '1px solid #3F858055' }
  : { background: '#FFFFFF', color: SOFT, border: `1px solid ${LINE}` }

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
    ? APRICOT_INK
    : QUEST_METRICS.find(m => m.key === questMetric)?.color || APRICOT_INK

  const metricValue = (r) => Number(r[metric]) || 0
  const isMe = (r) => r.username === profile?.username
  const myIndex = ranked.findIndex(isMe)

  const podium = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  const Value = ({ r, big }) => (
    <span className={`font-extrabold tabular-nums inline-flex items-center gap-1 ${big ? 'text-xl' : 'text-lg'}`} style={{ color: metricColor }}>
      {/* Keyed on the active board so switching boards replays the count. */}
      <CountUp key={metric} to={metricValue(r)} duration={1.2} />
      {board === 'streak' && <Flame size={big ? 18 : 15} />}
    </span>
  )

  const Row = ({ r, i }) => (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl"
      style={{ background: isMe(r) ? TEAL_TINT : '#FFFFFF', border: `1px solid ${isMe(r) ? '#3F858055' : LINE}` }}>
      <span className="w-7 text-center font-extrabold flex-shrink-0" style={{ color: isMe(r) ? SOFT : MUTED }}>{i + 1}</span>
      <PetSprite petId={r.pet_id} level={r.pet_level || 1} size={36} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate" style={{ color: INK }}>
          {r.username}
          {isMe(r) && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#FFFFFF', color: TEAL_DEEP }}>You</span>}
        </p>
        <p className="text-xs" style={{ color: isMe(r) ? SOFT : MUTED }}>
          Lv {r.pet_level} {getLevelMeta(r.pet_level).name}
          {board === 'streak' && <> · best {r.longest_streak}🔥</>}
          {board === 'quests' && <> · {r.total_completed} total</>}
        </p>
      </div>
      <Value r={r} />
    </div>
  )

  return (
    <div className="theme-light min-h-screen relative z-10 font-nunito">
      {/* Nav */}
      <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex items-center justify-between gap-3 px-4 md:px-8 py-3"
        style={{ borderBottom: `1px solid ${LINE}`, background: '#FFFFFF' }}>
        <div className="flex items-center gap-3 min-w-0">
          <motion.button onClick={() => navigate('/dashboard')}
            className="min-h-[44px] flex items-center gap-2 px-3 rounded-xl text-sm font-semibold"
            style={{ background: '#FFFFFF', border: `1px solid ${LINE}`, color: SOFT }}
            whileHover={{ borderColor: TEAL }} whileTap={{ scale: 0.95 }}>
            <ArrowLeft size={15} /> Dashboard
          </motion.button>
          <h1 className="font-extrabold text-lg flex items-center gap-2 truncate" style={{ color: INK }}>
            <Trophy size={18} style={{ color: APRICOT }} /> Leaderboard
          </h1>
        </div>
        <motion.button onClick={load} aria-label="Refresh"
          className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: '#FFFFFF', border: `1px solid ${LINE}`, color: SOFT }}
          whileTap={{ scale: 0.9, rotate: 180 }}>
          <RefreshCw size={15} />
        </motion.button>
      </motion.nav>

      <div className="relative max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error && (
          <div className="p-4 rounded-xl text-sm" style={{ background: '#FBE8E3', color: '#A3412A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Board selector */}
        <div className="flex gap-2" data-pet-spot="podium">
          {Object.entries(BOARDS).map(([key, b]) => (
            <button key={key} onClick={() => setBoard(key)} aria-pressed={board === key}
              className="flex-1 min-h-[44px] rounded-xl text-sm font-bold" style={chip(board === key)}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Difficulty sub-filter (quests board only) */}
        {board === 'quests' && (
          <div className="flex flex-wrap gap-2">
            {QUEST_METRICS.map(m => (
              <button key={m.key} onClick={() => setQuestMetric(m.key)} aria-pressed={questMetric === m.key}
                className="min-h-[44px] px-4 rounded-full text-sm font-bold" style={chip(questMetric === m.key)}>
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
          <div className="text-center py-16" style={{ color: SOFT }}>
            <div className="text-4xl mb-3">🏆</div>
            No ranked players yet — complete some quests to claim a spot!
          </div>
        ) : (
          <>
            {/* Podium: 2nd · 1st · 3rd, first one raised */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end">
              {[1, 0, 2].map(i => {
                const r = podium[i]
                if (!r) return <div key={i} />
                const first = i === 0
                return (
                  <motion.div key={r.username + i}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * (i + 1) }}
                    className="flex flex-col items-center text-center rounded-2xl px-2 min-w-0"
                    style={{
                      border: first ? `2px solid ${APRICOT}` : `1px solid ${isMe(r) ? '#3F858055' : LINE}`,
                      background: isMe(r) ? TEAL_TINT : '#FFFFFF',
                      paddingTop: first ? 20 : 12, paddingBottom: 12,
                    }}>
                    <span className={first ? 'text-2xl' : 'text-xl'} role="img" aria-label={`Rank ${i + 1}`}>{MEDALS[i]}</span>
                    <PetSprite petId={r.pet_id} level={r.pet_level || 1} size={first ? 72 : 56} />
                    <p className="font-bold text-sm truncate w-full mt-1" style={{ color: INK }}>
                      {r.username}{isMe(r) && ' · You'}
                    </p>
                    <p className="text-xs" style={{ color: isMe(r) ? SOFT : MUTED }}>Lv {r.pet_level}</p>
                    <Value r={r} big={first} />
                  </motion.div>
                )
              })}
            </div>

            {/* Everyone else */}
            <div className="space-y-2">
              {rest.map((r, j) => (
                <motion.div key={r.username + j} layout
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(j * 0.03, 0.4) }}>
                  <Row r={r} i={j + 3} />
                </motion.div>
              ))}
            </div>

            {/* Far down the list: keep your own place in view. */}
            {myIndex >= PIN_AFTER && (
              <div className="sticky bottom-3 pt-2">
                <div className="rounded-2xl" style={{ boxShadow: '0 6px 18px rgba(16,42,67,0.15)' }}>
                  <Row r={ranked[myIndex]} i={myIndex} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
