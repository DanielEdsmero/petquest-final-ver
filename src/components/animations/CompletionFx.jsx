import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ParticleBurst from './ParticleBurst'
import FloatingText from './FloatingText'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * All the celebratory feedback for a completed quest, in one portal:
 *   - a radial gold wash from the card's centre
 *   - a star-particle burst at the button
 *   - "+N pts" rising from the button
 *
 * Portalled to <body> for two reasons: an ancestor with a transform would trap
 * `position: fixed`, and — more importantly — the quest card itself unmounts
 * the instant it moves into the Completed list, which would kill any animation
 * owned by it. Anchoring to viewport coordinates lets the effects outlive it.
 *
 * `reward` = { id, cardX, cardY, btnX, btnY, color, label } | null
 */
export default function CompletionFx({ reward, onDone }) {
  const reduceMotion = useReducedMotion()

  return createPortal(
    <>
      <AnimatePresence>
        {reward && !reduceMotion && (
          <motion.div
            key={`burst-${reward.id}`}
            className="completion-burst"
            style={{
              '--burst-x': `${reward.cardX}px`,
              '--burst-y': `${reward.cardY}px`,
              '--burst-color': `${reward.color}66`,
            }}
            initial={{ opacity: 1, scale: 0.15 }}
            animate={{ opacity: 0, scale: 2.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={onDone}>
        {reward && (
          <motion.span
            key={`fx-${reward.id}`}
            className="fx-anchor"
            style={{ left: reward.cardX, top: reward.btnY }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ParticleBurst show count={5} color="#f5a31a" distance={30} />
            <FloatingText show color={reward.color} fontSize="1.05rem">
              {reward.label}
            </FloatingText>
          </motion.span>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}
