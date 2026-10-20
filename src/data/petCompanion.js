/*
 * The roaming companion and its first-login guide — the pure half.
 *
 * Everything here is decided with an injectable `rng` and plain numbers, so it
 * is unit-tested without a browser (tests/pet-companion.test.mjs). The components
 * (RoamingPet, PetGuide) own the timers, the DOM and the camera.
 *
 * Cosmetic only. Nothing here touches points, quests or Supabase, and the
 * guide's "done" flag lives in this browser's storage, not in the research data.
 */

/* ── Speech ── */

const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length) % list.length]

export const LEAVE_LINES = [
  "I'm going for a walk!",
  'Back soon. Going to look around!',
  "I'll go see what's on your screen.",
]
export const RETURN_LINES = ['Home sweet home.', 'That was fun!', "I'm back."]
export const PAT_LINES = ["I'm here!", 'Hi!', 'Need a hand?', 'You can do it!']

export const leaveLine = (rng) => pick(LEAVE_LINES, rng)
export const returnLine = (rng) => pick(RETURN_LINES, rng)
export const patLine = (rng) => pick(PAT_LINES, rng)

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * What the pet says when it reaches a spot. `facts` is a small plain object:
 * { activeQuests, points, streak, hunger, cleanliness, happiness }.
 * Spots are marked in the page with data-pet-spot="<id>".
 */
export function lineForSpot(id, facts = {}) {
  const { activeQuests = 0, points = 0, streak = 0, hunger = 100, cleanliness = 100, happiness = 100 } = facts
  switch (id) {
    case 'points':
      return points >= 10 ? `You have ${points} points. Spend some on me!` : 'Finish a quest to earn points.'
    case 'quests':
      return activeQuests > 0
        ? `You have ${plural(activeQuests, 'active quest', 'active quests')}. Start with an easy one?`
        : 'No quests yet. Add one and I will cheer you on.'
    case 'care':
      if (hunger < 30) return "I'm hungry! Food costs 10 points."
      if (cleanliness < 30) return 'I need a wash. It costs 10 points.'
      if (happiness < 30) return 'Can we play? It costs 10 points.'
      return 'Feed, wash or play with me. 10 points each.'
    case 'evolution':
      return 'Keep earning points and I will grow up.'
    case 'shop':
      return 'Ooh, accessories. I would look great in a hat.'
    case 'streak':
      return streak > 0 ? `${streak}-day streak. Keep it going!` : 'Finish a quest today to start a streak.'
    case 'shelf':
      return 'Try something on me!'
    case 'podium':
      return 'Look who is on top.'
    default:
      return ''
  }
}

/* ── Choosing where to walk ── */

/**
 * Pick 2–3 spots for one walk from the ones present on the page (in page order),
 * preferring spots not visited recently. Returned in the order given, which is
 * top-to-bottom, so the walk reads as a path and not as zig-zagging.
 */
export function planWalk(presentIds, rng = Math.random, recent = []) {
  const fresh = presentIds.filter(id => !recent.includes(id))
  const pool = fresh.length >= 2 ? fresh : presentIds
  const want = Math.min(pool.length, rng() < 0.5 ? 2 : 3)
  const chosen = new Set()
  const bag = [...pool]
  while (chosen.size < want && bag.length) {
    chosen.add(bag.splice(Math.floor(rng() * bag.length) % bag.length, 1)[0])
  }
  return presentIds.filter(id => chosen.has(id))
}

/** Milliseconds of calm before the pet decides to go for a walk by itself. */
export const nextWalkDelay = (rng = Math.random) => 40000 + Math.floor(rng() * 40000)

/* ── Movement ── */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Where the pet's feet go to stand on top of an element: `frac` along its top
 * edge, kept fully inside the viewport. `rect` is a getBoundingClientRect.
 */
export function standPoint(rect, vw, vh, petSize, frac = 0.5) {
  const half = petSize / 2
  return {
    x: clamp(rect.left + rect.width * frac, half + 4, vw - half - 4),
    y: clamp(rect.top, petSize + 64, vh - 8), // 64 clears the sticky header
  }
}

/** One walking step toward a target. speed is px per ms. */
export function stepToward(pos, target, speed, dtMs) {
  const dx = target.x - pos.x
  const dy = target.y - pos.y
  const dist = Math.hypot(dx, dy)
  const reach = speed * dtMs
  if (dist <= Math.max(2, reach)) return { x: target.x, y: target.y, arrived: true, dx }
  return { x: pos.x + (dx / dist) * reach, y: pos.y + (dy / dist) * reach, arrived: false, dx }
}

/* ── First-login guide ── */

export const GUIDE_STEPS = (petName = 'your pet') => [
  {
    id: 'hello',
    spot: null,
    title: `Hi, I'm ${petName}.`,
    body: "I'll show you around. It takes one minute.",
    primary: 'Show me',
  },
  {
    id: 'quests',
    spot: 'quests',
    say: 'Your quests live here.',
    title: 'Plan a quest',
    body: "This is where your quests live. Write the task, pick Easy, Medium or Hard, and say when you'll finish. I'll keep track.",
    primary: 'Next',
  },
  {
    id: 'care',
    spot: 'care',
    say: "This is how I'm doing.",
    title: 'Look after me',
    body: 'Points from finished quests buy food, a wash and playtime. These rings show how I am doing.',
    primary: 'Next',
  },
  {
    id: 'selfie',
    spot: null,
    title: 'Show me you are here',
    body: 'Smile for a practice shot. It is only a practice, so nothing is sent or saved.',
    primary: 'Turn on camera',
  },
  {
    id: 'done',
    spot: null,
    title: "That's how you show proof",
    body: 'When you finish a real quest, you take a photo of your work like this. Now go and finish one!',
    primary: 'Start playing',
  },
]

export const guideKey = (userId) => `pq_guide_done:${userId}`

/** Storage is optional: private windows and blocked storage must never break the guide. */
export function isGuideDone(store, userId) {
  if (!userId) return true // never auto-open without an account
  try { return store?.getItem(guideKey(userId)) === '1' } catch { return false }
}
export function markGuideDone(store, userId) {
  if (!userId) return
  try { store?.setItem(guideKey(userId), '1') } catch { /* ignore */ }
}

export const DND_KEY = 'pq_pet_dnd'
export function readDnd(store) {
  try { return store?.getItem(DND_KEY) === '1' } catch { return false }
}
export function writeDnd(store, on) {
  try { store?.setItem(DND_KEY, on ? '1' : '0') } catch { /* ignore */ }
}
