import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useCompanion } from '@/companion/CompanionContext';
import {
  leaveLine,
  lineForSpot,
  nextWalkDelay,
  patLine,
  planWalk,
  returnLine,
  standPoint,
  walkMs,
  type Point,
} from '@/data/petCompanion';
import { PET_CATALOG, petIdOf } from '@/data/petModel';
import { spriteFor } from '@/data/petSprites';
import { framesFor } from '@/data/spriteFrames';
import { type FrameKey } from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';

/*
 * The companion, out of its home and walking over the screen.
 *
 * It lives in a layer above the whole app that ignores touches (only the pet itself
 * takes them), so it never blocks a tap. Screens mark things it can visit with
 * <PetSpot>; it walks to the top edge of that thing, says something about it, then
 * walks home. Home is the pet card on the Home tab (spot "pet-home"), whose own
 * pet hides while this one is out.
 *
 * A walk is: say it is leaving → poof → walk to each spot → walk home → poof.
 * Unlike the web there is no per-frame loop: each leg is one native-driven
 * Animated.timing, and every await checks a cancel token, so leaving the screen or
 * turning on Do not disturb stops a walk cleanly.
 */

const SPEED = 0.2;          // px per ms on a calm walk
const GUIDE_SPEED = 0.7;    // the tour's pet runs, so no step makes the student wait
const LEAVE_MS = 1900;
const GUIDE_LEAVE_MS = 250;
const VISIT_MS = 3400;
const ARRIVE_MS = 1300;
const BUBBLE_W = 224;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Ui = { shown: boolean; frame: FrameKey; flip: 1 | -1; bubble: string; shift: number; poof: { x: number; y: number; id: number } | null; hearts: number };
type Stop = { id: string };

