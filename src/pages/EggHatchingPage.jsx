import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { EGG_CHOICES, eggFor } from '../config/pets'
import ParticleBurst from '../components/animations/ParticleBurst'
import EvolutionOverlay from '../components/animations/EvolutionOverlay'
import BlurText from '../components/reactbits/BlurText'

/* Egg-flavoured glow so each mystery egg reads differently without naming it. */
const EGG_GLOW = {
  dragon: 'rgba(168,85,247,0.55)',   // arcane purple
  cat:    'rgba(255,217,138,0.55)',  // cream-gold
  wolf:   'rgba(127,216,255,0.55)',  // frost teal
}

function Egg({ egg, disabled, onChoose }) {
  const glow = EGG_GLOW[egg.id] || 'rgba(245,163,26,0.5)'
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(egg.id)}
      className="flex flex-col items-center gap-4 rounded-2xl p-6 relative"
      style={{ background: 'rgba(14,14,46,0.6)', border: '1px solid rgba(124,58,237,0.2)', cursor: disabled ? 'default' : 'pointer' }}
      whileHover={disabled ? {} : { y: -8, scale: 1.03, borderColor: 'rgba(245,163,26,0.5)' }}
      whileTap={disabled ? {} : { scale: 0.97 }}
    >
      {/* Glow pulse behind the egg */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 150, height: 150, top: 24, background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, filter: 'blur(14px)' }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Gentle idle bob */}
      <motion.img
        src={eggFor(egg.id)}
        alt="A mysterious egg"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        className="relative z-10"
        style={{ width: 128, height: 128, objectFit: 'contain', imageRendering: 'pixelated', filter: `drop-shadow(0 8px 14px rgba(0,0,0,0.5))` }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <p className="font-cinzel italic text-sm relative z-10" style={{ color: '#c9b98a' }}>{egg.eggRiddle}</p>
    </motion.button>
  )
}

export default function EggHatchingPage() {
  const { reserveHatch, commitHatch, addNotification, logout, user } = useGame()
  const navigate = useNavigate()
  const [chosen, setChosen]       = useState(null)      // petId being hatched
  const [busy, setBusy]           = useState(false)     // persisting the choice
  const [burst, setBurst]         = useState(false)
  const [celebrate, setCelebrate] = useState(null)      // EvolutionOverlay payload
  const hatching = !!chosen

  const chosenMeta = EGG_CHOICES.find(e => e.id === chosen)

  const choose = async (petId) => {
    if (busy || hatching) return
    // Persist the choice to Supabase FIRST — the animation must never be what
    // unblocks the route, and a refresh mid-hatch must still find a saved pet.
    setBusy(true)
    const { error } = await reserveHatch(petId)
    setBusy(false)
    if (error) {
      addNotification(`Could not hatch your companion: ${error}. Please try again.`, 'error')
      return
    }
    setChosen(petId)
    // Sequence: wobble (~1.1s) → crack + particle burst → hatch reveal.
    setTimeout(() => setBurst(true), 1100)
    setTimeout(() => {
      const meta = EGG_CHOICES.find(e => e.id === petId)
      setCelebrate({
        id: Date.now(), kind: 'hatch', petId, level: 1,
        title: 'Hatched!',
        subtitle: `Your companion has hatched: ${meta.name} the ${meta.species}!`,
        button: 'Meet your companion',
      })
    }, 1550)
  }

  // "Meet your companion" — the choice is already saved server-side; just mirror
  // it locally and route on. Navigation never awaits the network.
  const finish = () => {
    commitHatch(chosen)
    navigate('/mode-select')    // pick a mode → starter quests → dashboard
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,163,26,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12 w-full">
        <motion.div className="text-center mb-12" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-xs font-nunito uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
            Welcome, {user?.username}
          </p>
          <BlurText as="h1" text="Choose Your Companion Egg" animateBy="words" direction="top" delay={140}
            className="font-cinzel font-black text-4xl md:text-5xl gradient-text-gold mb-3 justify-center" />
          <p className="font-nunito text-base" style={{ color: '#8080aa' }}>
            One of these holds your destined companion. Trust your instinct — the egg will do the rest.
          </p>
          {/* Escape hatch so a stuck onboarding user can always reset. */}
          {!hatching && (
            <button onClick={async () => { await logout(); navigate('/', { replace: true }) }}
              className="text-xs font-nunito underline mt-3" style={{ color: 'var(--text-muted)' }}>
              Sign out
            </button>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {/* CHOOSING — three eggs in a row */}
          {!hatching && (
            <motion.div key="choose" className="grid grid-cols-1 sm:grid-cols-3 gap-6 justify-items-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {EGG_CHOICES.map((egg, i) => (
                <motion.div key={egg.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15, duration: 0.5 }}>
                  <Egg egg={egg} disabled={busy} onChoose={choose} />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* HATCHING — the chosen egg wobbles, cracks, bursts */}
          {hatching && (
            <motion.div key="hatch" className="flex flex-col items-center justify-center" style={{ minHeight: 320 }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
                <ParticleBurst show={burst} count={16} distance={90} color="#ffd166" />
                <motion.img
                  src={eggFor(chosen)}
                  alt="Hatching egg"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                  style={{ width: 150, height: 150, objectFit: 'contain', imageRendering: 'pixelated', filter: 'drop-shadow(0 0 24px var(--gold))' }}
                  animate={{ rotate: [0, -8, 8, -12, 12, -16, 16, 0], scale: [1, 1.02, 1, 1.04, 1, 1.06, 1] }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                />
              </div>
              <p className="font-cinzel italic text-sm mt-6" style={{ color: '#c9b98a' }}>{chosenMeta?.eggRiddle}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reuse the Phase 2 celebration overlay for the reveal */}
      <EvolutionOverlay evolution={celebrate} onDone={finish} />
    </div>
  )
}
