import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useCompanion } from '../context/CompanionContext'
import useReducedMotion from '../hooks/useReducedMotion'
import SelfiePractice from './SelfiePractice'
import { spriteFor } from '../config/pets'
import { GUIDE_STEPS, markGuideDone, accentFor } from '../data/petCompanion'

/*
 * First-login tour, written like a visual novel. A big version of the student's pet
 * talks from the edge of the screen in a dialogue bar. The small pet (RoamingPet)
 * runs to the thing being explained, and the rest of the screen dims so only that
 * part is lit. The lit area stays clickable (so the student can really try the quest
 * form); everything around it is blocked, so nobody gets lost.
 *
 * Nothing here changes game data. The selfie step is practice only (SelfiePractice).
 */

const PAD = 12                                   // light around the lit-up area
const guideArt = (petId, level) => spriteFor(petId, level).replace('/pets/', '/guide/').replace('.png', '.webp')

export default function PetGuide() {
  const { pathname } = useLocation()
  const { profile, selectedPet, petLevel } = useGame()
  const comp = useCompanion()
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [typed, setTyped] = useState('')
  const [typedDone, setTypedDone] = useState(false)
  const [rect, setRect] = useState(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const timer = useRef(null)
  const nextRef = useRef(null)

  const steps = GUIDE_STEPS(selectedPet?.name)
  const step = steps[i]
  const open = comp.guideOpen && pathname === '/dashboard' && !!selectedPet
  const accent = accentFor(selectedPet?.id)

  // Reopening (Replay) always starts from the top.
  useEffect(() => { if (!comp.guideOpen) setI(0) }, [comp.guideOpen])

  // The small pet follows the script: it runs to the thing being explained, and goes home when there is none.
  useEffect(() => {
    if (!open) return
    if (step.spot) {
      comp.guideTo(step.spot, '')
      const el = document.querySelector(`[data-pet-spot="${step.spot}"]`)
      if (el) { el.style.scrollMarginTop = '120px'; el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }) }
    } else if (i > 0) comp.guideHome()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])

  // The big pet's line types out; a click shows it all.
  useEffect(() => {
    if (!open) return
    const text = steps[i].line
    clearInterval(timer.current)
    if (reduce) { setTyped(text); setTypedDone(true); return }
    let n = 0
    setTyped(''); setTypedDone(false)
    timer.current = setInterval(() => {
      n += 2
      setTyped(text.slice(0, n))
      if (n >= text.length) { clearInterval(timer.current); setTypedDone(true) }
    }, 22)
    return () => clearInterval(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, reduce])

  // Follow the lit-up element every frame, so scrolling or a layout change never leaves the light behind.
  useEffect(() => {
    if (!open || !step.spot) { setRect(null); return }
    let raf
    const tick = () => {
      const el = document.querySelector(`[data-pet-spot="${step.spot}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(prev => (prev && Math.abs(prev.x - r.left) < 0.5 && Math.abs(prev.y - r.top) < 0.5 && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5)
          ? prev : { x: r.left, y: r.top, w: r.width, h: r.height })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => { if (open && step.primary) nextRef.current?.focus({ preventScroll: true }) }, [open, i, typedDone])

  const finish = () => {
    try { markGuideDone(window.localStorage, profile?.id) } catch { /* ignore */ }
    comp.guideHome()
    comp.closeGuide()
  }
  const next = () => {
    if (!typedDone) { clearInterval(timer.current); setTyped(step.line); setTypedDone(true); return }
    if (step.id === 'done') finish()
    else setI(n => Math.min(n + 1, steps.length - 1))
  }

  // Enter, Space or the right arrow advance; Escape leaves the tour. Typing in the lit-up form is left alone.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { finish(); return }
      if (step.id === 'selfie') return
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowRight') return
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target?.tagName || '')) return
      e.preventDefault(); next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, typedDone])

  if (!open) return null

  const side = rect && rect.x + rect.w / 2 < vp.w / 2 ? 'right' : 'left'   // the big pet stands opposite what is lit
  const art = guideArt(selectedPet.id, petLevel)
  const blk = (x, y, w, h, k) => <div key={k} style={{ position: 'absolute', left: x, top: y, width: Math.max(0, w), height: Math.max(0, h), pointerEvents: 'auto' }} />

  return (
    <div className="vn-root" style={{ '--vn-acc': accent }}>
      {rect ? (
        <>
          {blk(0, 0, vp.w, rect.y - PAD, 't')}
          {blk(0, rect.y - PAD, rect.x - PAD, rect.h + PAD * 2, 'l')}
          {blk(rect.x + rect.w + PAD, rect.y - PAD, vp.w - (rect.x + rect.w + PAD), rect.h + PAD * 2, 'r')}
          {blk(0, rect.y + rect.h + PAD, vp.w, vp.h - (rect.y + rect.h + PAD), 'b')}
          <div className="vn-hole" style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }} />
          {step.hint && (
            <span className="vn-hint" style={{ left: Math.min(vp.w - 160, Math.max(12, rect.x + rect.w / 2 - 70)), top: rect.y + rect.h + PAD + 14 }}>
              {step.hint} ↑
            </span>
          )}
        </>
      ) : <div className="vn-dim" />}

      <img className={`vn-big vn-big-${side}`} src={art} alt={`${selectedPet.name}, your pet`} draggable="false" />

      {step.id === 'selfie' && (
        <div className="vn-modal" role="dialog" aria-label="Practice proof photo">
          <h2>Practice proof</h2>
          <SelfiePractice onDone={next} onSkip={next} />
        </div>
      )}

      <section className="vn-dlg" role="region" aria-label="Quick tour">
        <span className="vn-who">{selectedPet.name}</span>
        <img className="vn-avatar" src={art} alt="" draggable="false" />
        <p className="vn-txt" aria-hidden="true">{typed}</p>
        <p className="vn-sr" role="status">{step.line}</p>
        <div className="vn-ft">
          <div className="vn-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((s, k) => <i key={s.id} className={k === i ? 'on' : ''} />)}
          </div>
          <div className="vn-btns">
            {step.primary && <button ref={nextRef} type="button" className="vn-next" onClick={next}>{step.primary === 'Next' ? 'Next ▸' : step.primary}</button>}
            <button type="button" className="vn-skip" onClick={finish}>Skip tour</button>
          </div>
        </div>
      </section>
    </div>
  )
}
