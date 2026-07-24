import { lazy, Suspense } from 'react'
import useReducedMotion from '../../hooks/useReducedMotion'

/*
 * Full-bleed magic-ring backdrop for celebration overlays.
 *
 * MagicRings is the only thing in the app that needs three.js — roughly 150 kB
 * gzipped, for an effect that plays for two seconds when a player levels up or
 * hits a streak milestone. Paying that on every page load would be a bad trade,
 * so it is code-split: Vite emits three into its own chunk that is fetched the
 * first time a celebration fires, then cached for the session.
 *
 * The fallback is deliberately null. The rings are a flourish behind overlays
 * that already read correctly on their own, so a few hundred milliseconds of
 * nothing while the chunk arrives costs the sequence nothing.
 */
const MagicRings = lazy(() => import('../reactbits/MagicRings'))

export default function CelebrationRings({
  color = '#f5a31a',
  colorTwo = '#7c3aed',
  opacity = 0.55,
  speed = 1.4,
  ringCount = 6,
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  return (
    <div className="celebration-rings" aria-hidden="true">
      <Suspense fallback={null}>
        <MagicRings
          color={color}
          colorTwo={colorTwo}
          speed={speed}
          ringCount={ringCount}
          opacity={opacity}
          baseRadius={0.22}
          radiusStep={0.09}
          scaleRate={0.35}
          lineThickness={2.2}
          attenuation={7}
          noiseAmount={0.05}
        />
      </Suspense>
    </div>
  )
}
