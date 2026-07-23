import { motion } from 'framer-motion'
import TypingText from './TypingText'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Glowing arcane portal: concentric gold rings pulsing outward, with the
 * caption typing itself out beneath.
 */
const RINGS = [0, 0.35, 0.7]

export default function PortalLoader({ text = 'Opening the Portal...', size = 96 }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="portal-core" style={{ width: size, height: size }}>
        {/* Rings expanding outward and fading. */}
        {!reduceMotion && RINGS.map((delay, i) => (
          <motion.span
            key={i}
            className="portal-ring"
            initial={{ scale: 0.35, opacity: 0.85 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay }}
          />
        ))}

        {/* Steady glowing centre. */}
        <motion.span
          className="portal-eye"
          animate={reduceMotion ? {} : { scale: [1, 1.12, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <TypingText
        text={text}
        className="font-cinzel gradient-text-gold text-lg text-center"
      />
    </div>
  )
}
