import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'

/* Light palette shared with the landing page and the mobile app. */
const INK = '#102A43', SOFT = '#3E5165', TEAL = '#3F8580', LINE = '#CBD5D0'
const inputCls = 'w-full min-h-[44px] rounded-xl border px-3.5 text-[15px] bg-white outline-none focus:ring-2 focus:ring-[#3F8580]/40 focus:border-[#3F8580]'
const labelCls = 'block text-xs font-bold mb-1.5 uppercase tracking-widest'

export default function LoginPage() {
  const [params] = useSearchParams()
  const [tab,      setTab]      = useState(params.get('mode') === 'register' ? 'register' : 'login')
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [info,     setInfo]     = useState('')
  const [loading,  setLoading]  = useState(false)

  const { login, register, addNotification } = useGame()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setInfo('')
    if (!email.trim())    { setError('Email is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (tab === 'register' && !username.trim()) { setError('Adventurer name is required'); return }
    /* The request starts NOW. GameContext flips `signingIn` as it goes, which
       mounts the account-loading mascot in App.jsx — animation and network run
       in parallel, and the animation is never torn down by the redirect that
       follows a successful sign-in. */
    setLoading(true)

    /* Any failure drops the gate immediately — a participant is never held
       behind the animation when there is nothing to reveal. */
    const fail = (msg, toast = msg) => {
      setError(msg); if (toast) addNotification(toast, 'error')
      setLoading(false)
    }

    if (tab === 'login') {
      const { error } = await login(email.trim(), password)
      if (error) {
        // Keep typed values; show both an inline message and a toast.
        return fail(error === 'Invalid login credentials' ? 'Invalid email or password' : error,
                    'Invalid email or password')
      }
    } else {
      const { error, data } = await register(email.trim(), password, username.trim())
      if (error) return fail(error)
      if (data?.user && !data.session) {
        setInfo('Check your email to confirm your account, then log in.')
        setTab('login'); setLoading(false); return
      }
    }
    /* Nothing to navigate: the account-loading gate is already on screen and,
       once it reveals, the "/" route guard sends the user to /select (or
       /mode-select, or /dashboard) based on how far they got. */
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10 font-nunito" style={{ background: '#FAF8F0', color: INK }}>
      <Link to="/" className="self-start sm:self-center sm:w-full sm:max-w-md mb-4 inline-flex items-center min-h-[44px] text-sm font-bold" style={{ color: '#2F6F6B' }}>
        ← Back to PetQuest
      </Link>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md rounded-3xl border bg-white p-7 sm:p-8" style={{ borderColor: '#E1E7E3', boxShadow: '0 10px 30px rgba(16,42,67,.08)' }}>
        <div className="text-center mb-6">
          <img src="/landing/mystic_cat.webp" alt="" width="72" height="72" className="w-[72px] h-[72px] mx-auto" />
          <h1 className="text-3xl font-extrabold mt-2">PetQuest</h1>
          <p className="text-sm mt-1" style={{ color: SOFT }}>{tab === 'login' ? 'Welcome back. Your pet missed you.' : 'Create your account to meet your companion.'}</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl p-1 mb-6" role="tablist" style={{ background: '#F3F5F2' }}>
          {['login','register'].map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t}
              onClick={() => { setTab(t); setError(''); setInfo('') }}
              className="flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors"
              style={{ background: tab === t ? '#FFFFFF' : 'transparent', color: tab === t ? INK : SOFT,
                boxShadow: tab === t ? '0 1px 3px rgba(16,42,67,.12)' : 'none' }}>
              {t === 'login' ? 'Log in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* autoComplete off (+ non-standard tokens) so saved credentials don't
            auto-inject and clobber what the user types. */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <AnimatePresence mode="wait">
            {tab === 'register' && (
              <motion.div key="username" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
                <label htmlFor="username" className={labelCls} style={{ color: SOFT }}>Adventurer Name</label>
                <input id="username" type="text" className={inputCls} style={{ borderColor: LINE }} placeholder="What should we call you?" autoComplete="off"
                  value={username} onChange={e => setUsername(e.target.value)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="email" className={labelCls} style={{ color: SOFT }}>Email</label>
            <input id="email" type="email" className={inputCls} style={{ borderColor: LINE }} placeholder="your@email.com" autoComplete="petquest-email" name="petquest-email"
              value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </div>

          <div>
            <label htmlFor="password" className={labelCls} style={{ color: SOFT }}>Password</label>
            <input id="password" type="password" className={inputCls} style={{ borderColor: LINE }} placeholder="6+ characters" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-center py-2 px-3 rounded-lg" style={{ background: '#FBE8E3', color: '#A3412A' }}>
              {error}
            </p>
          )}

          {info && (
            <p role="status" className="text-sm text-center py-2 px-3 rounded-lg" style={{ background: '#E6F4EA', color: '#2F7A4D' }}>
              {info}
            </p>
          )}

          <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
            className="w-full min-h-[48px] rounded-xl text-white font-bold text-base disabled:opacity-70"
            style={{ background: TEAL }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:'linear' }}>⚙️</motion.span>
                  {tab === 'login' ? 'Signing in...' : 'Creating your account...'}
                </span>
              : tab === 'login' ? 'Log in' : 'Create account'
            }
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
