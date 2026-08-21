import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, X, RotateCcw, Check, AlertTriangle, Clock, Upload, Sparkles, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'

/* Gilded Waypoints — verification progress. Three golden nodes
   (Uploading → AI Analyzing → Verdict) + a gold shimmer bar. `stage` and `pct`
   are driven by REAL events, never a fake timer (see submit()). */
const WP_STAGES = [
  { label: 'Uploading',    Icon: Upload,   flavors: ['Uploading your evidence to the Hall of Quests…', 'Sealing your scroll for the Oracle…'] },
  { label: 'AI Analyzing', Icon: Sparkles, flavors: ['The Oracle peers closely at your proof…', 'Runes flicker as the Oracle studies your deed…'] },
  { label: 'Verdict',      Icon: Scale,    flavors: ['Weighing your words against the Oracle’s wisdom…', 'The verdict draws near…'] },
]

function GildedWaypoints({ stage, pct, failed }) {
  const [fi, setFi] = useState(0)
  useEffect(() => { setFi(0); const id = setInterval(() => setFi(i => i + 1), 2600); return () => clearInterval(id) }, [stage])
  const flavors = WP_STAGES[Math.min(stage, 2)]?.flavors || ['…']
  const accent = failed ? '#fb7185' : '#e8b94b'

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-4">
        {WP_STAGES.map((s, i) => {
          const done = i < stage, active = i === stage
          return (
            <div key={s.label} className="flex items-center" style={{ flex: i < 2 ? 1 : 'none' }}>
              <div className="flex flex-col items-center gap-1.5" style={{ width: 56 }}>
                <motion.div
                  animate={active && !failed ? { boxShadow: ['0 0 0px rgba(232,185,75,0.4)', '0 0 14px rgba(232,185,75,0.9)', '0 0 0px rgba(232,185,75,0.4)'], scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    background: done ? 'linear-gradient(135deg,#8a6d1f,#e8b94b)' : active ? 'rgba(232,185,75,0.14)' : 'rgba(18,20,38,0.9)',
                    border: `1px solid ${i <= stage ? 'rgba(232,185,75,0.7)' : 'rgba(80,80,120,0.4)'}`,
                  }}>
                  {done ? <Check size={18} style={{ color: '#0c0d16' }} />
                    : <s.Icon size={16} style={{ color: active ? '#f5d980' : '#5b5b80' }} />}
                </motion.div>
                <span className="text-[10px] font-nunito text-center leading-tight" style={{ color: i <= stage ? accent : 'var(--text-muted)' }}>{s.label}</span>
              </div>
              {i < 2 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: done ? 'linear-gradient(90deg,#e8b94b,#8a6d1f)' : 'rgba(80,80,120,0.35)' }} />}
            </div>
          )
        })}
      </div>

      <div className="rounded-full overflow-hidden relative" style={{ height: 8, background: 'rgba(18,20,38,0.9)', border: `1px solid ${failed ? 'rgba(244,63,94,0.3)' : 'rgba(232,185,75,0.25)'}` }}>
        <div className="h-full gilded-bar" style={{
          width: `${pct}%`, transition: 'width 0.25s linear',
          background: failed ? 'linear-gradient(90deg,#7f1d2e,#f43f5e,#fb7185)' : 'linear-gradient(90deg,#8a6d1f,#e8b94b,#f5d980)',
        }} />
      </div>
      <p className="text-xs font-nunito text-center mt-3" style={{ color: '#e8d9a8' }}>
        {flavors[fi % flavors.length]} <span style={{ color: accent, fontWeight: 700 }}>{Math.round(pct)}%</span>
      </p>
    </div>
  )
}

/*
 * Evidence capture for a quest completion: a LIVE camera photo (preferred) or,
 * if the camera can't start, a file upload flagged as non-live. Plus a progress
 * log (20+ chars). On submit the quest enters a "verifying" state — points are
 * NOT shown as earned until the AI verdict returns PASS.
 */
const MIN_LOG = 20
const MIN_BLOB_BYTES = 3000

/* Reject an all-black / uniform frame (broken camera, placeholder). */
function frameLooksBlank(canvas) {
  try {
    const { width, height } = canvas
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
    const lum = []
    let sum = 0
    for (let i = 0; i < data.length; i += 4 * 40) {   // sample ~every 40th pixel
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      lum.push(l); sum += l
    }
    if (!lum.length) return true
    const mean = sum / lum.length
    const near = lum.filter(l => Math.abs(l - mean) < 12).length
    return near / lum.length > 0.90   // >90% of pixels ≈ identical → uniform/blank (covered lens, black frame)
  } catch { return false }
}

