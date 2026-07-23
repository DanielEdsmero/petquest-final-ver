import { useReducedMotion as useFramerReducedMotion } from 'framer-motion'

/*
 * Whether the user has asked the OS to reduce motion.
 *
 * Thin wrapper over framer-motion's own hook rather than a reimplementation:
 * framer already tracks the (prefers-reduced-motion) media query and stays in
 * sync when the user flips the setting mid-session. This normalises its
 * `boolean | null` (null before hydration) to a plain boolean so callers can
 * use it directly in conditionals.
 */
export default function useReducedMotion() {
  return useFramerReducedMotion() ?? false
}
