import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useCompanion } from '../context/CompanionContext'
import PetSprite from './PetSprite'
import { GUIDE_STEPS, markGuideDone } from '../data/petCompanion'

/*
 * First-login guide, led by the student's own pet. Five short steps; the pet
 * walks to the real quest card and care rings while it talks, then a practice
 * selfie shows how proof photos work.
 *
 * PRIVACY: the selfie is practice only. It is held in this component's memory,
 * drawn to a canvas on this device and thrown away when the step ends. It is never
 * uploaded, saved or logged, and nothing in this file talks to the network or
 * Supabase (tests/pet-companion.test.mjs checks that). The study collects no
 * personal identifiers, so this must stay true.
 */

const INK = '#102A43', SOFT = '#3E5165', MUTED = '#667085', TEAL = '#3F8580', TEAL_DEEP = '#2F6F6B', TEAL_TINT = '#E4EFEE', LINE = '#E1E7E3', MIST = '#F3F5F2'

const btn = (primary) => ({
  minHeight: 46, borderRadius: 12, padding: '0 18px', cursor: 'pointer',
  font: '800 15px Nunito, system-ui, sans-serif',
  background: primary ? TEAL : '#FFFFFF', color: primary ? '#FFFFFF' : TEAL_DEEP,
  border: primary ? '0' : '1px solid #CBD5D0',
})

