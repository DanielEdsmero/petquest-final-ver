import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { readDnd, writeDnd } from '../data/petCompanion'

/*
 * Shared state between the roaming pet (the overlay), the painted room that
 * is its home (it hides its own pet while the overlay pet is out) and the
 * first-login guide. The overlay registers its controls here, so the guide
 * and the dashboard button can ask the pet to walk without owning the walk.
 */

const store = () => { try { return window.localStorage } catch { return null } }

const NOOP = {
  away: false, guideOpen: false, dnd: false,
  setAway() {}, openGuide() {}, closeGuide() {}, setDnd() {},
  walk() {}, guideTo() {}, guideHome() {}, register() {},
}

const Ctx = createContext(NOOP)

export function CompanionProvider({ children }) {
  const [away, setAway] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [dnd, setDndState] = useState(() => readDnd(store()))
  const controls = useRef({})

  const setDnd = useCallback((on) => { setDndState(on); writeDnd(store(), on) }, [])
  const register = useCallback((fns) => { controls.current = fns || {} }, [])

  const value = useMemo(() => ({
    away, setAway, guideOpen, dnd, setDnd, register,
    openGuide: () => setGuideOpen(true),
    closeGuide: () => setGuideOpen(false),
    walk: () => controls.current.walk?.(),
    guideTo: (spot, line) => controls.current.guideTo?.(spot, line),
    guideHome: () => controls.current.guideHome?.(),
  }), [away, guideOpen, dnd, setDnd, register])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCompanion = () => useContext(Ctx)
