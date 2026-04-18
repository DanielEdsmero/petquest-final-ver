import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'

const STARS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 3,
  duration: Math.random() * 3 + 2,
}))

export default function LoginPage() {
  const [tab,      setTab]      = useState('login')
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [info,     setInfo]     = useState('')
  const [loading,  setLoading]  = useState(false)

  const { login, register } = useGame()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setInfo('')
    if (!email.trim())    { setError('Email is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (tab === 'register' && !username.trim()) { setError('Adventurer name is required'); return }
    setLoading(true)

    if (tab === 'login') {
      const { error } = await login(email.trim(), password)
      if (error) { setError(error); setLoading(false); return }
      navigate('/select')
    } else {
      const { error, data } = await register(email.trim(), password, username.trim())
      if (error) { setError(error); setLoading(false); return }
      if (data?.user && !data.session) {
        setInfo('Check your email to confirm your account, then log in.')
        setTab('login'); setLoading(false); return
      }
      navigate('/select')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      {STARS.map(s => (
        <motion.div key={s.id} className="absolute rounded-full pointer-events-none"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size,
            background: s.id % 3 === 0 ? '#f5a31a' : s.id % 5 === 0 ? '#7c3aed' : '#e2e2ff' }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }} />
      ))}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,163,26,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <motion.div initial={{ opacity: 0, y: 32, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7 }} className="glass-card w-full max-w-md mx-4 p-8 relative z-10">
        <div className="text-center mb-6">
          <motion.div className="text-6xl mb-3 block"
            animate={{ rotate: [0,-5,5,-3,3,0] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}>🐾</motion.div>
          <h1 className="font-cinzel font-black text-4xl tracking-wider gradient-text-gold">Pet Quest</h1>
          <p className="text-sm mt-1 font-nunito" style={{ color: 'var(--text-muted)' }}>Companion Chronicles</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden mb-6"
          style={{ background: 'rgba(19,19,58,0.8)', border: '1px solid rgba(124,58,237,0.2)' }}>
          {['login','register'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setInfo('') }}
              className="flex-1 py-2.5 text-sm font-nunito font-bold transition-all"
              style={{
                background: tab === t ? 'rgba(245,163,26,0.18)' : 'transparent',
                color: tab === t ? '#f5a31a' : '#6060aa',
                borderBottom: tab === t ? '2px solid #f5a31a' : '2px solid transparent',
              }}>
              {t === 'login' ? '⚔️ Log In' : '🌟 Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {tab === 'register' && (
              <motion.div key="username" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
                <label className="block text-xs font-semibold mb-1.5 font-nunito uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Adventurer Name
                </label>
                <input type="text" className="input-field" placeholder="Your hero's name..."
                  value={username} onChange={e => setUsername(e.target.value)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-xs font-semibold mb-1.5 font-nunito uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Email</label>
            <input type="email" className="input-field" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 font-nunito uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Password</label>
            <input type="password" className="input-field" placeholder="6+ characters"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          {error && (
            <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }}
              className="text-sm font-nunito text-center py-2 px-3 rounded-lg"
              style={{ background:'rgba(244,63,94,0.1)', color:'#f43f5e', border:'1px solid rgba(244,63,94,0.2)' }}>
              ⚠️ {error}
            </motion.p>
          )}

          {info && (
            <motion.p initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }}
              className="text-sm font-nunito text-center py-2 px-3 rounded-lg"
              style={{ background:'rgba(34,197,94,0.1)', color:'#4ade80', border:'1px solid rgba(34,197,94,0.2)' }}>
              ✅ {info}
            </motion.p>
          )}

          <motion.button type="submit" className="btn-gold w-full py-3 text-base font-nunito font-bold"
            disabled={loading} whileTap={{ scale: 0.97 }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:'linear' }}>⚙️</motion.span>
                  {tab === 'login' ? 'Opening the Portal...' : 'Creating your legend...'}
                </span>
              : tab === 'login' ? '⚔️  Begin Adventure' : '🌟  Create Account'
            }
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
