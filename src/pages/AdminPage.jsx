import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  Cell,
} from 'recharts'
import { ArrowLeft, Users, CheckSquare, Clock, TrendingDown, RefreshCw, ChevronDown, ChevronUp, ShieldCheck, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { jsonPost } from '../lib/authHeaders'
import { useGame } from '../context/GameContext'
import { evidenceMeta, VALIDITY_META } from '../data/questValidity'
import { PETS } from '../data/pets'
import { ACCESSORIES } from '../data/accessories'
import { PET_LEVELS, levelFromPoints } from '../data/progression'

/* ────── colour palette ────── */
/* App palette mid-tones (marks, not text). */
const CHART_COLORS = ['#3F8580', '#EBA66E', '#5EAF7B', '#E58A73', '#5D8FC6', '#7C6FB8', '#C98A2B']

/* ────── custom tooltip ────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 rounded-xl text-xs font-nunito"
      style={{ background: '#FFFFFF', border: '1px solid #E1E7E3', color: '#102A43', boxShadow: '0 2px 8px rgba(16,42,67,0.08)' }}>
      <p className="font-bold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
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
      <div className="font-nunito font-semibold text-sm mt-0.5" style={{ color: '#3E5165' }}>{label}</div>
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
  const effColor = effPct >= 70 ? '#2F7A4D' : effPct >= 40 ? '#8A4B12' : '#A3412A'

  const handleReset = async (type) => {
    setResetting(type)
    await onResetPeriod(user.user_id, type)
    setResetting(null)
  }

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden mb-2"
      style={{ background: '#FFFFFF', border: '1px solid #E1E7E3' }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-cinzel font-black flex-shrink-0"
          style={{ background: index < 3 ? '#FBEEDF' : '#F3F5F2',
            color: index < 3 ? '#8A4B12' : '#667085' }}>
          {index + 1}
        </div>

        {/* Avatar */}
        <div className="text-2xl flex-shrink-0">{pet?.emoji || '👤'}</div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="font-nunito font-bold text-sm truncate" style={{ color: '#102A43' }}>
            {user.username}
            <span style={{ color: '#667085', fontWeight: 400 }}> · {String(user.user_id || '').slice(0, 6)}</span>
            {user.role === 'admin' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#FBEEDF', color: '#8A4B12' }}>Admin</span>}
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
          <div className="h-1.5 rounded-full" style={{ background: '#E1E7E3' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${effPct}%`, background: effColor }} />
          </div>
        </div>

        {/* Tasks */}
        <div className="hidden md:flex items-center gap-1 text-sm font-nunito flex-shrink-0">
          <span style={{ color: '#2F7A4D' }}>{user.completed_tasks}</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: '#102A43' }}>{user.total_tasks}</span>
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
            <div className="px-5 pb-5 pt-0 border-t" style={{ borderColor: '#E1E7E3' }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {[
                  { label: 'Total Tasks',    value: user.total_tasks,         color: '#102A43' },
                  { label: 'Completed',      value: user.completed_tasks,     color: '#2F7A4D' },
                  { label: 'Pending',        value: user.pending_tasks,       color: '#8A4B12' },
                  { label: 'Procrastinated', value: user.procrastinated_tasks, color: '#A3412A' },
                  { label: 'Avg Time',       value: user.avg_completion_hours != null ? `${user.avg_completion_hours}h` : 'N/A', color: '#2F6F6B' },
                  { label: 'Efficiency',     value: `${effPct}%`,             color: effColor },
                  { label: 'Points',         value: user.points,              color: '#8A4B12' },
                  { label: 'Joined',         value: new Date(user.created_at).toLocaleDateString(), color: '#667085' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl"
                    style={{ background: '#F3F5F2', border: '1px solid #E1E7E3' }}>
                    <div className="font-cinzel font-bold text-base" style={{ color }}>{value}</div>
                    <div className="text-xs font-nunito mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Quest period resets */}
              <div className="mt-4 pt-3 border-t" style={{ borderColor: '#E1E7E3' }}>
                <p className="text-xs font-nunito font-bold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--text-muted)' }}>
                  Quest Period Resets
                </p>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    onClick={() => handleReset('hard')}
                    disabled={resetting === 'hard'}
                    className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-nunito font-bold"
                    style={{ background: '#FBE8E3', border: '1px solid #E58A73', color: '#A3412A' }}
                    whileHover={{ background: '#FBE8E3' }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {resetting === 'hard' ? '...' : '🔥 Reset Hard Period'}
                  </motion.button>
                  <motion.button
                    onClick={() => handleReset('medium')}
                    disabled={resetting === 'medium'}
                    className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-nunito font-bold"
                    style={{ background: '#FBEEDF', border: '1px solid #EBA66E', color: '#8A4B12' }}
                    whileHover={{ background: '#FBEEDF' }}
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
function CheatButton({ children, onClick, busy, color = '#8A4B12' }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={busy}
      className="min-h-[44px] px-3 py-2 rounded-xl text-sm font-nunito font-bold text-left"
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
      style={{ border: '1px solid #E58A73' }}>
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
          style={{ width: 'auto', minWidth: 200, minHeight: 44 }}
        >
          {players.map(p => (
            <option key={p.user_id} value={p.user_id}>
              {p.username} · {String(p.user_id || '').slice(0, 6)}{p.user_id === profile?.id ? ' (you)' : ''}{p.role === 'admin' ? ' · admin' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <CheatButton onClick={() => runRpc('admin_skip_timers', 'Skip timers')} busy={busy} color="#2F6F6B">
          ⏩ Skip all quest timers
        </CheatButton>
        <CheatButton onClick={() => runRpc('admin_reset_my_tasks', 'Reset quests')} busy={busy} color="#2F6F6B">
          🔄 Un-complete quests
        </CheatButton>
        <CheatButton onClick={unlockBoss} busy={busy} color="#5B4C9A">
          💀 Unlock Boss Battles
        </CheatButton>
        <CheatButton onClick={grantAllAccessories} busy={busy} color="#5B4C9A">
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
        <CheatButton onClick={() => setStreak(streakDays)} busy={busy} color="#9A4A12">🔥 Set streak</CheatButton>
        {[7, 30, 100, 365].map(d => (
          <CheatButton key={d} onClick={() => setStreak(d)} busy={busy} color="#9A4A12">{d}d</CheatButton>
        ))}
      </div>

      {/* Evolution level */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs font-nunito font-bold" style={{ color: 'var(--text-muted)' }}>🐉 Set level:</span>
        {[1, 2, 3, 4, 5].map(l => (
          <CheatButton key={l} onClick={() => setLevel(l)} busy={busy} color="#2F7A4D">Lv {l}</CheatButton>
        ))}
      </div>

      {/* Danger */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: '#E1E7E3' }}>
        <CheatButton onClick={resetProgression} busy={busy} color="#A3412A">
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
/* Light theme (app palette); every colour passes 4.5:1 as text on white or its tint. */
const AI_COLOR = { pass: '#2F7A4D', fail: '#A3412A', error: '#2F6F6B', pending: '#667085' }
const STATUS_META = {
  pending:  { label: 'Pending',  color: '#8A4B12', bg: '#FBEEDF' },
  verified: { label: 'Verified', color: '#2F7A4D', bg: '#E6F4EA' },
  reverted: { label: 'Reverted', color: '#A3412A', bg: '#FBE8E3' },
}
const Q = { ink: '#102A43', soft: '#3E5165', muted: '#667085', line: '#E1E7E3', mist: '#F3F5F2', teal: '#2F6F6B', tint: '#E4EFEE' }
const qcAgo = (iso) => {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const qcAbs = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/* The queue's buttons: solid green approve, outlined reject/suspicious, tinted AI re-run. */
const Q_BTN = {
  approve:    { background: '#2F7A4D', color: '#FFFFFF', border: '1px solid #2F7A4D' },
  reject:     { background: '#FFFFFF', color: '#A3412A', border: '1px solid #E58A73' },
  suspicious: { background: '#FFFFFF', color: '#8A4B12', border: '1px solid #EBA66E' },
  ai:         { background: Q.tint, color: Q.teal, border: `1px solid ${Q.tint}` },
}
function QButton({ kind, onClick, disabled, children }) {
  return (
    <motion.button onClick={onClick} disabled={disabled}
      className="min-h-[44px] px-4 rounded-xl text-sm font-nunito font-bold disabled:opacity-50"
      style={Q_BTN[kind]} whileTap={!disabled ? { scale: 0.96 } : {}}>
      {children}
    </motion.button>
  )
}

const isStuckRow = r => !r.ai_verdict || r.ai_verdict === 'pending' || r.ai_verdict === 'error'

/* What the list row says about the AI side, in one chip. */
function rowChip(r) {
  if (r.source === 'upload') return { text: 'Upload', color: '#8A4B12', bg: '#FBEEDF' }
  if (r.ai_verdict === 'pass') return { text: 'AI pass', color: '#2F7A4D', bg: '#E6F4EA' }
  if (r.ai_verdict === 'fail') return { text: 'AI fail', color: '#A3412A', bg: '#FBE8E3' }
  return { text: 'No verdict', color: Q.soft, bg: Q.mist }
}

function VerificationQueue() {
  const { addNotification } = useGame()
  const [rows, setRows]     = useState([])
  const [signed, setSigned] = useState({})
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState(null)
  const [filter, setFilter] = useState('pending')  // all | pending | pass | fail
  const [selId, setSelId]   = useState(null)       // null on phone = show the list
  const [rerunProg, setRerunProg] = useState(null)  // { done, total } while bulk re-running
  const [imgFailed, setImgFailed] = useState({})    // proof URLs that failed to load → show placeholder

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
    setImgFailed({})   // fresh signed URLs on reload → give previously-failed images another try
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
      // /api/verify authorises on the caller's token; an admin may re-run any row.
      const r = await fetch('/api/verify', await jsonPost({ completion_id: id }))
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
    const stuck = rows.filter(isStuckRow)
    if (!stuck.length) { addNotification('No stuck entries to re-run.', 'info'); return }
    setBusy('rerun-all')
    setRerunProg({ done: 0, total: stuck.length })
    let verdicted = 0, manual = 0
    for (let i = 0; i < stuck.length; i++) {
      const ctl = new AbortController()
      const to = setTimeout(() => ctl.abort(), 25000)   // never wait forever on one row
      try {
        const res = await fetch('/api/verify',
          await jsonPost({ completion_id: stuck[i].id }, { signal: ctl.signal }))
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

  const review = async (id, action) => {
    // Open the next one in the list after a decision (review one at a time).
    const i = shown.findIndex(r => r.id === id)
    const next = shown[i + 1] ?? shown[i - 1] ?? null
    setBusy(id + action)
    const { data, error } = await supabase.rpc('admin_review_completion', { p_completion_id: id, p_action: action, p_reason: null })
    setBusy(null)
    if (error || !data?.ok) return addNotification(`Review failed: ${error?.message || data?.error || 'unknown'}`, 'error')
    addNotification(
      action === 'approved' ? '🏆 Quest verified — permanent.'
      : action === 'rejected' ? '🚨 Completion rejected — data reverted.'
      : '⚠️ Flagged as suspicious.',
      action === 'approved' ? 'success' : action === 'rejected' ? 'error' : 'info')
    if (selId) setSelId(next?.id ?? null)
    load()
  }

  if (loading) {
    return <div className="glass-card p-8 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="text-2xl inline-block">⚙️</motion.div>
    </div>
  }

  // Desktop always shows a detail (the first row by default); phone shows it only once a row is tapped.
  const sel = shown.find(r => r.id === selId) ?? shown[0] ?? null
  const phoneDetail = !!selId && !!shown.find(r => r.id === selId)

  return (
    <div className="space-y-3 font-nunito">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-extrabold text-lg flex items-center gap-2 mr-2" style={{ color: Q.ink }}>
          <Clock size={16} style={{ color: Q.teal }} /> Verification
          <span className="font-normal text-sm" style={{ color: Q.muted }}>({rows.length} total)</span>
        </h3>
        {/* Phase 3: batch-recover entries stuck without a real verdict. */}
        <button onClick={rerunAllStuck} disabled={busy === 'rerun-all'}
          className="min-h-[44px] px-3 rounded-xl text-sm font-bold ml-auto disabled:opacity-50"
          style={Q_BTN.ai}>
          {busy === 'rerun-all'
            ? `⏳ Re-running ${rerunProg ? `${rerunProg.done}/${rerunProg.total}` : ''}…`
            : '🔁 Re-run stuck (pending/error)'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* ── List ── */}
        <div className={`glass-card p-2 lg:col-span-2 ${phoneDetail ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-wrap gap-1.5 p-1 mb-1">
            {[['pending', 'Pending'], ['all', 'All'], ['pass', 'Passed'], ['fail', 'Failed']].map(([k, label]) => (
              <button key={k} onClick={() => { setFilter(k); setSelId(null) }}
                className="min-h-[44px] px-3 rounded-xl text-sm font-bold"
                style={filter === k
                  ? { background: Q.tint, color: Q.teal, border: '1px solid #3F858055' }
                  : { background: '#FFFFFF', color: Q.soft, border: `1px solid ${Q.line}` }}>
                {label} ({counts[k]})
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <div className="p-10 text-center" style={{ color: Q.muted }}>
              <div className="text-3xl mb-2">✅</div>Nothing here.
            </div>
          )}

          <ul className="lg:max-h-[70vh] lg:overflow-y-auto">
            {shown.map(r => {
              const chip = rowChip(r)
              const on = sel?.id === r.id
              return (
                <li key={r.id}>
                  <button onClick={() => setSelId(r.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl text-left"
                    style={{ background: on ? Q.tint : 'transparent', border: `1px solid ${on ? '#3F858055' : 'transparent'}` }}
                    aria-current={on ? 'true' : undefined}>
                    <span className="w-12 h-9 rounded-lg overflow-hidden flex-none flex items-center justify-center text-sm" style={{ background: Q.mist }}>
                      {signed[r.id] && !imgFailed[r.id]
                        ? <img src={signed[r.id]} alt="" className="w-full h-full object-cover"
                            onError={() => setImgFailed(prev => ({ ...prev, [r.id]: true }))} />
                        : '🖼️'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-sm truncate" style={{ color: Q.ink }}>{r.profiles?.username || 'Unknown'}</span>
                      <span className="block text-sm truncate" style={{ color: Q.soft }}>{r.tasks?.text || '(quest)'}</span>
                    </span>
                    <span className="flex-none text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: chip.color, background: chip.bg }}>{chip.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* ── Detail ── */}
        {sel && (() => {
          const r = sel
          const st = STATUS_META[r.status] || { label: r.status, color: Q.soft, bg: Q.mist }
          const planned = r.tasks?.planned_completion_date
          // Phase 5: real active work time = verification opened → submitted, NOT
          // the quest's age since creation (which produced the bogus "34523m").
          const activeMs = r.verification_started_at
            ? Math.max(0, new Date(r.created_at).getTime() - new Date(r.verification_started_at).getTime())
            : null
          const activeLabel = activeMs == null ? '—'
            : activeMs < 60000 ? `${Math.round(activeMs / 1000)}s`
            : `${Math.floor(activeMs / 60000)}m ${Math.floor((activeMs % 60000) / 1000)}s`
          return (
            <div className={`glass-card p-4 lg:col-span-3 ${phoneDetail ? '' : 'hidden lg:block'}`}>
              <button onClick={() => setSelId(null)} className="lg:hidden min-h-[44px] flex items-center gap-1.5 text-sm font-bold mb-2" style={{ color: Q.teal }}>
                <ArrowLeft size={15} /> Back to list
              </button>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                <span className="font-bold text-base" style={{ color: Q.ink }}>
                  {r.profiles?.username || 'Unknown'}
                  {/* Disambiguate duplicate usernames with a short user-id suffix. */}
                  <span style={{ color: Q.muted, fontWeight: 400 }}> · {String(r.user_id || '').slice(0, 6)}</span>
                  {!r.profiles?.selected_pet_id && <span style={{ color: '#8A4B12' }}> · 👤 no pet</span>}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                {r.source === 'upload' && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FBEEDF', color: '#8A4B12' }}>
                    ⚠️ File upload (not live)
                  </span>
                )}
                <span className="text-sm" style={{ color: Q.muted }}>{r.difficulty} · +{r.points_earned} pts</span>
              </div>
              <p className="text-base mb-3" style={{ color: Q.ink }}>{r.tasks?.text || '(quest)'}</p>

              <div className="rounded-xl overflow-hidden mb-3" style={{ background: Q.mist, aspectRatio: '4/3', maxHeight: 420 }}>
                {signed[r.id] && !imgFailed[r.id]
                  ? <img src={signed[r.id]} alt="Proof photo" className="w-full h-full object-contain"
                      onError={() => setImgFailed(prev => ({ ...prev, [r.id]: true }))} />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-sm" style={{ color: Q.muted }}>
                      <span style={{ fontSize: 22 }}>🖼️</span>
                      {r.proof_photo_url ? 'image unavailable' : 'no photo'}
                    </div>}
              </div>

              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: Q.muted }}>Progress log</p>
              <p className="text-sm mb-3" style={{ color: Q.soft }}>{r.progress_log}</p>
              <p className="text-sm">
                <span style={{ color: Q.muted }}>AI verdict: </span>
                <span style={{ color: AI_COLOR[r.ai_verdict] || Q.soft, fontWeight: 700 }}>
                  {r.ai_verdict}{r.ai_confidence != null ? ` (${Math.round(r.ai_confidence * 100)}%)` : ''}
                </span>
              </p>
              {/* Never surface raw model names / HTTP codes. Error rows show a
                  friendly line; the raw reason stays in the hover tooltip. */}
              {(r.ai_reason || r.ai_verdict === 'error') && (
                <p className="text-sm mt-1" style={{ color: Q.soft }} title={r.ai_reason || ''}>
                  {r.ai_verdict === 'error' ? 'AI service busy — queued for manual review.' : r.ai_reason}
                </p>
              )}

              {/* Timestamps / research metadata */}
              <div className="text-sm my-3 grid sm:grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: Q.muted }}>
                <div>Submitted: <span style={{ color: Q.ink }}>{qcAgo(r.created_at)}</span> · {qcAbs(r.created_at)}</div>
                <div>Active time (verify → submit): <span style={{ color: Q.ink }}>{activeLabel}</span></div>
                {r.ai_verdict_at && <div>AI verdict at: {qcAbs(r.ai_verdict_at)}</div>}
                {planned && <div>Planned finish: {qcAbs(planned)}</div>}
                {r.admin_reviewed_at && <div>Admin reviewed: {qcAbs(r.admin_reviewed_at)}</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                <QButton kind="approve" onClick={() => review(r.id, 'approved')} disabled={!!busy}>✅ Approve</QButton>
                <QButton kind="reject" onClick={() => review(r.id, 'rejected')} disabled={!!busy}>❌ Reject (rollback)</QButton>
                <QButton kind="suspicious" onClick={() => review(r.id, 'suspicious')} disabled={!!busy}>⚠️ Suspicious</QButton>
                {isStuckRow(r) && (
                  <QButton kind="ai" onClick={() => rerunAI(r.id)} disabled={!!busy}>🔁 Re-run AI</QButton>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/* ────── Phase 12: quest validity queue (creation-time AI check) ────── */
/* Two views: quests whose validity is unresolved (pending_ai_review when the AI
   was down, or sent back as needs_clarification / rejected), with Run-AI /
   Accept / Reject; and the admin-only decision log (quest_validity_reviews —
   RLS admin-read-only, so the internal admin_reason / risk flags / model only
   ever render here). */
const DECISION_COLOR = {
  accept: '#2F7A4D', clarify: '#8A4B12', reject: '#A3412A', pending: '#2F6F6B',
  admin_accept: '#2F7A4D', admin_reject: '#A3412A',
}
const UNRESOLVED = ['pending_ai_review', 'needs_clarification', 'rejected']

function QuestValidityQueue() {
  const { addNotification } = useGame()
  const [quests, setQuests] = useState([])
  const [log, setLog]       = useState([])
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState(null)
  const [filter, setFilter] = useState('pending_ai_review')   // pending_ai_review | needs_clarification | rejected | all
  const [selId, setSelId]   = useState(null)   // null on phone = show the list

  const load = async () => {
    setLoad(true)
    const [{ data: q, error: qErr }, { data: l, error: lErr }] = await Promise.all([
      supabase.from('tasks')
        .select('id, user_id, text, goal, priority, difficulty, evidence_type, planned_completion_date, validity_status, validity_score, validity_reason, validity_checked_at, validity_reviewed_at, created_at, profiles(username)')
        .in('validity_status', UNRESOLVED).eq('completed', false)
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('quest_validity_reviews')
        .select('*, profiles(username)')
        .order('created_at', { ascending: false }).limit(60),
    ])
    if (qErr) addNotification(`Validity queue load failed: ${qErr.message}`, 'error')
    if (lErr) addNotification(`Decision log load failed: ${lErr.message}`, 'error')
    setQuests(q || []); setLog(l || [])
    setLoad(false)
  }
  useEffect(() => { load() }, [])

  /* Same endpoint the participant's "check again" uses; the server recognises
     the admin token and skips the per-user cooldown for other people's quests. */
  const rerunAI = async (id) => {
    setBusy(id + 'ai')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/validate-quest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ task_id: id }),
      })
      const d = await r.json().catch(() => ({}))
      addNotification(r.ok ? `AI decision: ${d.decision}` : `AI re-check failed (${d.error || r.status})`, r.ok ? 'info' : 'error')
    } catch (e) { addNotification(`AI re-check failed: ${e.message}`, 'error') }
    setBusy(null)
    load()
  }

  const resolve = async (id, status) => {
    setBusy(id + status)
    const { data, error } = await supabase.rpc('admin_resolve_quest_validity', { p_task_id: id, p_status: status, p_reason: null })
    setBusy(null)
    if (error || !data?.ok) return addNotification(`Resolve failed: ${error?.message || data?.error || 'unknown'}`, 'error')
    addNotification(status === 'accepted' ? '✅ Quest accepted — participant can work on it.' : '❌ Quest rejected.', status === 'accepted' ? 'success' : 'error')
    load()
    return true
  }

  const counts = Object.fromEntries(UNRESOLVED.map(k => [k, quests.filter(q => q.validity_status === k).length]))
  const shown = filter === 'all' ? quests : quests.filter(q => q.validity_status === filter)

  const resolveAndNext = async (id, status) => {
    // Open the next one in the list after a decision, like the verification queue.
    const i = shown.findIndex(q => q.id === id)
    const next = shown[i + 1] ?? shown[i - 1] ?? null
    if (await resolve(id, status) && selId) setSelId(next?.id ?? null)
  }

  if (loading) {
    return <div className="glass-card p-8 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="text-2xl inline-block">⚙️</motion.div>
    </div>
  }

  // Desktop always shows a detail (the first row by default); phone only once a row is tapped.
  const sel = shown.find(q => q.id === selId) ?? shown[0] ?? null
  const phoneDetail = !!selId && !!shown.find(q => q.id === selId)

  return (
    <div className="space-y-3 font-nunito">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-extrabold text-lg flex items-center gap-2 mr-2" style={{ color: Q.ink }}>
          <ShieldCheck size={16} style={{ color: Q.teal }} /> Quest Validity
          <span className="font-normal text-sm" style={{ color: Q.muted }}>({quests.length} unresolved)</span>
        </h3>
        <button onClick={load} className="min-h-[44px] px-3 rounded-xl text-sm font-bold ml-auto" style={Q_BTN.ai}>
          ↻ Reload
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* ── List ── */}
        <div className={`glass-card p-2 lg:col-span-2 ${phoneDetail ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-wrap gap-1.5 p-1 mb-1">
            {[['pending_ai_review', 'Awaiting AI'], ['needs_clarification', 'Needs changes'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, label]) => (
              <button key={k} onClick={() => { setFilter(k); setSelId(null) }}
                className="min-h-[44px] px-3 rounded-xl text-sm font-bold"
                style={filter === k
                  ? { background: Q.tint, color: Q.teal, border: '1px solid #3F858055' }
                  : { background: '#FFFFFF', color: Q.soft, border: `1px solid ${Q.line}` }}>
                {label} ({k === 'all' ? quests.length : counts[k]})
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <div className="p-10 text-center" style={{ color: Q.muted }}>
              <div className="text-3xl mb-2">✅</div>Nothing to resolve.
            </div>
          )}

          <ul className="lg:max-h-[70vh] lg:overflow-y-auto">
            {shown.map(q => {
              const meta = VALIDITY_META[q.validity_status] || { label: q.validity_status, color: Q.soft }
              const on = sel?.id === q.id
              return (
                <li key={q.id}>
                  <button onClick={() => setSelId(q.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl text-left"
                    style={{ background: on ? Q.tint : 'transparent', border: `1px solid ${on ? '#3F858055' : 'transparent'}` }}
                    aria-current={on ? 'true' : undefined}>
                    <span className="w-9 h-9 rounded-lg flex-none flex items-center justify-center" style={{ background: Q.mist }}>
                      {evidenceMeta(q.evidence_type).emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-sm truncate" style={{ color: Q.ink }}>{q.profiles?.username || 'Unknown'}</span>
                      <span className="block text-sm truncate" style={{ color: Q.soft }}>{q.text}</span>
                    </span>
                    <span className="flex-none text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: meta.color, background: Q.mist }}>{meta.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* ── Detail ── */}
        {sel && (() => {
          const q = sel
          const meta = VALIDITY_META[q.validity_status] || { label: q.validity_status, color: Q.soft }
          const ev = evidenceMeta(q.evidence_type)
          const lastReview = log.find(r => r.task_id === q.id)
          return (
            <div className={`glass-card p-4 lg:col-span-3 ${phoneDetail ? '' : 'hidden lg:block'}`}>
              <button onClick={() => setSelId(null)} className="lg:hidden min-h-[44px] flex items-center gap-1.5 text-sm font-bold mb-2" style={{ color: Q.teal }}>
                <ArrowLeft size={15} /> Back to list
              </button>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                <span className="font-bold text-base" style={{ color: Q.ink }}>
                  {q.profiles?.username || 'Unknown'}
                  <span style={{ color: Q.muted, fontWeight: 400 }}> · {String(q.user_id || '').slice(0, 6)}</span>
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: Q.mist, color: meta.color }}>{meta.label}</span>
                <span className="text-sm" style={{ color: Q.muted }}>
                  {q.difficulty} · {q.priority} · {ev.emoji} {ev.label}{q.validity_score != null ? ` · score ${q.validity_score}` : ''}
                </span>
              </div>
              <p className="text-base" style={{ color: Q.ink }}>{q.text}</p>
              {q.goal && <p className="text-sm mt-1" style={{ color: Q.soft }}>🎯 {q.goal}</p>}
              {q.validity_reason && <p className="text-sm mt-2" style={{ color: Q.soft }}>Participant sees: “{q.validity_reason}”</p>}
              {lastReview && (lastReview.admin_reason || lastReview.risk_flags?.length > 0) && (
                <div className="text-sm mt-3 px-3 py-2 rounded-lg" style={{ background: Q.mist, color: Q.soft }}>
                  <span style={{ color: Q.muted }}>Internal: </span>{lastReview.admin_reason || '—'}
                  {lastReview.risk_flags?.length > 0 && (
                    <span className="ml-2">{lastReview.risk_flags.map(f => (
                      <span key={f} className="inline-block mr-1 px-1.5 py-0.5 rounded text-xs font-bold"
                        style={{ background: '#FBE8E3', color: '#A3412A' }}>{f}</span>
                    ))}</span>
                  )}
                  {lastReview.model_version && <span className="ml-2" style={{ color: Q.muted }}>{lastReview.model_version}</span>}
                </div>
              )}
              <div className="text-sm my-3 grid sm:grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: Q.muted }}>
                <div>Created: <span style={{ color: Q.ink }}>{qcAgo(q.created_at)}</span> · {qcAbs(q.created_at)}</div>
                {q.validity_checked_at && <div>AI checked: {qcAbs(q.validity_checked_at)}</div>}
                {q.planned_completion_date && <div>Planned finish: {qcAbs(q.planned_completion_date)}</div>}
                {q.validity_reviewed_at && <div>Admin reviewed: {qcAbs(q.validity_reviewed_at)}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <QButton kind="approve" onClick={() => resolveAndNext(q.id, 'accepted')} disabled={!!busy}>✅ Accept</QButton>
                {q.validity_status !== 'rejected' && (
                  <QButton kind="reject" onClick={() => resolveAndNext(q.id, 'rejected')} disabled={!!busy}>❌ Reject</QButton>
                )}
                <QButton kind="ai" onClick={() => rerunAI(q.id)} disabled={!!busy}>🔁 Run AI check</QButton>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Admin-only decision log */}
      <h4 className="font-extrabold text-base pt-2 flex items-center gap-2" style={{ color: Q.ink }}>
        Recent AI decisions
        <span className="font-normal text-sm" style={{ color: Q.muted }}>(incl. drafts that were never saved)</span>
      </h4>
      {log.length === 0 && <p className="text-sm" style={{ color: Q.muted }}>No decisions logged yet.</p>}
      {log.map(r => (
        <div key={r.id} className="rounded-xl px-4 py-3 text-sm" style={{ background: '#FFFFFF', border: `1px solid ${Q.line}` }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold" style={{ color: DECISION_COLOR[r.decision] || Q.muted }}>{r.decision}</span>
            {r.validity_score != null && <span style={{ color: Q.soft }}>score {r.validity_score}</span>}
            <span style={{ color: Q.ink }}>{r.profiles?.username || String(r.user_id || '').slice(0, 6)}</span>
            <span style={{ color: Q.soft }}>“{r.task_title}”</span>
            <span style={{ color: Q.muted }}>{r.difficulty} · {evidenceMeta(r.evidence_type).emoji}</span>
            {!r.task_id && <span style={{ color: Q.muted }}>(not saved)</span>}
            <span className="ml-auto" style={{ color: Q.muted }}>{qcAgo(r.created_at)}</span>
          </div>
          {r.admin_reason && <p className="mt-1" style={{ color: Q.soft }}>{r.admin_reason}</p>}
          <div className="mt-1 flex flex-wrap gap-1 items-center">
            {(r.risk_flags || []).map(f => (
              <span key={f} className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#FBE8E3', color: '#A3412A' }}>{f}</span>
            ))}
            {r.recommended_evidence_type && <span style={{ color: Q.muted }}>suggests {evidenceMeta(r.recommended_evidence_type).label}</span>}
            {r.model_version && <span style={{ color: Q.muted }}>{r.model_version}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* Research export: one row per quest, keyed by the participant's account id.
   No usernames, emails or quest text, per the study's no-identifiers rule. */
const EXPORT_COLS = ['user_id', 'difficulty', 'priority', 'evidence_type', 'validity_status', 'created_at',
  'planned_completion_date', 'completed', 'completed_at', 'completion_duration_minutes', 'is_procrastinated']

async function exportResearchCsv() {
  const rows = []
  for (let from = 0; ; from += 1000) {   // the API returns at most 1000 rows per request
    const { data, error } = await supabase.from('tasks').select(EXPORT_COLS.join(','))
      .order('created_at', { ascending: true }).range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  const cell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  const csv = [EXPORT_COLS.join(','), ...rows.map(r => EXPORT_COLS.map(c => cell(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `petquest-quests-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  return rows.length
}

export default function AdminPage() {
  const navigate  = useNavigate()
  const { profile, addNotification } = useGame()

  const [tab,      setTab]      = useState('overview')  // overview | queue | validity | testing
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
      <div className="theme-light min-h-screen relative z-10 flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="text-4xl">⚙️</motion.div>
      </div>
    )
  }

  const NAV_BTN = { background: '#FFFFFF', border: '1px solid #E1E7E3', color: '#3E5165' }

  return (
    <div className="theme-light min-h-screen relative z-10">
      {/* Nav */}
      <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex flex-wrap gap-2 items-center justify-between px-4 md:px-8 py-3"
        style={{ borderBottom: '1px solid #E1E7E3', background: '#FFFFFF' }}>
        <div className="flex items-center gap-3">
          <motion.button onClick={() => navigate('/dashboard')}
            className="min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={NAV_BTN}
            whileTap={{ scale: 0.95 }}>
            <ArrowLeft size={15} /> Dashboard
          </motion.button>
          <div>
            <h1 className="font-cinzel font-black text-lg" style={{ color: '#102A43' }}>Admin Control Room</h1>
            <p className="text-xs font-nunito hidden sm:block" style={{ color: 'var(--text-muted)' }}>
              Logged in as {profile?.username}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={async () => {
              try { addNotification(`Exported ${await exportResearchCsv()} quests.`, 'success') }
              catch (e) { addNotification(`Export failed: ${e.message}`, 'error') }
            }}
            className="min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={NAV_BTN}
            whileTap={{ scale: 0.95 }}
            title="Download every quest as a CSV for analysis (no names or quest text)">
            <Download size={14} /> Export CSV
          </motion.button>
          <motion.button onClick={loadData}
            className="min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-nunito font-semibold"
            style={NAV_BTN}
            whileTap={{ scale: 0.9, rotate: 180 }}>
            <RefreshCw size={14} /> Refresh
          </motion.button>
        </div>
      </motion.nav>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl text-sm font-nunito"
            style={{ background: '#FBE8E3', border: '1px solid #E58A73', color: '#A3412A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="flex flex-wrap gap-2">
          {[['overview', '📊 Overview'], ['queue', '🔍 Verification Queue'], ['validity', '🛡️ Quest Validity'], ['testing', '🧪 Testing']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-nunito font-bold transition-all"
              style={tab === key
                ? { background: '#E4EFEE', color: '#2F6F6B', border: '1px solid #3F858055' }
                : { background: '#FFFFFF', color: '#3E5165', border: '1px solid #E1E7E3' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'queue' && <VerificationQueue />}
        {tab === 'validity' && <QuestValidityQueue />}
        {/* Testing tools live on their own tab so the research view stays clean for the panel. */}
        {tab === 'testing' && <CheatPanel players={users} onChanged={loadData} />}

        {tab === 'overview' && (<>

        {/* ── Global stat cards ── */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon="👥" label="Total Players"     value={totalUsers}     color="#5B4C9A" />
          <StatCard icon="📜" label="Total Quests"      value={totalTasks}     color="#2F6F6B" />
          <StatCard icon="✅" label="Completed"          value={totalCompleted} color="#2F7A4D"
            sub={totalTasks > 0 ? `${Math.round(totalCompleted/totalTasks*100)}% of all tasks` : ''} />
          <StatCard icon="⚡" label="Avg Efficiency"    value={`${avgEfficiency}%`} color="#8A4B12" />
          <StatCard icon="😴" label="Procrastinated"    value={totalProcrast}  color="#A3412A"
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E1E7E3" />
                  <XAxis dataKey="name" tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} domain={[0, 100]} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E1E7E3" />
                  <XAxis dataKey="name" tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12 }} formatter={v => <span style={{ color: '#3E5165' }}>{v}</span>} />
                  <Bar dataKey="Total"     fill="#CBD5D0"  radius={[4,4,0,0]} />
                  <Bar dataKey="Completed" fill="#5EAF7B"               radius={[4,4,0,0]} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E1E7E3" />
                  <XAxis dataKey="name" tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  <YAxis tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12 }} formatter={v => <span style={{ color: '#3E5165' }}>{v}</span>} />
                  <Bar dataKey="OnTime"        fill="#5EAF7B" radius={[4,4,0,0]} />
                  <Bar dataKey="Procrastinated" fill="#E58A73" radius={[4,4,0,0]} />
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
                  <PolarGrid stroke="#CBD5D0" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#667085', fontSize: 11, fontFamily: 'Nunito' }} />
                  {radarData.map((u, i) => (
                    <Radar key={u.user} name={u.user} dataKey={u.user}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.15} />
                  ))}
                  <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 11 }} formatter={v => <span style={{ color: '#3E5165' }}>{v}</span>} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* ── Player table ── */}
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
          className="glass-card p-5">
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <h3 className="font-cinzel font-bold text-base flex items-center gap-2">
              <Users size={16} style={{ color: '#8A4B12' }} />
              All Players
              <span className="font-nunito font-normal text-sm" style={{ color: 'var(--text-muted)' }}>
                ({totalUsers})
              </span>
            </h3>
            {/* Sort controls */}
            <div className="flex flex-wrap items-center gap-2 text-sm font-nunito">
              <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
              {[
                { key: 'efficiency_pct', label: '⚡ Efficiency' },
                { key: 'completed_tasks', label: '✅ Completed' },
                { key: 'points', label: '⭐ Points' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => toggleSort(key)}
                  className="min-h-[44px] px-3 py-1 rounded-lg transition-all"
                  style={{
                    background: sortBy === key ? '#FBEEDF' : '#F3F5F2',
                    color: sortBy === key ? '#8A4B12' : '#667085',
                    border: `1px solid ${sortBy === key ? '#EBA66E' : '#E1E7E3'}`,
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
