import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { EGG_CHOICES, eggFor } from '../config/pets'
import { PETS } from '../data/pets'
import ParticleBurst from '../components/animations/ParticleBurst'
import PetRoom from '../components/PetRoom'
import BlurText from '../components/reactbits/BlurText'
import useReducedMotion from '../hooks/useReducedMotion'
import { HOME_FOR_PET, FALLBACK_HOME, PET_HOMES } from '../../apps/mobile/src/data/petHomeModel.ts'

/* Light palette — same values as apps/mobile/src/theme.ts. */
const INK = '#102A43'
const SOFT = '#3E5165'
const MUTED = '#667085'
const TEAL = '#3F8580'
const TEAL_DEEP = '#2F6F6B'
const LINE = '#E1E7E3'

function Egg({ egg, disabled, onChoose }) {
  const reduceMotion = useReducedMotion()
  const [failed, setFailed] = useState(false)
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(egg.id)}
      className="w-full flex flex-col items-center gap-3 rounded-2xl p-6 bg-white"
      style={{ border: `1px solid ${LINE}`, cursor: disabled ? 'default' : 'pointer' }}
      whileHover={disabled ? {} : { y: -4, borderColor: TEAL }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      aria-label={`Choose the egg: ${egg.eggRiddle}`}
    >
      {/* Gentle idle bob (falls back to an egg glyph rather than a broken box) */}
      <motion.div animate={reduceMotion ? {} : { y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
        {failed
          ? <span style={{ fontSize: 88, lineHeight: 1, display: 'block' }}>🥚</span>
          : <img src={eggFor(egg.id)} alt="" onError={() => setFailed(true)}
              style={{ width: 112, height: 112, objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }} />}
      </motion.div>
      <p className="italic text-sm" style={{ color: SOFT }}>{egg.eggRiddle}</p>
      <span className="w-full min-h-[44px] flex items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ background: TEAL_DEEP }}>
        Choose this egg
      </span>
    </motion.button>
  )
}

export default function EggHatchingPage() {
  const { reserveHatch, commitHatch, addNotification, logout, user } = useGame()
  const navigate = useNavigate()
  const [chosen, setChosen]   = useState(null)      // petId being hatched
  const [busy, setBusy]       = useState(false)     // persisting the choice
  const [burst, setBurst]     = useState(false)
  const [hatched, setHatched] = useState(false)     // show the "Meet …" card
  const hatching = !!chosen

  const chosenMeta = EGG_CHOICES.find(e => e.id === chosen)
  const pet = PETS.find(p => p.id === chosen)
  const home = PET_HOMES[HOME_FOR_PET[chosen] ?? FALLBACK_HOME]

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
    // Sequence: wobble (~1.1s) → crack + particle burst → meet your companion.
    setTimeout(() => setBurst(true), 1100)
    setTimeout(() => setHatched(true), 1550)
  }

  // The choice is already saved server-side; just mirror it locally and route on.
  // Navigation never awaits the network.
  const finish = () => {
    commitHatch(chosen)
    navigate('/mode-select')    // pick a mode → starter quests → dashboard
  }

  return (
    <div className="theme-light min-h-screen relative z-10 flex flex-col items-center justify-center font-nunito">
      <div className="max-w-4xl mx-auto px-4 py-12 w-full">
        <AnimatePresence mode="wait">
          {/* CHOOSING — three egg cards */}
          {!hatching && (
            <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8">
                <p className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: MUTED }}>
                  Welcome, {user?.username}
                </p>
                <BlurText as="h1" text="Choose your companion egg" animateBy="words" direction="top" delay={140}
                  className="font-extrabold text-3xl md:text-4xl mb-3 justify-center" />
                <p className="text-base" style={{ color: SOFT }}>
                  One of these holds your companion. Trust your instinct.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {EGG_CHOICES.map((egg, i) => (
                  <motion.div key={egg.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12, duration: 0.4 }}>
                    <Egg egg={egg} disabled={busy} onChoose={choose} />
                  </motion.div>
                ))}
              </div>
              {/* Escape hatch so a stuck onboarding user can always reset. */}
              <div className="text-center mt-6">
                <button onClick={async () => { await logout(); navigate('/', { replace: true }) }}
                  className="min-h-[44px] px-3 text-sm underline" style={{ color: MUTED }}>
                  Sign out
                </button>
              </div>
            </motion.div>
          )}

          {/* HATCHING — the chosen egg wobbles, cracks, bursts */}
          {hatching && !hatched && (
            <motion.div key="hatch" className="flex flex-col items-center justify-center" style={{ minHeight: 320 }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
                <ParticleBurst show={burst} count={16} distance={90} color="#EBA66E" />
                <motion.img
                  src={eggFor(chosen)}
                  alt="Hatching egg"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                  style={{ width: 150, height: 150, objectFit: 'contain', imageRendering: 'pixelated' }}
                  animate={{ rotate: [0, -8, 8, -12, 12, -16, 16, 0], scale: [1, 1.02, 1, 1.04, 1, 1.06, 1] }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                />
              </div>
              <p className="italic text-base mt-6" style={{ color: SOFT }}>{chosenMeta?.eggRiddle}</p>
            </motion.div>
          )}

          {/* HATCHED — meet the companion in its new home */}
          {hatched && (
            <motion.div key="meet" className="glass-card p-4 max-w-md mx-auto text-center"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
              <PetRoom pet={pet} level={1} />
              <h1 className="font-extrabold text-2xl mt-4" style={{ color: INK }}>Meet {pet?.name}!</h1>
              <p className="text-base mt-1 mb-5" style={{ color: SOFT }}>
                Your {pet?.species} lives in the {home.displayName}.
              </p>
              <motion.button onClick={finish} autoFocus
                className="w-full min-h-[48px] rounded-xl text-base font-bold text-white"
                style={{ background: TEAL_DEEP }} whileTap={{ scale: 0.97 }}>
                Choose your mode →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
