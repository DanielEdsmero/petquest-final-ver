import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Dimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { type Facts, type Rect } from '@/data/petCompanion';
import { readDnd, writeDnd } from '@/lib/companionStore';

/**
 * Shared state between the roaming pet (the overlay), the home screen (whose own
 * pet hides while the overlay pet is out), the first-login tour and Profile.
 *
 * Screens mark things the pet can visit with <PetSpot id="…">. A spot is
 * registered only while its screen is focused, so the pet never walks to something
 * on a tab you cannot see. Positions are measured on demand (measureInWindow),
 * not tracked, so scrolling costs nothing.
 *
 * The overlay registers its controls here, so the tour and the Profile switch can
 * ask the pet to walk without owning the walk.
 */

type Controls = {
  walk?: () => void;
  guideTo?: (spot: string) => void;
  guideHome?: () => void;
};

type Ctx = {
  away: boolean;
  setAway: (v: boolean) => void;
  guideOpen: boolean;
  openGuide: () => void;
  closeGuide: () => void;
  dnd: boolean;
  setDnd: (on: boolean) => void;
  registerSpot: (id: string, ref: RefObject<View | null>) => void;
  unregisterSpot: (id: string, ref: RefObject<View | null>) => void;
  /** Window rect of a registered spot, or null when it is not on screen. */
  measure: (id: string) => Promise<Rect | null>;
  /** Ids of the spots currently on screen, top to bottom, without the pet's own home. */
  presentSpots: () => Promise<string[]>;
  hasSpot: (id: string) => boolean;
  /** The focused screen tells the pet how to scroll it (dy > 0 scrolls the content up). */
  registerScroller: (fn: ((dy: number) => void) | null) => void;
  scrollBy: (dy: number) => void;
  register: (c: Controls | null) => void;
  /** The home screen publishes what the pet may talk about (counts, stats); nothing else reads it. */
  setFacts: (f: Facts) => void;
  getFacts: () => Facts;
  walk: () => void;
  guideTo: (spot: string) => void;
  guideHome: () => void;
  /** Bumps whenever a spot is added or removed, so listeners can re-check. */
  spotsVersion: number;
};

const NOOP: Ctx = {
  away: false, setAway() {}, guideOpen: false, openGuide() {}, closeGuide() {}, dnd: false, setDnd() {},
  registerSpot() {}, unregisterSpot() {}, measure: async () => null, presentSpots: async () => [], hasSpot: () => false,
  registerScroller() {}, scrollBy() {}, register() {}, setFacts() {}, getFacts: () => ({}), walk() {}, guideTo() {}, guideHome() {}, spotsVersion: 0,
};

const CompanionCtx = createContext<Ctx>(NOOP);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [away, setAway] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [dnd, setDndState] = useState(false);
  const [spotsVersion, setSpotsVersion] = useState(0);
  const spots = useRef<Record<string, RefObject<View | null>>>({});
  const controls = useRef<Controls>({});
  const scroller = useRef<((dy: number) => void) | null>(null);
  const facts = useRef<Facts>({});

  useEffect(() => {
    let alive = true;
    readDnd().then((v) => alive && setDndState(v));
    return () => {
      alive = false;
    };
  }, []);

  const setDnd = useCallback((on: boolean) => {
    setDndState(on);
    void writeDnd(on);
  }, []);

  const registerSpot = useCallback((id: string, ref: RefObject<View | null>) => {
    spots.current[id] = ref;
    setSpotsVersion((n) => n + 1);
  }, []);
  const unregisterSpot = useCallback((id: string, ref: RefObject<View | null>) => {
    if (spots.current[id] === ref) delete spots.current[id];
    setSpotsVersion((n) => n + 1);
  }, []);

  const measure = useCallback(
    (id: string) =>
      new Promise<Rect | null>((resolve) => {
        const node = spots.current[id]?.current;
        if (!node) return resolve(null);
        const timer = setTimeout(() => resolve(null), 400);
        node.measureInWindow((x, y, w, h) => {
          clearTimeout(timer);
          resolve(w > 0 && h > 0 ? { x, y, w, h } : null);
        });
      }),
    [],
  );

  const presentSpots = useCallback(async () => {
    const win = Dimensions.get('window');
    const found: { id: string; y: number }[] = [];
    for (const id of Object.keys(spots.current)) {
      if (id === 'pet-home') continue;
      const r = await measure(id);
      if (r && r.y + r.h > 0 && r.y < win.height) found.push({ id, y: r.y });
    }
    return found.sort((a, b) => a.y - b.y).map((f) => f.id);
  }, [measure]);

  const hasSpot = useCallback((id: string) => id in spots.current, []);
  const registerScroller = useCallback((fn: ((dy: number) => void) | null) => {
    scroller.current = fn;
  }, []);
  const scrollBy = useCallback((dy: number) => scroller.current?.(dy), []);
  const register = useCallback((c: Controls | null) => {
    controls.current = c ?? {};
  }, []);
  const setFacts = useCallback((f: Facts) => {
    facts.current = f;
  }, []);
  const getFacts = useCallback(() => facts.current, []);

  const value = useMemo<Ctx>(
    () => ({
      away, setAway, guideOpen, dnd, setDnd, spotsVersion,
      openGuide: () => setGuideOpen(true),
      closeGuide: () => setGuideOpen(false),
      registerSpot, unregisterSpot, measure, presentSpots, hasSpot, registerScroller, scrollBy, register, setFacts, getFacts,
      walk: () => controls.current.walk?.(),
      guideTo: (spot: string) => controls.current.guideTo?.(spot),
      guideHome: () => controls.current.guideHome?.(),
    }),
    [away, guideOpen, dnd, setDnd, spotsVersion, registerSpot, unregisterSpot, measure, presentSpots, hasSpot, registerScroller, scrollBy, register, setFacts, getFacts],
  );

  return <CompanionCtx.Provider value={value}>{children}</CompanionCtx.Provider>;
}

export const useCompanion = () => useContext(CompanionCtx);

/** Marks a part of a screen the pet can visit. Registered only while the screen is focused. */
export function PetSpot({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<View>(null);
  const { registerSpot, unregisterSpot } = useCompanion();
  useFocusEffect(
    useCallback(() => {
      registerSpot(id, ref);
      return () => unregisterSpot(id, ref);
    }, [id, registerSpot, unregisterSpot]),
  );
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