function ago(ms) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const fmtAbs = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function VerificationModal({ task, onClose, onVerified }) {
  const { submitCompletion, finalizeVerification, cancelVerification, addNotification, profile } = useGame()
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const fileRef   = useRef(null)
  const alive     = useRef(true)
  const vStartRef = useRef(Date.now())   // when verification was started (this modal opened)

  const [phase, setPhase]     = useState('camera')  // camera | preview | submitting | result
  const [streaming, setStream]= useState(false)
  const [blob, setBlob]       = useState(null)
  const [source, setSource]   = useState('camera')  // 'camera' | 'upload'
  const [previewUrl, setPrev] = useState(null)
  const [log, setLog]         = useState('')
  const [camError, setCamErr] = useState('')
  const [result, setResult]   = useState(null)
  const [retries, setRetries] = useState(0)
  const [prog, setProg]       = useState({ stage: 0, pct: 0, failed: false })  // Gilded Waypoints — driven by real events

  useEffect(() => () => { alive.current = false }, [])

  /* Ease the bar toward the current stage's cap so it moves smoothly BETWEEN
     real events without ever claiming more progress than has actually happened.
     Real events (upload done, verdict in) bump `stage`, which raises the cap. */
  useEffect(() => {
    if (phase !== 'submitting') return
    const caps = [32, 90, 100]   // uploading · analyzing · verdict
    const id = setInterval(() => {
      setProg(p => {
        const cap = caps[Math.min(p.stage, 2)]
        if (p.pct >= cap) return p
        return { ...p, pct: Math.min(cap, p.pct + Math.max(0.4, (cap - p.pct) * 0.05)) }
      })
    }, 110)
    return () => clearInterval(id)
  }, [phase])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  /* Open the camera whenever we (re)enter the camera phase. */
  useEffect(() => {
    if (phase !== 'camera') return
    let active = true
    setStream(false)
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, audio: false,
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCamErr('')
      } catch {
        // Phase 1: no dead end — fall back to a (flagged) file upload.
        setCamErr('Camera unavailable or blocked. You can upload a photo instead — it will be marked as a non-live upload for review.')
      }
    })()
    return () => { active = false }
  }, [phase])

  useEffect(() => () => { stopCamera(); if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const close = () => { stopCamera(); onClose?.() }

  const usePhoto = (b, src) => {
    stopCamera()
    setBlob(b); setSource(src); setPrev(URL.createObjectURL(b)); setPhase('preview')
  }

  /* Live capture — gated on a real streaming frame (Phase 2/6). */
  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    if (frameLooksBlank(canvas)) {
      addNotification('No image detected — make sure your camera feed is live.', 'error')
      return
    }
    canvas.toBlob(b => { if (b) usePhoto(b, 'camera') }, 'image/jpeg', 0.85)
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { addNotification('Please choose an image file.', 'error'); return }
    // Blank/blank-ish uploads are rejected before preview (the live-camera path
    // is already gated in capture()), so no blank proof can reach Submit.
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      const blank = frameLooksBlank(c)
      URL.revokeObjectURL(img.src)
      if (blank) { addNotification('Photo appears blank — please choose an image with visible evidence.', 'error'); return }
      usePhoto(f, 'upload')
    }
    img.onerror = () => { URL.revokeObjectURL(img.src); addNotification('Could not read that image.', 'error') }
    img.src = URL.createObjectURL(f)
  }

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null); setPrev(null); setSource('camera'); setPhase('camera')
  }

  const submit = async () => {
    if (!blob) return
    if (log.trim().length < MIN_LOG) { addNotification(`Progress log needs at least ${MIN_LOG} characters.`, 'error'); return }
    if (blob.size < MIN_BLOB_BYTES) { addNotification('That photo looks empty — please retake with a live feed.', 'error'); return }
    if (!navigator.onLine) { addNotification('You need a connection to submit proof.', 'error'); return }

    setProg({ stage: 0, pct: 4, failed: false })   // Waypoint 1: Uploading
    setPhase('submitting')
    const ext = source === 'upload' ? (blob.type.split('/')[1] || 'jpg') : 'jpg'
    const path = `${profile.id}/${task.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('quest-proofs').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
    if (upErr) { if (alive.current) { addNotification('Photo upload failed. Try again.', 'error'); setPhase('preview') } return }

    const res = await submitCompletion(task.id, {
      photoPath: path, log: log.trim(),
      timeStarted: task.started_at || task.created_at,
      verificationStartedAt: new Date(vStartRef.current).toISOString(),
      source,
    })
    if (!res.ok) { if (alive.current) setPhase('preview'); return }

    setProg(p => ({ ...p, stage: 1, pct: Math.max(p.pct, 34) }))   // Waypoint 2: AI Analyzing (photo stored, verdict requested)

    /* CRITICAL: from here on we do NOT bail on `alive`. The AI verdict + the
       finalize/rollback are server-and-context work that must complete even if
       the user closed the modal — otherwise the row is orphaned at ai_verdict
       'pending' (that was the QA bug). Only the modal's own setState is guarded. */
    let verdict = 'error', reason = 'Queued for manual review.'
    try {
      const r = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: res.completionId }),
      })
      if (r.ok) { const d = await r.json(); verdict = d.verdict || 'error'; reason = d.reason || reason }
    } catch { /* keep manual-review fallback */ }

    setProg({ stage: 2, pct: 100, failed: verdict === 'fail' })   // Waypoint 3: Verdict in

    if (verdict === 'fail') {
      await cancelVerification(task.id)   // server already reverted; resync
      addNotification(`⚠️ Proof rejected: ${reason}`, 'error')
    } else {
      finalizeVerification(task.id, res.data)   // pass OR error → provisional award stands
      if (verdict === 'pass') { onVerified?.(); addNotification('✅ +' + res.data.awarded + ' Quest Points earned!', 'success') }
      else addNotification('Submitted — queued for manual review.', 'info')
    }

    if (alive.current) { setResult({ verdict, reason }); setPhase('result') }
  }

  const canRetry = result?.verdict === 'fail' && retries < 1
  const doRetry = () => { setRetries(r => r + 1); setResult(null); setLog(''); retake() }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(4,4,16,0.75)' }}>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-card w-full max-w-md p-5 relative">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-cinzel font-bold text-base" style={{ color: '#ffd166' }}>Verify your quest</h3>
          {/* Always closable, in every phase. */}
          <button onClick={close} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close"><X size={18} /></button>
        </div>

        <p className="text-sm font-nunito mb-1" style={{ color: '#c0c0e0' }}>{task.text}</p>
        {task.goal && (
          <p className="text-xs font-nunito mb-2 flex items-start gap-1" style={{ color: '#8a9bb8' }}>
            <span>🎯</span><span>Goal: {task.goal}</span>
          </p>
        )}

        {/* Phase 5: clear, non-inflated timing. */}
        <div className="text-xs font-nunito mb-4 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
          <div>Quest created: <span style={{ color: '#c0c0e0' }}>{fmtAbs(new Date(task.created_at).getTime())}</span> · {ago(new Date(task.created_at).getTime())}</div>
          <div className="flex items-center gap-1.5"><Clock size={12} /> Verification started just now</div>
        </div>

        <AnimatePresence mode="wait">
          {/* CAMERA / UPLOAD */}
          {phase === 'camera' && (
            <motion.div key="cam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {camError ? (
                <>
                  <div className="text-sm font-nunito p-3 rounded-lg mb-3"
                    style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.3)' }}>
                    ⚠️ {camError}
                  </div>
                  <button onClick={() => fileRef.current?.click()} className="btn-gold w-full py-3 flex items-center justify-center gap-2">
                    <Upload size={18} /> Choose a photo
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl overflow-hidden mb-3 relative" style={{ background: '#0c0d16', aspectRatio: '4/3' }}>
                    <video ref={videoRef} playsInline muted onLoadedData={() => setStream(true)}
                      className="w-full h-full object-cover" />
                    {!streaming && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs font-nunito" style={{ color: '#8080aa' }}>
                        <motion.span className="spinner-ring" style={{ width: 24, height: 24, borderTopColor: '#f5a31a' }}
                          animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                        Camera loading…
                      </div>
                    )}
                  </div>
                  {/* Button stays visible (disabled) during warm-up so the modal is never a blank box. */}
                  <button onClick={capture} disabled={!streaming}
                    className="btn-gold w-full py-3 flex items-center justify-center gap-2" style={{ opacity: streaming ? 1 : 0.4 }}>
                    <Camera size={18} /> {streaming ? 'Take live photo' : 'Camera loading…'}
                  </button>
                  {/* Upload fallback always available — usable even while the camera warms up. */}
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full py-2 mt-2 flex items-center justify-center gap-2 text-xs font-nunito" style={{ color: 'var(--text-muted)' }}>
                    <Upload size={14} /> or upload a photo instead
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            </motion.div>
          )}

          {/* PREVIEW + LOG */}
          {phase === 'preview' && (
            <motion.div key="prev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="rounded-xl overflow-hidden mb-2" style={{ aspectRatio: '4/3' }}>
                <img src={previewUrl} alt="Proof" className="w-full h-full object-cover" />
              </div>
              {source === 'upload' && (
                <p className="text-xs font-nunito mb-2 flex items-center gap-1" style={{ color: '#f5a31a' }}>
                  <Upload size={12} /> Uploaded photo (not a live capture) — flagged for review.
                </p>
              )}
              <button onClick={retake} className="btn-ghost w-full py-2 mb-3 flex items-center justify-center gap-2 text-sm">
                <RotateCcw size={15} /> {source === 'upload' ? 'Choose again' : 'Retake'}
              </button>
              <label className="block text-xs font-nunito font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Progress log</label>
              <textarea value={log} onChange={e => setLog(e.target.value)} rows={3} maxLength={500}
                placeholder="Describe what you did to complete this quest…" className="input-field w-full text-sm" style={{ resize: 'none' }} />
              <div className="flex justify-end text-xs font-nunito mt-1 mb-3"
                style={{ color: log.trim().length >= MIN_LOG ? '#4ade80' : 'var(--text-muted)' }}>
                {log.trim().length}/{MIN_LOG} characters
              </div>
              <button onClick={submit} disabled={log.trim().length < MIN_LOG}
                className="btn-gold w-full py-3" style={{ opacity: log.trim().length < MIN_LOG ? 0.4 : 1 }}>Submit proof</button>
            </motion.div>
          )}

          {/* SUBMITTING — keep the evidence on screen; the Waypoints are the focus */}
          {phase === 'submitting' && (
            <motion.div key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-1">
              <div className="flex gap-3 mb-4">
                {previewUrl && (
                  <img src={previewUrl} alt="Your proof" className="rounded-lg object-cover flex-shrink-0"
                    style={{ width: 72, height: 72, border: '1px solid rgba(232,185,75,0.25)' }} />
                )}
                <p className="text-xs font-nunito flex-1 overflow-y-auto" style={{ color: '#c0c0e0', maxHeight: 72 }}>{log}</p>
              </div>
              <GildedWaypoints stage={prog.stage} pct={prog.pct} failed={prog.failed} />
              <p className="text-[11px] font-nunito text-center mt-1" style={{ color: '#5b5b80' }}>Points are pending the Oracle’s verdict</p>
            </motion.div>
          )}

          {/* RESULT — keeps the proof pinned so the verdict reads as a transformation */}
          {phase === 'result' && result && (
            <motion.div key="res" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="py-4 flex flex-col items-center gap-3 text-center">
              {previewUrl && (
                <img src={previewUrl} alt="Your proof" className="rounded-lg object-cover"
                  style={{ width: 88, height: 88, border: '1px solid rgba(232,185,75,0.25)' }} />
              )}
              {result.verdict === 'pass' ? (
                <><div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}><Check size={28} style={{ color: '#4ade80' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#4ade80' }}>Verified!</p></>
              ) : result.verdict === 'fail' ? (
                <><div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.15)' }}><AlertTriangle size={26} style={{ color: '#fb7185' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#fb7185' }}>Proof rejected</p></>
              ) : (
                <><div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)' }}><Clock size={26} style={{ color: '#22d3ee' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#22d3ee' }}>Pending review</p></>
              )}
              <p className="text-sm font-nunito max-w-xs" style={{ color: 'var(--text-soft)' }}>
                {result.verdict === 'fail'
                  ? `Your proof was rejected: ${result.reason}${canRetry ? ' You have 1 retry — take a new photo and describe what you did.' : ' No retries left.'}`
                  : result.reason}
              </p>
              <div className="flex gap-2 w-full mt-2">
                {canRetry && <button onClick={doRetry} className="btn-ghost flex-1 py-2 text-sm">Retry once</button>}
                <button onClick={close} className="btn-gold flex-1 py-2">Done</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body,
  )
}