/* The practice camera. Calls onDone() when the student is happy with the shot. */
function SelfiePractice({ onDone, onSkip }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [mode, setMode] = useState('idle')      // idle | live | shot | blocked
  const [shot, setShot] = useState(null)        // data URL, memory only

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }
  useEffect(() => () => { stop() }, [])         // leaving the step always turns the camera off

  const turnOn = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setMode('blocked'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setMode('live')
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play?.().catch(() => {}) } })
    } catch {
      setMode('blocked')
    }
  }

  const take = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    const g = c.getContext('2d')
    g.translate(c.width, 0); g.scale(-1, 1)     // mirrored, like the preview
    g.drawImage(v, 0, 0)
    setShot(c.toDataURL('image/jpeg', 0.85))
    stop(); setMode('shot')
  }

  const retake = () => { setShot(null); setMode('idle'); turnOn() }

  const fromFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => { setShot(r.result); setMode('shot') }
    r.readAsDataURL(f)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(160deg,#cfd9d6,#a9bcb8)', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
        {mode === 'live' && <video ref={videoRef} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
        {mode === 'shot' && shot && <img src={shot} alt="Your practice shot" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {(mode === 'idle' || mode === 'live' || mode === 'blocked') && (
          <div aria-hidden="true" style={{ width: '38%', aspectRatio: '3 / 4', border: '3px dashed rgba(255,255,255,0.95)', borderRadius: '50%', position: 'relative', zIndex: 1 }} />
        )}
      </div>

      <p role="note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, padding: '8px 10px', borderRadius: 10, background: TEAL_TINT, color: SOFT, font: '600 12px/1.4 Nunito, system-ui, sans-serif' }}>
        <span aria-hidden="true">🔒</span>
        <span>Practice only. This photo stays on your screen. It is never uploaded or saved.</span>
      </p>

      {mode === 'blocked' && (
        <p style={{ margin: 0, color: SOFT, font: '600 13px/1.4 Nunito, system-ui, sans-serif' }}>
          The camera is not available. You can pick a photo instead, or skip the selfie.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {mode === 'idle' && <button type="button" style={{ ...btn(true), flex: 1 }} onClick={turnOn}>Turn on camera</button>}
        {mode === 'live' && <button type="button" style={{ ...btn(true), flex: 1 }} onClick={take}>Take practice shot</button>}
        {mode === 'shot' && (<>
          <button type="button" style={{ ...btn(true), flex: 1 }} onClick={onDone}>Looks good</button>
          <button type="button" style={btn(false)} onClick={retake}>Retake</button>
        </>)}
        {mode === 'blocked' && (
          <label style={{ ...btn(true), flex: 1, display: 'grid', placeItems: 'center' }}>
            Choose a photo
            <input type="file" accept="image/*" capture="user" onChange={fromFile} style={{ display: 'none' }} />
          </label>
        )}
        {mode !== 'shot' && <button type="button" style={btn(false)} onClick={onSkip}>Skip the selfie</button>}
      </div>
    </div>
  )
}

export default function PetGuide() {
  const { pathname } = useLocation()
  const { profile, selectedPet, petLevel } = useGame()
  const comp = useCompanion()
  const [i, setI] = useState(0)
  const steps = GUIDE_STEPS(selectedPet?.name)
  const step = steps[i]
  const open = comp.guideOpen && pathname === '/dashboard' && !!selectedPet
  const primaryRef = useRef(null)
  const [side, setSide] = useState('center')   // which side the panel sits, so it never covers what is being explained

  // Reopening (Replay) always starts from the top.
  useEffect(() => { if (!comp.guideOpen) setI(0) }, [comp.guideOpen])

  // The pet follows the guide: it walks to the thing being explained, and goes home for the selfie and the end.
  useEffect(() => {
    if (!open) return
    if (step.spot) {
      comp.guideTo(step.spot, step.say)
      const r = document.querySelector(`[data-pet-spot="${step.spot}"]`)?.getBoundingClientRect()
      setSide(window.innerWidth < 900 || !r ? 'center' : (r.left + r.width / 2 < window.innerWidth / 2 ? 'right' : 'left'))
    } else {
      setSide('center')
      if (i > 0) comp.guideHome()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])

  useEffect(() => { if (open) primaryRef.current?.focus({ preventScroll: true }) }, [open, i])

  if (!open) return null

  const finish = () => {
    try { markGuideDone(window.localStorage, profile?.id) } catch { /* ignore */ }
    comp.guideHome()
    comp.closeGuide()
  }
  const next = () => setI(n => Math.min(n + 1, steps.length - 1))

  return (
    <section role="region" aria-label="Quick tour"
      style={{
        position: 'fixed', zIndex: 60,
        ...(side === 'center' ? { left: '50%', transform: 'translateX(-50%)' }
          : side === 'right' ? { right: 'max(16px, env(safe-area-inset-right, 0px))' }
          : { left: 'max(16px, env(safe-area-inset-left, 0px))' }),
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))', width: 'min(440px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
        background: '#FFFFFF', color: INK, border: `1px solid ${LINE}`, borderRadius: 20, padding: 16,
        boxShadow: '0 18px 44px rgba(16,42,67,0.22)', fontFamily: 'Nunito, system-ui, sans-serif',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div aria-label={`Step ${i + 1} of ${steps.length}`} style={{ display: 'flex', gap: 6 }}>
          {steps.map((s, k) => <i key={s.id} style={{ display: 'block', height: 7, width: k === i ? 20 : 7, borderRadius: 6, background: k === i ? TEAL : '#CBD5D0' }} />)}
        </div>
        <button type="button" onClick={finish} style={{ background: 'none', border: 0, color: MUTED, font: '700 13px Nunito, system-ui, sans-serif', cursor: 'pointer', minHeight: 44, padding: '0 6px' }}>Skip for now</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {step.id !== 'selfie' && (
          <div style={{ width: 72, height: 72, flex: 'none', background: MIST, borderRadius: 16, display: 'grid', placeItems: 'center' }}>
            <PetSprite petId={selectedPet.id} level={petLevel} size={60} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, font: '800 19px/1.25 Nunito, system-ui, sans-serif' }}>{step.title}</h2>
          <p style={{ margin: '4px 0 0', color: SOFT, font: '600 14px/1.45 Nunito, system-ui, sans-serif' }}>{step.body}</p>
        </div>
      </div>

      {step.id === 'selfie'
        ? <SelfiePractice onDone={next} onSkip={next} />
        : <button ref={primaryRef} type="button" style={btn(true)} onClick={step.id === 'done' ? finish : next}>{step.primary}</button>}
    </section>
  )
}
