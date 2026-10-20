import { useEffect, useRef, useState } from 'react'

/*
 * The practice camera in the first-login tour.
 *
 * PRIVACY: practice only. The photo lives in this component's memory, is drawn to a
 * canvas on this device and is thrown away when the step ends. It is never uploaded,
 * saved or logged, and nothing in this file talks to the network or to Supabase
 * (tests/pet-companion.test.mjs checks that). The study collects no personal
 * identifiers, so this must stay true.
 */

const INK = '#102A43', SOFT = '#3E5165', TEAL = '#3F8580', TEAL_DEEP = '#2F6F6B', TEAL_TINT = '#E4EFEE'
const font = 'Nunito, system-ui, sans-serif'
const btn = (primary) => ({
  minHeight: 48, borderRadius: 12, padding: '0 20px', cursor: 'pointer', font: `800 1rem ${font}`,
  background: primary ? TEAL : '#FFFFFF', color: primary ? '#FFFFFF' : TEAL_DEEP,
  border: primary ? '0' : '1px solid #CBD5D0',
})

/* onDone() when the student is happy with the shot; onSkip() when they skip the selfie. */
export default function SelfiePractice({ onDone, onSkip }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(160deg,#cfd9d6,#a9bcb8)', aspectRatio: '16 / 9', display: 'grid', placeItems: 'center' }}>
        {mode === 'live' && <video ref={videoRef} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
        {mode === 'shot' && shot && <img src={shot} alt="Your practice shot" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {mode !== 'shot' && (
          <div aria-hidden="true" style={{ height: '78%', aspectRatio: '3 / 4', border: '4px dashed rgba(255,255,255,0.95)', borderRadius: '50%', position: 'relative', zIndex: 1 }} />
        )}
      </div>

      <p role="note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, padding: '10px 12px', borderRadius: 10, background: TEAL_TINT, color: SOFT, font: `700 0.9rem/1.4 ${font}` }}>
        <span aria-hidden="true">🔒</span>
        <span>Practice only. This photo stays on your screen. It is never uploaded or saved.</span>
      </p>

      {mode === 'blocked' && (
        <p style={{ margin: 0, color: INK, font: `700 0.95rem/1.4 ${font}` }}>
          The camera is not available. You can pick a photo instead, or skip the selfie.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
