/*
 * Passthrough. This used to apply framer-motion enter/exit variants per route,
 * but without AnimatePresence the motion.div instance gets reused across
 * navigations and framer doesn't re-apply `initial` on a reused node — so a
 * page could settle off-screen (x:100%) or invisible (opacity:0) and stay
 * there, i.e. a blank page. Route transitions caused two such blank-screen
 * bugs, so we render children directly and let the (calmer) de-slopped UI
 * stand on its own. `variant` is accepted and ignored for call-site
 * compatibility.
 */
export const PAGE_VARIANTS = {}

export default function PageTransition({ children }) {
  return children
}
