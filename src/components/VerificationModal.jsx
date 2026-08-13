import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, X, RotateCcw, Check, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'

/*
 * Evidence capture for a quest completion: a LIVE camera photo (no gallery
 * uploads) + a progress log (20+ chars) + the elapsed timer. On submit it
 * uploads the photo to the private quest-proofs bucket, calls submit_completion
 * (provisional award), then POSTs the AI proxy at /api/verify. A FAIL is
 * reversed server-side; the modal offers one retry.
 */
const MIN_LOG = 20

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function VerificationModal({ task, onClose, onVerified }) {
  const { submitCompletion, refreshProfile, addNotification, profile } = useGame()
  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  const [phase, setPhase]     = useState('camera')  // camera | preview | submitting | result
  const [blob, setBlob]       = useState(null)
  const [previewUrl, setPrev] = useState(null)
  const [log, setLog]         = useState('')
  const [camError, setCamErr] = useState('')
  const [result, setResult]   = useState(null)      // { verdict, reason }
  const [retries, setRetries] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  /* Live elapsed timer from when the quest was started. */
  useEffect(() => {
    const start = new Date(task.started_at || task.created_at).getTime()
    setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))), 1000)
    return () => clearInterval(id)
  }, [task])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  /* Open the camera whenever we (re)enter the camera phase. */
  useEffect(() => {
    if (phase !== 'camera') return
    let active = true
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
        setCamErr('Camera unavailable or permission denied. A live photo is required to submit proof.')
      }
    })()
    return () => { active = false }
  }, [phase])

  /* Stop the camera + free the preview URL on unmount. */
  useEffect(() => () => { stopCamera(); if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const close = () => { stopCamera(); onClose?.() }

  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob(b => {
      if (!b) return
      stopCamera()
      setBlob(b)
      setPrev(URL.createObjectURL(b))
      setPhase('preview')
    }, 'image/jpeg', 0.85)
  }

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setBlob(null); setPrev(null); setPhase('camera')
  }

  const submit = async () => {
    if (!blob) return
    if (log.trim().length < MIN_LOG) { addNotification(`Progress log needs at least ${MIN_LOG} characters.`, 'error'); return }
    if (!navigator.onLine) { addNotification('You need a connection to submit proof.', 'error'); return }

    setPhase('submitting')
    const path = `${profile.id}/${task.id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage
      .from('quest-proofs').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (upErr) { addNotification('Photo upload failed. Try again.', 'error'); setPhase('preview'); return }

    const res = await submitCompletion(task.id, {
      photoPath: path, log: log.trim(),
      timeStarted: task.started_at || task.created_at,
    })
    if (!res.ok) { setPhase('preview'); return }  // context already notified (too_soon/locked/…)

    onVerified?.()  // let the card play its provisional-award success animation

    // AI verdict (server reverses on fail). Any transport failure → manual review.
    let verdict = 'error', reason = 'Queued for manual review.'
    try {
      const r = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: res.completionId }),
      })
      if (r.ok) { const d = await r.json(); verdict = d.verdict || 'error'; reason = d.reason || reason }
    } catch { /* keep manual-review fallback */ }

    if (verdict === 'fail') {
      await refreshProfile()  // resync reverted points + re-opened quest
      addNotification(`⚠️ Proof rejected. ${reason} You can retry once with new evidence.`, 'error')
    } else if (verdict === 'pass') {
      addNotification('✅ Proof accepted! You earned points (pending final review).', 'success')
    } else {
      addNotification('Submitted — queued for manual review.', 'info')
    }
    setResult({ verdict, reason })
    setPhase('result')
  }

  const canRetry = result?.verdict === 'fail' && retries < 1
  const doRetry = () => { setRetries(r => r + 1); setResult(null); setLog(''); retake() }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,4,16,0.75)' }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-card w-full max-w-md p-5 relative"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-cinzel font-bold text-base" style={{ color: '#ffd166' }}>Verify your quest</h3>
          <button onClick={close} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm font-nunito mb-3" style={{ color: '#c0c0e0' }}>{task.text}</p>

        <div className="flex items-center gap-1.5 text-xs font-nunito mb-4" style={{ color: 'var(--text-muted)' }}>
          <Clock size={13} /> Time on quest: <span className="tabular-nums font-bold" style={{ color: '#c0c0e0' }}>{fmt(elapsed)}</span>
        </div>

        <AnimatePresence mode="wait">
          {/* CAMERA */}
          {phase === 'camera' && (
            <motion.div key="cam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {camError ? (
                <div className="text-sm font-nunito p-3 rounded-lg mb-3"
                  style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.3)' }}>
                  ⚠️ {camError}
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden mb-3" style={{ background: '#000', aspectRatio: '4/3' }}>
                  <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                </div>
              )}
              <button onClick={capture} disabled={!!camError}
                className="btn-gold w-full py-3 flex items-center justify-center gap-2"
                style={{ opacity: camError ? 0.4 : 1 }}>
                <Camera size={18} /> Take live photo
              </button>
            </motion.div>
          )}

          {/* PREVIEW + LOG */}
          {phase === 'preview' && (
            <motion.div key="prev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="rounded-xl overflow-hidden mb-3" style={{ aspectRatio: '4/3' }}>
                <img src={previewUrl} alt="Proof" className="w-full h-full object-cover" />
              </div>
              <button onClick={retake} className="btn-ghost w-full py-2 mb-3 flex items-center justify-center gap-2 text-sm">
                <RotateCcw size={15} /> Retake
              </button>
              <label className="block text-xs font-nunito font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Progress log
              </label>
              <textarea
                value={log} onChange={e => setLog(e.target.value)} rows={3} maxLength={500}
                placeholder="Describe what you did to complete this quest…"
                className="input-field w-full text-sm" style={{ resize: 'none' }}
              />
              <div className="flex justify-end text-xs font-nunito mt-1 mb-3"
                style={{ color: log.trim().length >= MIN_LOG ? '#4ade80' : 'var(--text-muted)' }}>
                {log.trim().length}/{MIN_LOG} min
              </div>
              <button onClick={submit} disabled={log.trim().length < MIN_LOG}
                className="btn-gold w-full py-3" style={{ opacity: log.trim().length < MIN_LOG ? 0.4 : 1 }}>
                Submit proof
              </button>
            </motion.div>
          )}

          {/* SUBMITTING */}
          {phase === 'submitting' && (
            <motion.div key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-10 flex flex-col items-center gap-3">
              <motion.span className="spinner-ring" style={{ width: 32, height: 32, borderTopColor: '#f5a31a' }}
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              <p className="text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>Verifying your proof…</p>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === 'result' && result && (
            <motion.div key="res" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="py-6 flex flex-col items-center gap-3 text-center">
              {result.verdict === 'pass' ? (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(34,197,94,0.15)' }}><Check size={28} style={{ color: '#4ade80' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#4ade80' }}>Verified!</p>
                </>
              ) : result.verdict === 'fail' ? (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(244,63,94,0.15)' }}><AlertTriangle size={26} style={{ color: '#fb7185' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#fb7185' }}>Proof rejected</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(6,182,212,0.15)' }}><Clock size={26} style={{ color: '#22d3ee' }} /></div>
                  <p className="font-cinzel font-bold text-lg" style={{ color: '#22d3ee' }}>Pending review</p>
                </>
              )}
              <p className="text-sm font-nunito max-w-xs" style={{ color: 'var(--text-soft)' }}>{result.reason}</p>
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
