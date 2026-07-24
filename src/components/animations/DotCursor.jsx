import { useEffect, useRef, useState } from 'react'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * A single gold dot in place of the system cursor. Nothing else — no trail, no
 * brackets, no spin, no snapping.
 *
 * This started as React Bits' TargetCursor, but once the corners, the idle
 * rotation and the target-snapping came out, the whole GSAP dependency existed
 * to move one dot. So it doesn't use GSAP: the position is written straight to
 * the element's transform inside the mousemove handler. mousemove already fires
 * at the display's rate, so there is nothing to interpolate and nothing to
 * schedule — the dot lands exactly where the pointer is, on the same frame.
 * That is the whole point, having already tried two cursors that lagged.
 *
 * Writing through a ref rather than state keeps React out of the pointer path
 * entirely; a re-render per mousemove would reintroduce the lag by itself.
 */
export default function DotCursor({ color = '#f5a31a', size = 7 }) {
  const dotRef = useRef(null)
  const reduceMotion = useReducedMotion()

  /* Fine pointers only — a dot chasing taps is pointless, and hiding the
     system cursor on a touch device would strand anyone using a stylus. */
  const [finePointer, setFinePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: fine)')
    if (!mq) return
    const onChange = e => setFinePointer(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const active = finePointer && !reduceMotion

  useEffect(() => {
    if (!active) return

    /* Hidden via a class, not an inline style on body: `.btn-gold`,
       `.acc-card`, `.custom-check` and the UA's I-beam on inputs all set their
       own `cursor`, so a body-level rule alone would let the system cursor
       reappear over every interactive element. Removed on unmount, so the real
       cursor always comes back. */
    document.body.classList.add('has-dot-cursor')

    /* Start off-screen so the dot never flashes at 0,0 before the first move. */
    let visible = false

    const onMove = e => {
      const el = dotRef.current
      if (!el) return
      if (!visible) {
        el.style.opacity = '1'
        visible = true
      }
      el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`
    }

    /* Leaving the window should take the dot with it, or it sits frozen at the
       edge while the pointer is off in another application. */
    const onLeave = () => {
      if (dotRef.current) dotRef.current.style.opacity = '0'
      visible = false
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      document.body.classList.remove('has-dot-cursor')
    }
  }, [active])

  if (!active) return null

  return (
    <div
      ref={dotRef}
      aria-hidden="true"
      className="dot-cursor"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 8px ${color}, 0 0 16px ${color}80`,
      }}
    />
  )
}
