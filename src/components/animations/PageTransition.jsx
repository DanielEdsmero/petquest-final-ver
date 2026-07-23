import { motion } from 'framer-motion'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Route-level enter/exit animation.
 *
 * Because AnimatePresence runs in `mode="wait"`, each page's `exit` is the
 * reverse of its own `entry` — so navigating back plays the entry animation
 * backwards without needing to track direction.
 */
export const PAGE_VARIANTS = {
  // Dashboard -> Accessories: new page slides in from the right (300ms),
  // and leaves the same way when you go back.
  slideLeft: {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
  // Dashboard -> Mode Select: fade out/in with a slight scale (200ms).
  scaleFade: {
    initial: { opacity: 0, scale: 0.94 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.94 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
}

export default function PageTransition({ variant = 'fade', children }) {
  const reduceMotion = useReducedMotion()
  const v = PAGE_VARIANTS[variant] || PAGE_VARIANTS.fade

  // Reduced motion: cross-fade only, no travel or scaling.
  const active = reduceMotion ? PAGE_VARIANTS.fade : v

  return (
    <motion.div
      initial={active.initial}
      animate={active.animate}
      exit={active.exit}
      transition={active.transition}
      style={{ minHeight: '100vh' }}
    >
      {children}
    </motion.div>
  )
}