export default function RoamingPet() {
  const { profile } = useAuth();
  const comp = useCompanion();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();

  const petId = petIdOf(profile?.selected_pet_id);
  const level = profile?.pet_level ?? 1;
  const baby = level <= 1;
  const frames = framesFor(profile?.selected_pet_id);
  const portrait = spriteFor(profile?.selected_pet_id, level);
  const name = petId ? PET_CATALOG[petId].name : 'Your pet';
  const px = 64;

  const pos = useRef(new Animated.ValueXY({ x: -300, y: -300 })).current;
  const cur = useRef<Point>({ x: -300, y: -300 });                    // feet, in overlay coordinates
  const offset = useRef<Point>({ x: 0, y: 0 });                       // overlay origin in window coordinates
  const overlay = useRef<View>(null);
  const phase = useRef<'home' | 'out' | 'hold'>('home');
  const token = useRef(0);
  const fast = useRef(false);
  const recent = useRef<string[]>([]);
  const nextAuto = useRef(Date.now() + nextWalkDelay());
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef(0);
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartAnim = useRef(new Animated.Value(0)).current;

  const [ui, setUi] = useState<Ui>({ shown: false, frame: 'idle', flip: 1, bubble: '', shift: 0, poof: null, hearts: 0 });
  const patch = (p: Partial<Ui>) => setUi((u) => ({ ...u, ...p }));

  // The latest things the long-lived walk reads, without restarting it on every render.
  const live = useRef({ comp, reduce, insets, px });
  live.current = { comp, reduce, insets, px };

  const win = () => Dimensions.get('window');
  const shiftFor = (x: number) => Math.max(0, BUBBLE_W / 2 + 8 - x) - Math.max(0, x + BUBBLE_W / 2 + 8 - win().width);

  const setPos = (p: Point) => {
    cur.current = p;
    pos.setValue({ x: p.x - px / 2, y: p.y - px });
  };

  const measureOverlay = () =>
    new Promise<void>((resolve) => {
      const node = overlay.current;
      if (!node) return resolve();
      node.measureInWindow((x, y) => {
        offset.current = { x, y };
        resolve();
      });
    });

  const toOverlay = (p: Point): Point => ({ x: p.x - offset.current.x, y: p.y - offset.current.y });

  const measureHome = async (): Promise<Point | null> => {
    const r = await live.current.comp.measure('pet-home');
    return r ? toOverlay({ x: r.x + r.w * 0.5, y: r.y + r.h * 0.8 }) : null;
  };

  const stopFrames = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  /** One walking leg. Resolves true on arrival, false when it was cancelled. */
  const walkTo = (to: Point, my: number) =>
    new Promise<boolean>((resolve) => {
      const from = cur.current;
      const left = to.x < from.x;
      stopFrames();
      ticker.current = setInterval(() => {
        tick.current += 1;
        const even = tick.current % 2 === 0;
        patch({ frame: left ? (even ? 'walkLeftA' : 'walkLeftB') : even ? 'walkRightA' : 'walkRightB', flip: left ? -1 : 1 });
      }, 130);
      Animated.timing(pos, {
        toValue: { x: to.x - px / 2, y: to.y - px },
        duration: walkMs(from, to, fast.current ? GUIDE_SPEED : SPEED),
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        stopFrames();
        if (finished && my === token.current) {
          cur.current = to;
          resolve(true);
        } else resolve(false);
      });
    });

  /** Stop wherever the feet are right now. */
  const freeze = () => {
    stopFrames();
    pos.stopAnimation((v) => {
      cur.current = { x: v.x + px / 2, y: v.y + px };
    });
  };

  const poof = (p: Point) => patch({ poof: { x: p.x, y: p.y, id: Date.now() }, bubble: '' });

  /** Walk to a spot and stand on top of it. Resolves false when cancelled. */
  const visit = async (stop: Stop, my: number, hold: boolean): Promise<boolean> => {
    const { comp: c, insets: ins } = live.current;
    let r = await c.measure(stop.id);
    if (my !== token.current) return false;
    if (!r) return true;                                         // not on screen any more: skip it
    const h = win().height;
    if (!hold && (r.y < ins.top + 90 || r.y > h * 0.55)) {       // bring it into view first (the tour scrolls for itself)
      c.scrollBy(r.y - (ins.top + 110));
      await sleep(550);
      if (my !== token.current) return false;
      r = (await c.measure(stop.id)) ?? r;
    }
    const frac = 0.25 + Math.random() * 0.5;
    const t = standPoint(r, win().width, h, px, frac, ins.top);
    const target = toOverlay({ x: t.x, y: t.y - (hold ? 8 : 0) });
    if (!(await walkTo(target, my))) return false;
    const x = target.x;
    patch({ frame: 'interact', bubble: hold ? '' : lineForSpot(stop.id, c.getFacts()), shift: shiftFor(x + offset.current.x) });
    if (!hold) {
      await sleep(VISIT_MS);
      if (my !== token.current) return false;
      recent.current = [...recent.current, stop.id].slice(-4);
      patch({ bubble: '' });
    }
    return true;
  };

  const goHome = async (my: number) => {
    const home = await measureHome();
    if (my !== token.current) return;
    if (home && (await walkTo(home, my))) {
      patch({ frame: 'happy', bubble: returnLine(), shift: shiftFor(home.x + offset.current.x) });
      await sleep(ARRIVE_MS);
      if (my !== token.current) return;
      poof(home);
    }
    patch({ shown: false, frame: 'idle', bubble: '' });
    live.current.comp.setAway(false);
    phase.current = 'home';
    fast.current = false;
    nextAuto.current = Date.now() + nextWalkDelay();
  };

  const start = async (plan: Stop[], hold: boolean) => {
    if (phase.current !== 'home' || live.current.reduce) return;
    const my = ++token.current;
    phase.current = 'out';
    await measureOverlay();
    const home = await measureHome();
    if (my !== token.current) return;
    if (!home) { phase.current = 'home'; return; }
    fast.current = hold;
    setPos(home);
    live.current.comp.setAway(true);
    patch({ shown: true, frame: 'interact', bubble: hold ? '' : leaveLine(), shift: shiftFor(home.x + offset.current.x) });
    await sleep(hold ? GUIDE_LEAVE_MS : LEAVE_MS);
    if (my !== token.current) return;
    poof(home);
    for (const stop of plan) if (!(await visit(stop, my, hold))) return;
    if (hold) { phase.current = 'hold'; return; }
    await goHome(my);
  };

  const walk = async () => {
    const present = await live.current.comp.presentSpots();
    const plan = planWalk(present, Math.random, recent.current).map((id) => ({ id }));
    if (plan.length) await start(plan, false);
  };

  const cancelAll = () => {
    token.current += 1;
    freeze();
    patch({ shown: false, bubble: '' });
    live.current.comp.setAway(false);
    phase.current = 'home';
    fast.current = false;
  };

  // The tour's controls. They read refs only, so one registration serves the whole session.
  const api = useRef({ walk, start, visit, goHome, freeze });
  api.current = { walk, start, visit, goHome, freeze };
  useEffect(() => {
    live.current.comp.register({
      walk: () => void api.current.walk(),
      guideTo: (spot) => {
        if (live.current.reduce) return;                          // no walking: the tour's lit-up frame is the highlight
        if (phase.current === 'home') { void api.current.start([{ id: spot }], true); return; }
        const my = ++token.current;
        api.current.freeze();
        fast.current = true;
        phase.current = 'hold';
        void api.current.visit({ id: spot }, my, true);
      },
      guideHome: () => {
        if (phase.current === 'home') return;
        const my = ++token.current;
        api.current.freeze();
        void api.current.goHome(my);
      },
    });
    return () => {
      live.current.comp.register(null);
      stopFrames();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wander off by itself now and then, but only when calm: not in the tour, not on Do not disturb.
  useEffect(() => {
    const id = setInterval(() => {
      const { comp: c, reduce: rm } = live.current;
      if (phase.current !== 'home' || Date.now() < nextAuto.current) return;
      nextAuto.current = Date.now() + nextWalkDelay();
      if (c.dnd || c.guideOpen || rm || AppState.currentState !== 'active' || !c.hasSpot('pet-home')) return;
      void api.current.walk();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Leaving the screen the pet lives on, or switching on Do not disturb, sends it straight home.
  useEffect(() => {
    if (phase.current !== 'home' && (!comp.hasSpot('pet-home') || (comp.dnd && phase.current === 'out'))) cancelAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.spotsVersion, comp.dnd]);

  const react = () => {
    if (reactTimer.current) clearTimeout(reactTimer.current);
    patch({ frame: 'happy', bubble: patLine(), hearts: ui.hearts + 1 });
    heartAnim.setValue(0);
    Animated.timing(heartAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start();
    reactTimer.current = setTimeout(() => patch({ bubble: phase.current === 'out' ? '' : ui.bubble }), 1500);
  };

  if (!petId) return null;
  return (
    <View ref={overlay} pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}>
      {ui.poof && !reduce && <Poof key={ui.poof.id} x={ui.poof.x} y={ui.poof.y} />}
      <Animated.View
        pointerEvents={ui.shown ? 'box-none' : 'none'}
        style={[styles.pet, { width: px, height: px, opacity: ui.shown ? 1 : 0, transform: pos.getTranslateTransform() }]}
      >
        {ui.bubble !== '' && (
          <View style={[styles.bubbleBox, { bottom: px * 0.92, left: px / 2 - BUBBLE_W / 2 + ui.shift }]} pointerEvents="none">
            <Text style={styles.bubble} accessibilityLiveRegion="polite">{ui.bubble}</Text>
          </View>
        )}
        {ui.hearts > 0 && (
          <Animated.Text
            key={ui.hearts}
            style={[styles.heart, { opacity: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] }]}
          >
            💗
          </Animated.Text>
        )}
        <Pressable onPress={react} accessibilityRole="button" accessibilityLabel={`${name}. Say hi`} hitSlop={8} style={{ width: px, height: px }}>
          {baby ? (
            <Image source={frames[ui.frame]} style={{ width: px, height: px }} contentFit="contain" />
          ) : (
            <Image source={portrait} style={{ width: px, height: px, transform: [{ scaleX: ui.flip }] }} contentFit="contain" />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** A soft white puff where the pet appears or disappears. */
function Poof({ x, y }: { x: number; y: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.poof,
        { left: x - 32, top: y - 64, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pet: { position: 'absolute', left: 0, top: 0 },
  bubbleBox: { position: 'absolute', width: BUBBLE_W, alignItems: 'center' },
  bubble: {
    backgroundColor: '#FFFFFF', color: '#102A43', borderColor: '#E1E7E3', borderWidth: 1, borderRadius: 14, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center',
  },
  heart: { position: 'absolute', left: 22, top: 0, fontSize: 18 },
  poof: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2, borderColor: 'rgba(63,133,128,0.25)',
  },
});
