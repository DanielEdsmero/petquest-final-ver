import { useState, useEffect } from 'react'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Reveals text one letter at a time. The full string stays in the accessible
 * tree (aria-label) so screen readers announce it once, not character by
 * character.
 */
export default function TypingText({ text, speed = 45, className, style }) {
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(reduceMotion ? text.length : 0)

  useEffect(() => {
    if (reduceMotion) { setShown(text.length); return }
    setShown(0)
    const id = setInterval(() => {
      setShown(n => {
        if (n >= text.length) { clearInterval(id); return n }
        return n + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, reduceMotion])

  return (
    <span className={className} style={style} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {/* Reserve the full width so surrounding layout doesn't jitter. */}
      <span aria-hidden="true" style={{ opacity: 0 }}>{text.slice(shown)}</span>
    </span>
  )
}
