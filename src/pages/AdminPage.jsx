import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  Cell,
} from 'recharts'
import { ArrowLeft, Users, CheckSquare, Clock, TrendingDown, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { PETS } from '../data/pets'

/* ────── colour palette ────── */
const CHART_COLORS = ['#f5a31a', '#7c3aed', '#06b6d4', '#4ade80', '#f43f5e', '#fbbf24', '#a78bfa']

/* ────── custom tooltip ────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 rounded-xl text-xs font-nunito"
      style={{ background: 'rgba(14,14,46,0.97)', border: '1px solid rgba(124,58,237,0.4)', color: '#e2e2ff' }}>
      <p className="font-bold mb-1" style={{ color: '#f5a31a' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
          {p.name === 'Efficiency' ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

/* ────── stat card ────── */
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: `${color}18` }}>{icon}</div>
      </div>
      <div className="font-cinzel font-black text-2xl" style={{ color }}>{value}</div>
      <div className="font-nunito font-semibold text-sm mt-0.5" style={{ color: '#c0c0e0' }}>{label}</div>
      {sub && <div className="text-xs mt-1 font-nunito" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

/* ────── user detail row ────── */
function UserRow({ user, index }) {
  const [expanded, setExpanded] = useState(false)
  const pet = PETS.find(p => p.id === user.selected_pet_id)
  const effPct = Number(user.efficiency_pct) || 0
  const effColor = effPct >= 70 ? '#4ade80' : effPct >= 40 ? '#f5a31a' : '#f43f5e'

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden mb-2"
      style={{ background: 'rgba(14,14,46,0.7)', border: '1px solid rgba(124,58,237,0.15)' }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-cinzel font-black flex-shrink-0"
          style={{ background: index < 3 ? 'rgba(245,163,26,0.15)' : 'rgba(80,80,120,0.3)',
            color: index < 3 ? '#f5a31a' : '#8080aa' }}>
          {index + 1}
        </div>

        {/* Avatar */}
        <div className="text-2xl flex-shrink-0">{pet?.emoji || '👤'}</div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="font-nunito font-bold text-sm truncate" style={{ color: '#e2e2ff' }}>
            {user.username}
            {user.role === 'admin' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(245,163,26,0.15)', color: '#f5a31a' }}>Admin</span>}
          </p>
          <p className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
            {pet ? `${pet.species}` : 'No pet selected'} · {user.points} pts
          </p>
        </div>

        {/* Efficiency bar */}
        <div className="hidden sm:block w-28">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>Efficiency</span>
            <span className="text-xs font-bold font-nunito" style={{ color: effColor }}>{effPct}%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(30,30,74,0.8)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${effPct}%`, background: effColor }} />
          </div>
        </div>

        {/* Tasks */}
        <div className="hidden md:flex items-center gap-1 text-sm font-nunito flex-shrink-0">
          <span style={{ color: '#4ade80' }}>{user.completed_tasks}</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: '#e2e2ff' }}>{user.total_tasks}</span>
        </div>

        {/* Expand toggle */}
        <div style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t"
              style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
              {[
                { label: 'Total Tasks', value: user.total_tasks, color: '#e2e2ff' },
                { label: 'Completed',   value: user.completed_tasks, color: '#4ade80' },
                { label: 'Pending',     value: user.pending_tasks, color: '#f5a31a' },
                { label: 'Procrastinated', value: user.procrastinated_tasks, color: '#f43f5e' },
                { label: 'Avg Time',    value: user.avg_completion_hours != null ? `${user.avg_completion_hours}h` : 'N/A', color: '#06b6d4' },
                { label: 'Efficiency',  value: `${effPct}%`, color: effColor },
                { label: 'Points',      value: user.points, color: '#f5a31a' },
                { label: 'Joined',      value: new Date(user.created_at).toLocaleDateString(), color: '#8080aa' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl"
                  style={{ background: 'rgba(19,19,58,0.5)', border: '1px solid rgba(124,58,237,0.1)' }}>
                  <div className="font-cinzel font-bold text-base" style={{ color }}>{value}</div>
                  <div className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ════════════════════════════════════════════
   MAIN ADMIN PAGE
════════════════════════════════════════════ */
export default function AdminPage() {
  const navigate  = useNavigate()
  const { profile } = useGame()

  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [sortBy,   setSortBy]   = useState('efficiency_pct')  // field to sort users by
  const [sortDir,  setSortDir]  = useState('desc')

  const loadData = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase
      .from('user_analytics')
      .select('*')
      .order(sortBy, { ascending: sortDir === 'asc' })

    if (error) { setError(error.message); setLoading(false); return }
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [sortBy, sortDir])

  /* ── derived totals ── */
  const totalUsers     = users.length
  const totalTasks     = users.reduce((s, u) => s + Number(u.total_tasks), 0)
  const totalCompleted = users.reduce((s, u) => s + Number(u.completed_tasks), 0)
  const avgEfficiency  = totalUsers > 0
    ? Math.round(users.reduce((s, u) => s + Number(u.efficiency_pct), 0) / totalUsers)
    : 0
  const totalProcrast  = users.reduce((s, u) => s + Number(u.procrastinated_tasks), 0)

  /* ── chart data ── */
  const efficiencyData = users
    .filter(u => Number(u.total_tasks) > 0)
    .map(u => ({
      name: u.username.length > 10 ? u.username.slice(0, 10) + '…' : u.username,
      Efficiency: Number(u.efficiency_pct),
      Completed:  Number(u.completed_tasks),
      Total:      Number(u.total_tasks),
    }))

  const procrastData = users
    .filter(u => Number(u.total_tasks) > 0)
    .map(u => ({
      name: u.username.length > 10 ? u.username.slice(0, 10) + '…' : u.username,
      Procrastinated: Number(u.procrastinated_tasks),
      OnTime: Number(u.completed_tasks) - Number(u.procrastinated_tasks),
    }))

  const radarData = users
    .filter(u => Number(u.total_tasks) > 0)
    .slice(0, 5)
    .map(u => ({
      user: u.username,
      Efficiency: Number(u.efficiency_pct),
      Speed: u.avg_completion_hours != null ? Math.max(0, 100 - Math.min(100, Number(u.avg_completion_hours) * 2)) : 50,
      Points: Math.min(100, (u.points / 200) * 100),
    }))

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('desc') }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="text-4xl">⚙️</motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)', filter: 'blur(80px)' }} />
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
          <div>
            <h1 className="font-cinzel font-black text-lg gradient-text-gold">Admin Control Room</h1>
            <p className="text-xs font-nunito hidden sm:block" style={{ color: 'var(--text-muted)' }}>
              Logged in as {profile?.username}
            </p>
          </div>
        </div>
        <motion.button onClick={loadData}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
          style={{ background: 'rgba(245,163,26,0.1)', border: '1px solid rgba(245,163,26,0.25)', color: '#f5a31a' }}
          whileTap={{ scale: 0.9, rotate: 180 }}>
          <RefreshCw size={14} /> Refresh
        </motion.button>
      </motion.nav>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl text-sm font-nunito"
            style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#fb7185' }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Global stat cards ── */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon="👥" label="Total Players"     value={totalUsers}     color="#7c3aed" />
          <StatCard icon="📜" label="Total Quests"      value={totalTasks}     color="#06b6d4" />
          <StatCard icon="✅" label="Completed"          value={totalCompleted} color="#4ade80"
            sub={totalTasks > 0 ? `${Math.round(totalCompleted/totalTasks*100)}% of all tasks` : ''} />
          <StatCard icon="⚡" label="Avg Efficiency"    value={`${avgEfficiency}%`} color="#f5a31a" />
          <StatCard icon="😴" label="Procrastinated"    value={totalProcrast}  color="#f43f5e"
            sub="Tasks completed after 24h" />
        </motion.div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Efficiency bar chart */}
          <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.2 }}
            className="glass-card p-5">
            <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              📊 Quest Efficiency by Player
            </h3>
            {efficiencyData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
                No task data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={efficiencyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.12)" />
                  <XAxis dataKey="name" tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Efficiency" radius={[6, 6, 0, 0]}>
                    {efficiencyData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          {/* Tasks: completed vs total */}
          <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.25 }}
            className="glass-card p-5">
            <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              📋 Tasks Completed vs Total
            </h3>
            {efficiencyData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
                No task data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={efficiencyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.12)" />
                  <XAxis dataKey="name" tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12, color: '#8080aa' }} />
                  <Bar dataKey="Total"     fill="rgba(124,58,237,0.4)"  radius={[4,4,0,0]} />
                  <Bar dataKey="Completed" fill="#4ade80"               radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          {/* Procrastination chart */}
          <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.3 }}
            className="glass-card p-5">
            <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              😴 Procrastination Breakdown
              <span className="normal-case font-nunito text-xs ml-2">(tasks done after 24h)</span>
            </h3>
            {procrastData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
                No completed tasks yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={procrastData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(124,58,237,0.12)" />
                  <XAxis dataKey="name" tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12, color: '#8080aa' }} />
                  <Bar dataKey="OnTime"        fill="#4ade80" radius={[4,4,0,0]} />
                  <Bar dataKey="Procrastinated" fill="#f43f5e" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          {/* Radar: multi-metric comparison (top 5 players) */}
          <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.35 }}
            className="glass-card p-5">
            <h3 className="font-cinzel font-bold text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              🎯 Player Comparison Radar <span className="font-nunito normal-case text-xs">(top 5)</span>
            </h3>
            {radarData.length < 2 ? (
              <div className="flex items-center justify-center h-40 text-sm font-nunito text-center px-6" style={{ color: 'var(--text-muted)' }}>
                Need 2+ players with tasks to show radar
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={[
                  { metric: 'Efficiency', ...Object.fromEntries(radarData.map(u => [u.user, u.Efficiency])) },
                  { metric: 'Speed',      ...Object.fromEntries(radarData.map(u => [u.user, u.Speed])) },
                  { metric: 'Points',     ...Object.fromEntries(radarData.map(u => [u.user, u.Points])) },
                ]}>
                  <PolarGrid stroke="rgba(124,58,237,0.2)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#8080aa', fontSize: 11, fontFamily: 'Nunito' }} />
                  {radarData.map((u, i) => (
                    <Radar key={u.user} name={u.user} dataKey={u.user}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.15} />
                  ))}
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 11, color: '#8080aa' }} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* ── Player table ── */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
          className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-cinzel font-bold text-base flex items-center gap-2">
              <Users size={16} style={{ color: '#f5a31a' }} />
              All Players
              <span className="font-nunito font-normal text-sm" style={{ color: 'var(--text-muted)' }}>
                ({totalUsers})
              </span>
            </h3>
            {/* Sort controls */}
            <div className="flex items-center gap-2 text-xs font-nunito">
              <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
              {[
                { key: 'efficiency_pct', label: '⚡ Efficiency' },
                { key: 'completed_tasks', label: '✅ Completed' },
                { key: 'points', label: '⭐ Points' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => toggleSort(key)}
                  className="px-2 py-1 rounded-lg transition-all"
                  style={{
                    background: sortBy === key ? 'rgba(245,163,26,0.15)' : 'rgba(19,19,58,0.6)',
                    color: sortBy === key ? '#f5a31a' : '#8080aa',
                    border: `1px solid ${sortBy === key ? 'rgba(245,163,26,0.4)' : 'rgba(124,58,237,0.15)'}`,
                  }}>
                  {label} {sortBy === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          <div className="hidden sm:flex items-center gap-4 px-5 pb-2 text-xs font-nunito uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}>
            <div className="w-7">#</div>
            <div className="w-8"></div>
            <div className="flex-1">Player</div>
            <div className="w-28">Efficiency</div>
            <div className="w-16 text-center">Tasks</div>
            <div className="w-4"></div>
          </div>

          {users.length === 0 ? (
            <div className="text-center py-12 font-nunito" style={{ color: 'var(--text-muted)' }}>
              <div className="text-4xl mb-3">👥</div>
              No players registered yet
            </div>
          ) : (
            <div>
              {users.map((user, i) => (
                <UserRow key={user.user_id} user={user} index={i} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
