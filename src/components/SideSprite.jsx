import { sideFrame } from '../data/spriteSets'

/*
 * One frame of a side-view set, drawn so its anchor sits on the parent's top-left
 * corner. Put it inside a zero-size positioned element at the pet's feet spot.
 * `unit` is a CSS length for one source pixel (e.g. "0.75px"), so the sprite
 * scales with whatever the caller is sizing the pet against.
 */
export default function SideSprite({ set, frame, flip = 1, unit }) {
  const f = sideFrame(set, frame)
  const n = v => `calc(${v} * ${unit})`
  const [ax, ay] = f.anchor
  return (
    <img
      src={f.src} alt="" draggable="false"
      style={{
        position: 'absolute', left: n(-ax), top: n(-ay), width: n(f.size), height: n(f.size),
        maxWidth: 'none', imageRendering: 'pixelated', display: 'block',
        transformOrigin: `${n(ax)} ${n(ay)}`, transform: flip < 0 ? 'scaleX(-1)' : undefined,
      }}
    />
  )
}
