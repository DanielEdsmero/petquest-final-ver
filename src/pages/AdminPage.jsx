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
import { ACCESSORIES } from '../data/accessories'
import { PET_LEVELS, levelFromPoints } from '../data/progression'

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
function UserRow({ user, index, onResetPeriod }) {
  const [expanded,   setExpanded]   = useState(false)
  const [resetting,  setResetting]  = useState(null)
  const pet = PETS.find(p => p.id === user.selected_pet_id)
  const effPct = Number(user.efficiency_pct) || 0
  const effColor = effPct >= 70 ? '#4ade80' : effPct >= 40 ? '#f5a31a' : '#f43f5e'

  const handleReset = async (type) => {
    setResetting(type)
    await onResetPeriod(user.user_id, type)
    setResetting(null)
  }

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
            <span style={{ color: '#6060aa', fontWeight: 400 }}> · {String(user.user_id || '').slice(0, 6)}</span>
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
            <div className="px-5 pb-5 pt-0 border-t" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {[
                  { label: 'Total Tasks',    value: user.total_tasks,         color: '#e2e2ff' },
                  { label: 'Completed',      value: user.completed_tasks,     color: '#4ade80' },
                  { label: 'Pending',        value: user.pending_tasks,       color: '#f5a31a' },
                  { label: 'Procrastinated', value: user.procrastinated_tasks, color: '#f43f5e' },
                  { label: 'Avg Time',       value: user.avg_completion_hours != null ? `${user.avg_completion_hours}h` : 'N/A', color: '#06b6d4' },
                  { label: 'Efficiency',     value: `${effPct}%`,             color: effColor },
                  { label: 'Points',         value: user.points,              color: '#f5a31a' },
                  { label: 'Joined',         value: new Date(user.created_at).toLocaleDateString(), color: '#8080aa' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl"
                    style={{ background: 'rgba(19,19,58,0.5)', border: '1px solid rgba(124,58,237,0.1)' }}>
                    <div className="font-cinzel font-bold text-base" style={{ color }}>{value}</div>
                    <div className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Quest period resets */}
              <div className="mt-4 pt-3 border-t" style={{ borderColor: 'rgba(124,58,237,0.08)' }}>
                <p className="text-xs font-nunito font-bold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--text-muted)' }}>
                  Quest Period Resets
                </p>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    onClick={() => handleReset('hard')}
                    disabled={resetting === 'hard'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-nunito font-bold"
                    style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e' }}
                    whileHover={{ background: 'rgba(244,63,94,0.22)' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {resetting === 'hard' ? '...' : '🔥 Reset Hard Period'}
                  </motion.button>
                  <motion.button
                    onClick={() => handleReset('medium')}
                    disabled={resetting === 'medium'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-nunito font-bold"
                    style={{ background: 'rgba(245,163,26,0.12)', border: '1px solid rgba(245,163,26,0.3)', color: '#f5a31a' }}
                    whileHover={{ background: 'rgba(245,163,26,0.22)' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {resetting === 'medium' ? '...' : '⚡ Reset Medium Period'}
                  </motion.button>
                </div>
                <p className="text-xs font-nunito mt-2" style={{ color: 'var(--text-muted)' }}>
                  Resetting a period lets the player add new quests of that difficulty before the normal cooldown expires.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ────── testing & cheats (operates on the admin's OWN account) ────── */
function CheatButton({ children, onClick, busy, color = '#f5a31a' }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={busy}
      className="px-3 py-2 rounded-xl text-xs font-nunito font-bold text-left"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color, opacity: busy ? 0.5 : 1 }}
      whileHover={!busy ? { background: `${color}28` } : {}}
      whileTap={!busy ? { scale: 0.96 } : {}}
    >
      {children}
    </motion.button>
  )
}

function CheatPanel({ players = [], onChanged }) {
  const { profile, refreshProfile, addNotification } = useGame()
  const [busy, setBusy] = useState(null)
  const [pointsAmt, setPointsAmt] = useState(500)
  const [streakDays, setStreakDays] = useState(7)
  const [targetId, setTargetId] = useState(profile?.id || '')

  // Default the target to the admin's own account once the profile loads.
  useEffect(() => { if (profile?.id && !targetId) setTargetId(profile.id) }, [profile?.id, targetId])

  const isSelf = targetId === profile?.id
  const targetName = players.find(p => p.user_id === targetId)?.username || profile?.username

  const today = () => new Date().toISOString().slice(0, 10)

  // After any change: refresh my own state if I targeted myself, and reload the
  // admin analytics table so another player's new numbers show.
  const afterChange = async () => {
    if (isSelf) await refreshProfile()
    onChanged?.()
  }

  const runRpc = async (fn, label) => {
    if (!targetId) return
    setBusy(label)
    const { data, error } = await supabase.rpc(fn, { p_target: targetId })
    setBusy(null)
    if (error)     return addNotification(`${label} failed: ${error.message}`, 'error')
    if (!data?.ok) return addNotification(`${label}: ${data?.error || 'failed'}`, 'error')
    await afterChange()
    addNotification(`${label} → ${targetName} ✓${data.affected != null ? ` (${data.affected})` : ''}`, 'success')
  }

  const patch = async (fields, label) => {
    if (!targetId) return
    setBusy(label)
    const { error } = await supabase.from('profiles').update(fields).eq('id', targetId)
    setBusy(null)
    if (error) return addNotification(`${label} failed: ${error.message}`, 'error')
    await afterChange()
    addNotification(`${label} → ${targetName} ✓`, 'success')
  }

  // Reads that need the TARGET's current values (not the logged-in admin's).
  const fetchTarget = async (cols) => {
    const { data } = await supabase.from('profiles').select(cols).eq('id', targetId).single()
    return data || {}
  }

  const addPoints = async (n) => {
    const t = await fetchTarget('points, total_points_earned')
    const total = (t.total_points_earned || 0) + n
    return patch(
      { points: (t.points || 0) + n, total_points_earned: total, pet_level: levelFromPoints(total) },
      `+${n} points`,
    )
  }
  const setStreak = async (d) => {
    const t = await fetchTarget('longest_streak')
    return patch(
      { current_streak: d, longest_streak: Math.max(d, t.longest_streak || 0), last_completion_date: today() },
      `Streak → ${d}`,
    )
  }
  const setLevel = (lvl) => {
    const min = PET_LEVELS.find(l => l.level === lvl)?.min ?? 0
    return patch({ total_points_earned: min, pet_level: lvl }, `Level → ${lvl}`)
  }
  const unlockBoss = () => patch({ boss_battles_unlocked: true }, 'Boss battles unlocked')
  const resetProgression = () => patch(
    { points: 0, total_points_earned: 0, current_streak: 0, longest_streak: 0, pet_level: 1, badges: [], boss_battles_unlocked: false },
    'Progression reset',
  )

  const grantAllAccessories = async () => {
    if (!targetId) return
    setBusy('acc')
    const { data: owned } = await supabase.from('owned_accessories').select('accessory_id').eq('user_id', targetId)
    const have = new Set((owned || []).map(r => r.accessory_id))
    const rows = ACCESSORIES.filter(a => !have.has(a.id)).map(a => ({ user_id: targetId, accessory_id: a.id }))
    if (rows.length) {
      const { error } = await supabase.from('owned_accessories').insert(rows)
      if (error) { setBusy(null); return addNotification(`Grant accessories failed: ${error.message}`, 'error') }
    }
    setBusy(null)
    await afterChange()
    addNotification(`Granted ${rows.length} accessories → ${targetName} ✓`, 'success')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5"
      style={{ border: '1px solid rgba(244,63,94,0.25)' }}>
      <h3 className="font-cinzel font-bold text-base flex items-center gap-2 mb-1">
        🧪 Admin Test
      </h3>
      <p className="text-xs font-nunito mb-3" style={{ color: 'var(--text-muted)' }}>
        Instant test tools. Pick a target player below — actions apply to them
        {isSelf && ' (that’s you)'}. If you target yourself, the dashboard updates live.
      </p>

      {/* Target player selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-nunito font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Target
        </span>
        <select
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          className="input-field"
          style={{ width: 'auto', minWidth: 200, paddingTop: 6, paddingBottom: 6 }}
        >
          {players.map(p => (
            <option key={p.user_id} value={p.user_id}>
              {p.username} · {String(p.user_id || '').slice(0, 6)}{p.user_id === profile?.id ? ' (you)' : ''}{p.role === 'admin' ? ' · admin' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <CheatButton onClick={() => runRpc('admin_skip_timers', 'Skip timers')} busy={busy} color="#06b6d4">
          ⏩ Skip all quest timers
        </CheatButton>
        <CheatButton onClick={() => runRpc('admin_reset_my_tasks', 'Reset quests')} busy={busy} color="#06b6d4">
          🔄 Un-complete quests
        </CheatButton>
        <CheatButton onClick={unlockBoss} busy={busy} color="#7c3aed">
          💀 Unlock Boss Battles
        </CheatButton>
        <CheatButton onClick={grantAllAccessories} busy={busy} color="#a78bfa">
          🎁 Grant all accessories
        </CheatButton>
      </div>

      {/* Points */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <input type="number" value={pointsAmt} onChange={e => setPointsAmt(Number(e.target.value) || 0)}
          className="input-field" style={{ width: 90 }} />
        <CheatButton onClick={() => addPoints(pointsAmt)} busy={busy}>➕ Add points</CheatButton>
        {[100, 500, 5000].map(n => (
          <CheatButton key={n} onClick={() => addPoints(n)} busy={busy}>+{n}</CheatButton>
        ))}
      </div>

      {/* Streak */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <input type="number" value={streakDays} onChange={e => setStreakDays(Number(e.target.value) || 0)}
          className="input-field" style={{ width: 90 }} />
        <CheatButton onClick={() => setStreak(streakDays)} busy={busy} color="#fb923c">🔥 Set streak</CheatButton>
        {[7, 30, 100, 365].map(d => (
          <CheatButton key={d} onClick={() => setStreak(d)} busy={busy} color="#fb923c">{d}d</CheatButton>
        ))}
      </div>

      {/* Evolution level */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs font-nunito font-bold" style={{ color: 'var(--text-muted)' }}>🐉 Set level:</span>
        {[1, 2, 3, 4, 5].map(l => (
          <CheatButton key={l} onClick={() => setLevel(l)} busy={busy} color="#22c55e">Lv {l}</CheatButton>
        ))}
      </div>

      {/* Danger */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
        <CheatButton onClick={resetProgression} busy={busy} color="#f43f5e">
          ♻️ Reset progression to zero
        </CheatButton>
      </div>
    </motion.div>
  )
}

/* ════════════════════════════════════════════
   MAIN ADMIN PAGE
════════════════════════════════════════════ */
/* ────── verification queue (pending quest completions) ────── */
const AI_COLOR = { pass: '#4ade80', fail: '#fb7185', error: '#22d3ee', pending: '#8080aa' }
const STATUS_META = {
  pending:  { label: 'Pending',  color: '#f5a31a' },
  verified: { label: 'Verified', color: '#4ade80' },
  reverted: { label: 'Reverted', color: '#fb7185' },
}
const qcAgo = (iso) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const qcAbs = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function VerificationQueue() {
  const { addNotification } = useGame()
  const [rows, setRows]     = useState([])
  const [signed, setSigned] = useState({})
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState(null)
  const [filter, setFilter] = useState('all')  // all | pending | pass | fail
  const [rerunProg, setRerunProg] = useState(null)  // { done, total } while bulk re-running

  const load = async () => {
    setLoad(true)
    // Phase 3: ALL recent submissions (pass/fail/error), not just pending.
    const { data, error } = await supabase
      .from('quest_completions')
      .select('*, tasks(text, planned_completion_date), profiles(username, selected_pet_id)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) { addNotification(`Queue load failed: ${error.message}`, 'error'); setLoad(false); return }
    setRows(data || [])
    setLoad(false)
    const map = {}
    await Promise.all((data || []).map(async r => {
      if (!r.proof_photo_url) return
      const { data: s } = await supabase.storage.from('quest-proofs').createSignedUrl(r.proof_photo_url, 300)
      if (s?.signedUrl) map[r.id] = s.signedUrl
    }))
    setSigned(map)
  }
  useEffect(() => { load() }, [])

  /* Re-run AI for a row whose verdict never got written (e.g. the user closed
     the tab before /api/verify fired). Calls the same serverless endpoint. */
  const rerunAI = async (id) => {
    setBusy(id + 'ai')
    try {
      const r = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: id }),
      })
      const d = await r.json().catch(() => ({}))
      addNotification(r.ok ? `AI verdict: ${d.verdict}` : `AI re-run failed (${d.error || r.status})`, r.ok ? 'info' : 'error')
    } catch (e) { addNotification(`AI re-run failed: ${e.message}`, 'error') }
    setBusy(null)
    load()
  }

  /* Re-run AI for every entry stuck without a real verdict (pending/error/null).
     Sequential (don't hammer Gemini) with a per-row timeout so one slow/hanging
     row can never freeze the whole batch, live progress, and a summary toast
     that classifies each row as re-verdicted (pass/fail) vs queued for review. */
  const rerunAllStuck = async () => {
    const stuck = rows.filter(r => !r.ai_verdict || r.ai_verdict === 'pending' || r.ai_verdict === 'error')
    if (!stuck.length) { addNotification('No stuck entries to re-run.', 'info'); return }
    setBusy('rerun-all')
    setRerunProg({ done: 0, total: stuck.length })
    let verdicted = 0, manual = 0
    for (let i = 0; i < stuck.length; i++) {
      const ctl = new AbortController()
      const to = setTimeout(() => ctl.abort(), 25000)   // never wait forever on one row
      try {
        const res = await fetch('/api/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completion_id: stuck[i].id }), signal: ctl.signal,
        })
        const d = await res.json().catch(() => ({}))
        if (d.verdict === 'pass' || d.verdict === 'fail') verdicted++
        else manual++   // 'error' / unavailable photo / bad response → manual review
      } catch { manual++ }   // timeout / network → manual review
      clearTimeout(to)
      setRerunProg({ done: i + 1, total: stuck.length })
    }
    setRerunProg(null); setBusy(null)
    addNotification(`${stuck.length} ${stuck.length === 1 ? 'entry' : 'entries'} re-checked: ${verdicted} re-verdicted, ${manual} queued for manual review.`, 'success')
    load()
  }

  const review = async (id, action) => {
    setBusy(id + action)
    const { data, error } = await supabase.rpc('admin_review_completion', { p_completion_id: id, p_action: action, p_reason: null })
    setBusy(null)
    if (error || !data?.ok) return addNotification(`Review failed: ${error?.message || data?.error || 'unknown'}`, 'error')
    addNotification(
      action === 'approved' ? '🏆 Quest verified — permanent.'
      : action === 'rejected' ? '🚨 Completion rejected — data reverted.'
      : '⚠️ Flagged as suspicious.',
      action === 'approved' ? 'success' : action === 'rejected' ? 'error' : 'info')
    load()
  }

  const counts = {
    all: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    pass: rows.filter(r => r.ai_verdict === 'pass').length,
    fail: rows.filter(r => r.ai_verdict === 'fail').length,
  }
  const shown = rows.filter(r =>
    filter === 'all' ? true
    : filter === 'pending' ? r.status === 'pending'
    : r.ai_verdict === filter)

  if (loading) {
    return <div className="glass-card p-8 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="text-2xl inline-block">⚙️</motion.div>
    </div>
  }

  return (
    <div className="space-y-3">
      <h3 className="font-cinzel font-bold text-base flex items-center gap-2">
        <Clock size={16} style={{ color: '#f5a31a' }} /> Verification Queue
        <span className="font-nunito font-normal text-sm" style={{ color: 'var(--text-muted)' }}>({rows.length} total)</span>
      </h3>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {[['all', 'All'], ['pending', 'Pending'], ['pass', 'Passed'], ['fail', 'Failed']].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className="px-3 py-1 rounded-lg text-xs font-nunito font-bold"
            style={{
              background: filter === k ? 'rgba(245,163,26,0.18)' : 'rgba(19,19,58,0.5)',
              color: filter === k ? '#f5a31a' : '#8080aa',
              border: `1px solid ${filter === k ? 'rgba(245,163,26,0.45)' : 'rgba(124,58,237,0.15)'}`,
            }}>
            {label} ({counts[k]})
          </button>
        ))}
        {/* Phase 3: batch-recover entries stuck without a real verdict. */}
        <button onClick={rerunAllStuck} disabled={busy === 'rerun-all'}
          className="px-3 py-1 rounded-lg text-xs font-nunito font-bold ml-auto disabled:opacity-50"
          style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.4)' }}>
          {busy === 'rerun-all'
            ? `⏳ Re-running ${rerunProg ? `${rerunProg.done}/${rerunProg.total}` : ''}…`
            : '🔁 Re-run stuck (pending/error)'}
        </button>
      </div>

      {shown.length === 0 && (
        <div className="glass-card p-10 text-center font-nunito" style={{ color: 'var(--text-muted)' }}>
          <div className="text-3xl mb-2">✅</div>Nothing here.
        </div>
      )}

      {shown.map(r => {
        const st = STATUS_META[r.status] || { label: r.status, color: '#8080aa' }
        const planned = r.tasks?.planned_completion_date
        // Phase 5: real active work time = verification opened → submitted, NOT
        // the quest's age since creation (which produced the bogus "34523m").
        const activeMs = r.verification_started_at
          ? Math.max(0, new Date(r.created_at).getTime() - new Date(r.verification_started_at).getTime())
          : null
        const activeLabel = activeMs == null ? '—'
          : activeMs < 60000 ? `${Math.round(activeMs / 1000)}s`
          : `${Math.floor(activeMs / 60000)}m ${Math.floor((activeMs % 60000) / 1000)}s`
        const stuck = !r.ai_verdict || r.ai_verdict === 'pending' || r.ai_verdict === 'error'
        return (
          <div key={r.id} className="glass-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
              <span className="font-nunito font-bold text-sm" style={{ color: '#e2e2ff' }}>
                {r.profiles?.username || 'Unknown'}
                {/* Disambiguate duplicate usernames with a short user-id suffix. */}
                <span style={{ color: '#6060aa', fontWeight: 400 }}> · {String(r.user_id || '').slice(0, 6)}</span>
                {!r.profiles?.selected_pet_id && <span style={{ color: '#f5a31a' }}> · 👤 no pet</span>}
              </span>
              <span className="text-sm font-nunito" style={{ color: '#c0c0e0' }}>{r.tasks?.text || '(quest)'}</span>
              {/* status + source badges */}
              <span className="text-xs font-nunito font-bold px-1.5 py-0.5 rounded"
                style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
              {r.source === 'upload' && (
                <span className="text-xs font-nunito px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,163,26,0.15)', color: '#f5a31a' }}>
                  ⚠️ File upload (not live)
                </span>
              )}
              <span className="text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
                {r.difficulty} · +{r.points_earned} pts
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg overflow-hidden" style={{ background: '#000', aspectRatio: '4/3' }}>
                {signed[r.id]
                  ? <img src={signed[r.id]} alt="Proof" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs font-nunito" style={{ color: '#5050aa' }}>no photo</div>}
              </div>
              <div>
                <p className="text-xs font-nunito font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Progress log</p>
                <p className="text-sm font-nunito mb-2" style={{ color: '#c0c0e0' }}>{r.progress_log}</p>
                <p className="text-xs font-nunito">
                  <span style={{ color: 'var(--text-muted)' }}>AI verdict: </span>
                  <span style={{ color: AI_COLOR[r.ai_verdict] || '#8080aa', fontWeight: 700 }}>
                    {r.ai_verdict}{r.ai_confidence != null ? ` (${Math.round(r.ai_confidence * 100)}%)` : ''}
                  </span>
                </p>
                {/* Never surface raw model names / HTTP codes. Error rows show a
                    friendly line; the raw reason stays in the hover tooltip. */}
                {(r.ai_reason || r.ai_verdict === 'error') && (
                  <p className="text-xs font-nunito mt-1" style={{ color: 'var(--text-soft)' }} title={r.ai_reason || ''}>
                    {r.ai_verdict === 'error' ? 'AI service busy — queued for manual review.' : r.ai_reason}
                  </p>
                )}
              </div>
            </div>

            {/* Timestamps / research metadata */}
            <div className="text-xs font-nunito mb-3 grid grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
              <div>Submitted: <span style={{ color: '#c0c0e0' }}>{qcAgo(r.created_at)}</span> · {qcAbs(r.created_at)}</div>
              <div>Active time (verify → submit): <span style={{ color: '#c0c0e0' }}>{activeLabel}</span></div>
              {r.ai_verdict_at && <div>AI verdict at: {qcAbs(r.ai_verdict_at)}</div>}
              {planned && <div>Planned finish: {qcAbs(planned)}</div>}
              {r.admin_reviewed_at && <div>Admin reviewed: {qcAbs(r.admin_reviewed_at)}</div>}
            </div>

            <div className="flex flex-wrap gap-2">
              <CheatButton onClick={() => review(r.id, 'approved')} busy={busy} color="#22c55e">✅ Approve</CheatButton>
              <CheatButton onClick={() => review(r.id, 'rejected')} busy={busy} color="#f43f5e">❌ Reject (rollback)</CheatButton>
              <CheatButton onClick={() => review(r.id, 'suspicious')} busy={busy} color="#f5a31a">⚠️ Suspicious</CheatButton>
              {stuck && (
                <CheatButton onClick={() => rerunAI(r.id)} busy={busy} color="#06b6d4">🔁 Re-run AI</CheatButton>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AdminPage() {
  const navigate  = useNavigate()
  const { profile } = useGame()

  const [tab,      setTab]      = useState('overview')  // overview | queue
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

  const resetPeriod = async (userId, type) => {
    const field = type === 'hard' ? 'hard_period_start' : 'medium_period_start'
    const { error: resetError } = await supabase
      .from('profiles')
      .update({ [field]: new Date().toISOString() })
      .eq('id', userId)
    if (resetError) setError(resetError.message)
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
      {/* Nav */}
      <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex items-center justify-between px-4 md:px-8 py-4"
        style={{ borderBottom: '1px solid var(--card-border)', background: '#0d1120' }}>
        <div className="flex items-center gap-3">
          <motion.button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}
            whileHover={{ background: 'rgba(124,58,237,0.2)' }} whileTap={{ scale: 0.95 }}>
            <ArrowLeft size={15} /> Dashboard
          </motion.button>
          <div>
            <h1 className="font-cinzel font-black text-lg" style={{ color: '#ffd166', textShadow: '0 0 16px rgba(245,163,26,0.3)' }}>Admin Control Room</h1>
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

        {/* ── Tab bar ── */}
        <div className="flex gap-2">
          {[['overview', '📊 Overview'], ['queue', '🔍 Verification Queue']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-4 py-2 rounded-xl text-sm font-nunito font-bold transition-all"
              style={{
                background: tab === key ? 'rgba(245,163,26,0.18)' : 'rgba(19,19,58,0.5)',
                color:      tab === key ? '#f5a31a' : '#8080aa',
                border:     `1px solid ${tab === key ? 'rgba(245,163,26,0.45)' : 'rgba(124,58,237,0.15)'}`,
              }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'queue' && <VerificationQueue />}

        {tab === 'overview' && (<>
        {/* ── Testing & cheats ── */}
        <CheatPanel players={users} onChanged={loadData} />

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
                <UserRow key={user.user_id} user={user} index={i} onResetPeriod={resetPeriod} />
              ))}
            </div>
          )}
        </motion.div>
        </>)}
      </div>
    </div>
  )
}
