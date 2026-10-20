/*
 * Side-view sprite sets for evolved stages.
 *
 * Baby pets use the 128px sheets in /sprites/<pet>/ (see apps/mobile spriteModel).
 * Evolved stages are drawn bigger and side-on, as separate frames:
 *   - ground frames (idle, walk, ...) on a 192px canvas
 *   - air frames (takeoff, fly, hover) on a 256px canvas
 * Every frame keeps the same pixel scale, so they swap without the pet growing.
 * Art faces right; the left is the same frame mirrored.
 *
 * `anchor` is the point of each canvas that sits on the pet's feet spot, so any
 * two frames line up when they are drawn at the same place. The air canvas is
 * anchored a belly's height above the ground row on purpose: the pet flies with
 * its feet spot on the page and its body in the air above it.
 */

const GROUND = { size: 192, anchor: [126, 188] }
const AIR = { size: 256, anchor: [158, 252] }

const files = (dir, names, shape) => Object.fromEntries(names.map(n => [n, { src: `${dir}/${n}.webp`, ...shape }]))

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

const dragon2 = (() => {
  const dir = '/sprites/dragon/lv2'
  return {
    frames: {
      ...files(dir, ['idle1', 'idle2', 'blink', 'happy', 'interact', ...range('walk', 6)], GROUND),
      ...files(dir, [...range('takeoff', 4), ...range('fly', 6), ...range('hover', 4)], AIR),
    },
    walk: range('walk', 6),
    takeoff: range('takeoff', 4),
    fly: range('fly', 6),
    hover: range('hover', 4),
  }
})()

const SETS = { 'dragon:2': dragon2 }

/** The side-view set for a pet at a level, or null if that stage is still a portrait. */
export const sideSetFor = (petId, level) => SETS[`${petId}:${level}`] || null

export const sideFrame = (set, key) => set.frames[key] || set.frames.idle1

/** Which ground frame to show for the baby-model frame names the walker already uses. */
export function groundKey(set, key, tick) {
  if (key === 'walkLeftA' || key === 'walkLeftB' || key === 'walkRightA' || key === 'walkRightB') return set.walk[tick % set.walk.length]
  if (key === 'idle') return tick % 2 ? 'idle2' : 'idle1'
  return set.frames[key] ? key : 'idle1'
}

/** Takeoff frame for a progress 0..1 (landing plays the same frames backwards). */
export const takeoffKey = (set, p, landing = false) => {
  const i = Math.min(set.takeoff.length - 1, Math.floor(Math.max(0, Math.min(0.999, p)) * set.takeoff.length))
  return set.takeoff[landing ? set.takeoff.length - 1 - i : i]
}
