import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { PETS } from '../data/pets'

const GameContext = createContext(null)

const INITIAL_STATS = { hunger: 80, cleanliness: 78, happiness: 72 }
const STAT_DECREASE_INTERVAL = 30000
const CACHE_PREFIX = 'pq_'

export const HARD_PERIOD_MS   = 7 * 24 * 60 * 60 * 1000
export const MEDIUM_PERIOD_MS = 3 * 24 * 60 * 60 * 1000

export const DIFF_POINTS = { easy: 10, medium: 25, hard: 50 }

function lsGet(key, fb) {
  try { const v = localStorage.getItem(CACHE_PREFIX + key); return v !== null ? JSON.parse(v) : fb }
  catch { return fb }
}
function lsSet(key, val) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(val)) } catch {}
}

export function GameProvider({ children }) {
  const [session,              setSession]              = useState(null)
  const [profile,              setProfile]              = useState(() => lsGet('profile', null))
  const [authReady,            setAuthReady]            = useState(false)
  const [petStats,             setPetStats]             = useState(() => lsGet('stats',         INITIAL_STATS))
  const [tasks,                setTasks]                = useState(() => lsGet('tasks',         []))
  const [points,               setPoints]               = useState(() => lsGet('points',        0))
  const [ownedAccessories,     setOwnedAccessories]     = useState(() => lsGet('owned_acc',     []))
  const [equippedAccessories,  setEquippedAccessories]  = useState(() => lsGet('eq_acc',        {}))
  const [progressLogs,         setProgressLogs]         = useState(() => lsGet('progress_logs', {}))
  const [notifications,        setNotifications]        = useState([])

  const notifId   = useRef(0)
  const pointsRef = useRef(points)
  useEffect(() => { pointsRef.current = points }, [points])

  const selectedPet = PETS.find(p => p.id === profile?.selected_pet_id) || null

  /* ── auth listener ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setAuthReady(true) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) { setAuthReady(true); return }
    setProfile(data); lsSet('profile', data)
    setPoints(data.points); lsSet('points', data.points)
    await Promise.all([
      fetchPetStats(userId),
      fetchTasks(userId),
      fetchAccessories(userId),
      fetchProgressLogs(userId),
    ])
    setAuthReady(true)
  }

  async function fetchPetStats(userId) {
    const { data } = await supabase.from('pet_stats').select('*').eq('user_id', userId).single()
    if (data) {
      const s = { hunger: data.hunger, cleanliness: data.cleanliness, happiness: data.happiness }
      setPetStats(s); lsSet('stats', s)
    }
  }

  async function fetchTasks(userId) {
    const { data } = await supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: true })
    if (data) { setTasks(data); lsSet('tasks', data) }
  }

  async function fetchAccessories(userId) {
    const [{ data: owned }, { data: equipped }] = await Promise.all([
      supabase.from('owned_accessories').select('accessory_id').eq('user_id', userId),
      supabase.from('equipped_accessories').select('category, accessory_id').eq('user_id', userId),
    ])
    if (owned)    { const ids = owned.map(r => r.accessory_id); setOwnedAccessories(ids); lsSet('owned_acc', ids) }
    if (equipped) { const map = Object.fromEntries(equipped.map(r => [r.category, r.accessory_id])); setEquippedAccessories(map); lsSet('eq_acc', map) }
  }

  async function fetchProgressLogs(userId) {
    const { data } = await supabase
      .from('task_progress')
      .select('*')
      .eq('user_id', userId)
      .order('logged_at', { ascending: true })
    if (data) {
      const byTask = {}
      data.forEach(log => {
        if (!byTask[log.task_id]) byTask[log.task_id] = []
        byTask[log.task_id].push(log)
      })
      setProgressLogs(byTask); lsSet('progress_logs', byTask)
    }
  }

  /* ── stat decay ── */
  useEffect(() => {
    if (!profile?.selected_pet_id || !profile?.id) return
    const id = setInterval(async () => {
      setPetStats(prev => {
        const next = {
          hunger:      Math.max(0, prev.hunger      - 2),
          cleanliness: Math.max(0, prev.cleanliness - 1.5),
          happiness:   Math.max(0, prev.happiness   - 1.5),
        }
        lsSet('stats', next)
        supabase.from('pet_stats').upsert({ user_id: profile.id, ...next, updated_at: new Date().toISOString() }).then(() => {})
        return next
      })
    }, STAT_DECREASE_INTERVAL)
    return () => clearInterval(id)
  }, [profile?.selected_pet_id, profile?.id])

  /* ── notifications ── */
  const addNotification = useCallback((message, type = 'info') => {
    const id = ++notifId.current
    setNotifications(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3500)
  }, [])

  const dismissNotification = useCallback((id) => setNotifications(prev => prev.filter(n => n.id !== id)), [])

  /* ── auth ── */
  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { data }
  }, [])

  const register = useCallback(async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
    if (error) return { error: error.message }
    return { data }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k))
    setProfile(null); setPetStats(INITIAL_STATS); setTasks([]); setPoints(0)
    setOwnedAccessories([]); setEquippedAccessories({}); setProgressLogs({})
  }, [])

  /* ── pet ── */
  const selectPet = useCallback(async (petId) => {
    setProfile(prev => { const n = { ...prev, selected_pet_id: petId }; lsSet('profile', n); return n })
    setPetStats(INITIAL_STATS); lsSet('stats', INITIAL_STATS)
    await supabase.from('profiles').update({ selected_pet_id: petId }).eq('id', profile.id)
    await supabase.from('pet_stats').upsert({ user_id: profile.id, ...INITIAL_STATS, updated_at: new Date().toISOString() })
  }, [profile?.id])

  /* ── game mode ── */
  const setGameMode = useCallback(async (mode) => {
    setProfile(prev => { const n = { ...prev, game_mode: mode }; lsSet('profile', n); return n })
    await supabase.from('profiles').update({ game_mode: mode }).eq('id', profile?.id)
  }, [profile?.id])

  /* ── tasks ── */
  const addTask = useCallback(async (text, difficulty = 'easy') => {
    if (!text.trim()) return false

    const now = Date.now()
    const hardStart  = new Date(profile?.hard_period_start  || 0).getTime()
    const medStart   = new Date(profile?.medium_period_start || 0).getTime()
    const hardExpired = now - hardStart  >= HARD_PERIOD_MS
    const medExpired  = now - medStart   >= MEDIUM_PERIOD_MS

    if (difficulty === 'hard') {
      if (!hardExpired) {
        const hardInPeriod = tasks.filter(t =>
          t.difficulty === 'hard' &&
          new Date(t.created_at).getTime() >= hardStart
        )
        if (hardInPeriod.length >= 1) {
          addNotification('Hard quest limit reached! 1 per week. Resets automatically or ask an admin. 🔥', 'error')
          return false
        }
      } else {
        const newStart = new Date().toISOString()
        setProfile(prev => { const n = { ...prev, hard_period_start: newStart }; lsSet('profile', n); return n })
        await supabase.from('profiles').update({ hard_period_start: newStart }).eq('id', profile?.id)
      }
    }

    if (difficulty === 'medium') {
      if (!medExpired) {
        const medInPeriod = tasks.filter(t =>
          t.difficulty === 'medium' &&
          new Date(t.created_at).getTime() >= medStart
        )
        if (medInPeriod.length >= 3) {
          addNotification('Medium quest limit reached! 3 per 3 days. Resets automatically or ask an admin. ⚡', 'error')
          return false
        }
      } else {
        const newStart = new Date().toISOString()
        setProfile(prev => { const n = { ...prev, medium_period_start: newStart }; lsSet('profile', n); return n })
        await supabase.from('profiles').update({ medium_period_start: newStart }).eq('id', profile?.id)
      }
    }

    const tmp = {
      id: 'tmp_' + Date.now(),
      user_id: profile?.id,
      text: text.trim(),
      difficulty,
      completed: false,
      created_at: new Date().toISOString(),
      completed_at: null,
    }
    setTasks(prev => { const n = [...prev, tmp]; lsSet('tasks', n); return n })
    const { data } = await supabase.from('tasks').insert({ user_id: profile?.id, text: text.trim(), difficulty }).select().single()
    if (data) setTasks(prev => { const n = prev.map(t => t.id === tmp.id ? data : t); lsSet('tasks', n); return n })
    return true
  }, [profile, tasks, addNotification])

  const completeTask = useCallback(async (id) => {
    const task = tasks.find(t => t.id === id)
    const pts  = DIFF_POINTS[task?.difficulty || 'easy']
    const now  = new Date().toISOString()
    setTasks(prev => { const n = prev.map(t => t.id === id ? { ...t, completed: true, completed_at: now } : t); lsSet('tasks', n); return n })
    const newPts = pointsRef.current + pts
    setPoints(newPts); lsSet('points', newPts)
    addNotification(`+${pts} Quest Points earned! ✨`, 'success')
    await Promise.all([
      supabase.from('tasks').update({ completed: true, completed_at: now }).eq('id', id),
      supabase.from('profiles').update({ points: newPts }).eq('id', profile?.id),
    ])
  }, [profile?.id, tasks, addNotification])

  const deleteTask = useCallback(async (id) => {
    setTasks(prev => { const n = prev.filter(t => t.id !== id); lsSet('tasks', n); return n })
    await supabase.from('tasks').delete().eq('id', id)
  }, [])

  /* ── bulk preset loader ── */
  const bulkAddPresets = useCallback(async (questsToAdd) => {
    if (!questsToAdd.length || !profile?.id) return 0

    const now       = Date.now()
    const hardStart = new Date(profile?.hard_period_start  || 0).getTime()
    const medStart  = new Date(profile?.medium_period_start || 0).getTime()
    const hardExpired = now - hardStart >= HARD_PERIOD_MS
    const medExpired  = now - medStart  >= MEDIUM_PERIOD_MS

    let hardCount = hardExpired ? 0 : tasks.filter(t =>
      t.difficulty === 'hard' && new Date(t.created_at).getTime() >= hardStart
    ).length
    let medCount = medExpired ? 0 : tasks.filter(t =>
      t.difficulty === 'medium' && new Date(t.created_at).getTime() >= medStart
    ).length

    const allowed = questsToAdd.filter(q => {
      if (q.difficulty === 'hard')   { if (hardCount >= 1) return false; hardCount++; return true }
      if (q.difficulty === 'medium') { if (medCount  >= 3) return false; medCount++;  return true }
      return true
    })

    if (!allowed.length) return 0
    const rows = allowed.map(q => ({ user_id: profile.id, text: q.text, difficulty: q.difficulty }))
    const { data } = await supabase.from('tasks').insert(rows).select()
    if (data) { setTasks(prev => { const n = [...prev, ...data]; lsSet('tasks', n); return n }); return data.length }
    return 0
  }, [profile, tasks])

  /* ── progress logs ── */
  const addProgressLog = useCallback(async (taskId, note) => {
    if (!note.trim()) return false
    const tmpLog = {
      id: 'tmp_' + Date.now(),
      task_id: taskId,
      user_id: profile?.id,
      note: note.trim(),
      logged_at: new Date().toISOString(),
    }
    setProgressLogs(prev => {
      const updated = { ...prev, [taskId]: [...(prev[taskId] || []), tmpLog] }
      lsSet('progress_logs', updated)
      return updated
    })
    const { data } = await supabase.from('task_progress').insert({ task_id: taskId, user_id: profile?.id, note: note.trim() }).select().single()
    if (data) {
      setProgressLogs(prev => {
        const updated = { ...prev, [taskId]: (prev[taskId] || []).map(l => l.id === tmpLog.id ? data : l) }
        lsSet('progress_logs', updated)
        return updated
      })
    }
    return true
  }, [profile?.id])

  /* ── points / care ── */
  const spendPoints = useCallback(async (amount) => {
    const cur = pointsRef.current
    if (cur < amount) { addNotification(`Not enough points! Need ${amount} 💸`, 'error'); return false }
    const next = cur - amount
    setPoints(next); lsSet('points', next)
    await supabase.from('profiles').update({ points: next }).eq('id', profile?.id)
    return true
  }, [profile?.id, addNotification])

  const updateStat = useCallback(async (stat, delta) => {
    setPetStats(prev => {
      const next = { ...prev, [stat]: Math.min(100, prev[stat] + delta) }
      lsSet('stats', next)
      supabase.from('pet_stats').upsert({ user_id: profile?.id, ...next, updated_at: new Date().toISOString() }).then(() => {})
      return next
    })
  }, [profile?.id])

  const feedPet = useCallback(async () => {
    if (!(await spendPoints(10))) return false
    await updateStat('hunger', 30); addNotification(`${selectedPet?.name} loved the meal! 🍖`, 'success'); return true
  }, [spendPoints, updateStat, selectedPet, addNotification])

  const showerPet = useCallback(async () => {
    if (!(await spendPoints(10))) return false
    await updateStat('cleanliness', 30); addNotification(`${selectedPet?.name} is sparkling clean! 🛁`, 'success'); return true
  }, [spendPoints, updateStat, selectedPet, addNotification])

  const playWithPet = useCallback(async () => {
    if (!(await spendPoints(10))) return false
    await updateStat('happiness', 30); addNotification(`${selectedPet?.name} is overjoyed! 🎉`, 'success'); return true
  }, [spendPoints, updateStat, selectedPet, addNotification])

  /* ── accessories ── */
  const buyAccessory = useCallback(async (accessory) => {
    if (ownedAccessories.includes(accessory.id)) { addNotification('You already own this!', 'info'); return false }
    if (!(await spendPoints(accessory.cost))) return false
    const next = [...ownedAccessories, accessory.id]; setOwnedAccessories(next); lsSet('owned_acc', next)
    await supabase.from('owned_accessories').insert({ user_id: profile?.id, accessory_id: accessory.id })
    addNotification(`${accessory.name} purchased! 🎁`, 'success'); return true
  }, [ownedAccessories, spendPoints, profile?.id, addNotification])

  const equipAccessory = useCallback(async (accessory) => {
    if (!ownedAccessories.includes(accessory.id)) { addNotification("You don't own this!", 'error'); return }
    setEquippedAccessories(prev => {
      let next
      if (prev[accessory.category] === accessory.id) {
        next = { ...prev }; delete next[accessory.category]
        supabase.from('equipped_accessories').delete().eq('user_id', profile?.id).eq('category', accessory.category).then(() => {})
      } else {
        next = { ...prev, [accessory.category]: accessory.id }
        supabase.from('equipped_accessories').upsert({ user_id: profile?.id, category: accessory.category, accessory_id: accessory.id }).then(() => {})
      }
      lsSet('eq_acc', next); return next
    })
  }, [ownedAccessories, profile?.id, addNotification])

  return (
    <GameContext.Provider value={{
      session, profile, authReady,
      user: profile, login, register, logout,
      selectedPet, selectPet,
      petStats,
      tasks, addTask, completeTask, deleteTask,
      progressLogs, addProgressLog, bulkAddPresets,
      points, spendPoints,
      feedPet, showerPet, playWithPet,
      ownedAccessories, equippedAccessories,
      buyAccessory, equipAccessory,
      setGameMode,
      notifications, addNotification, dismissNotification,
    }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be within GameProvider')
  return ctx
}
