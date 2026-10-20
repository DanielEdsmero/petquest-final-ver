import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { useCompanion } from '@/companion/CompanionContext';
import SelfiePractice from '@/companion/SelfiePractice';
import { guideArtFor } from '@/data/guideArt';
import { GUIDE_STEPS, accentFor, type Rect } from '@/data/petCompanion';
import { PET_CATALOG, petIdOf } from '@/data/petModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { markGuideDone } from '@/lib/companionStore';

/*
 * First-login tour, written like a visual novel. A big version of the student's pet
 * talks from a dialogue box at the bottom of the screen. The small pet (RoamingPet)
 * runs to the thing being explained, and the rest of the screen is dimmed so only
 * that part is lit; touches outside the lit part are blocked, so nobody gets lost.
 *
 * It lives on the Home tab (where the lit-up things are). Nothing here changes game
 * data, and the selfie step is practice only (SelfiePractice).
 */

const PAD = 10;                                       // light around the lit-up area
const DIM = 'rgba(16, 42, 67, 0.7)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function PetGuide() {
  const { profile } = useAuth();
  const comp = useCompanion();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const petId = petIdOf(profile?.selected_pet_id);
  const meta = petId ? PET_CATALOG[petId] : null;
  const level = profile?.pet_level ?? 1;

  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [typedDone, setTypedDone] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dlgH, setDlgH] = useState(180);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = GUIDE_STEPS(meta?.name);
  const step = steps[i];
  const open = comp.guideOpen && !!meta && comp.hasSpot('pet-home');   // only while the Home tab is showing
  const accent = accentFor(petId);
  const win = Dimensions.get('window');

  // Reopening (Replay) always starts from the top.
  useEffect(() => {
    if (!comp.guideOpen) setI(0);
  }, [comp.guideOpen]);

  // The pet follows the script: scroll the thing into view, then the small pet runs to it; no target, it goes home.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      if (step.spot) {
        const r = await comp.measure(step.spot);
        if (r && alive && (r.y < insets.top + 90 || r.y > win.height * 0.4)) {
          comp.scrollBy(r.y - (insets.top + 110));
          await sleep(550);
        }
        if (alive) comp.guideTo(step.spot);
      } else if (i > 0) comp.guideHome();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  // The big pet's line types out; a tap on the box shows it all.
  useEffect(() => {
    if (!open) return;
    const text = steps[i].line;
    if (timer.current) clearInterval(timer.current);
    if (reduce) {
      setTyped(text);
      setTypedDone(true);
      return;
    }
    let n = 0;
    setTyped('');
    setTypedDone(false);
    timer.current = setInterval(() => {
      n += 2;
      setTyped(text.slice(0, n));
      if (n >= text.length) {
        if (timer.current) clearInterval(timer.current);
        setTypedDone(true);
      }
    }, 28);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, reduce]);

  // Follow the lit-up thing, so a layout change or a late load never leaves the light behind.
  useEffect(() => {
    if (!open || !step.spot) {
      setRect(null);
      return;
    }
    let alive = true;
    const spot = step.spot;
    const poll = async () => {
      const r = await comp.measure(spot);
      if (!alive || !r) return;
      setRect((p) => (p && Math.abs(p.x - r.x) < 1 && Math.abs(p.y - r.y) < 1 && Math.abs(p.w - r.w) < 1 && Math.abs(p.h - r.h) < 1 ? p : r));
    };
    void poll();
    const id = setInterval(poll, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  const finish = () => {
    void markGuideDone(profile?.id);
    comp.guideHome();
    comp.closeGuide();
  };
  const next = () => {
    if (!typedDone) {
      if (timer.current) clearInterval(timer.current);
      setTyped(step.line);
      setTypedDone(true);
      return;
    }
    if (step.id === 'done') finish();
    else setI((n) => Math.min(n + 1, steps.length - 1));
  };

  // Android's back button leaves the tour instead of leaving the app.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !meta) return null;

  const art = guideArtFor(petId, level);
  const side = rect && rect.x + rect.w / 2 < win.width / 2 ? 'right' : 'left';   // the big pet stands opposite what is lit
  const bottom = Math.max(insets.bottom, 8) + 8;
  // The big pet only takes the free space above the dialogue, so it never covers what is lit.
  // Where there is not enough room (the lit card is low on the screen, or the practice window is open) a small portrait sits on the dialogue instead.
  const dlgTop = win.height - bottom - dlgH;
  const floor = rect ? rect.y + rect.h + PAD + (step.hint ? 46 : 8) : insets.top + 8;
  const bigH = Math.min(240, dlgTop - floor + 18);
  const showBig = !!art && step.id !== 'selfie' && bigH >= 120;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none" accessibilityViewIsModal>
      {rect ? (
        <>
          <View style={[styles.dim, { left: 0, top: 0, right: 0, height: Math.max(0, rect.y - PAD) }]} />
          <View style={[styles.dim, { left: 0, top: rect.y - PAD, width: Math.max(0, rect.x - PAD), height: rect.h + PAD * 2 }]} />
          <View style={[styles.dim, { left: rect.x + rect.w + PAD, top: rect.y - PAD, right: 0, height: rect.h + PAD * 2 }]} />
          <View style={[styles.dim, { left: 0, top: rect.y + rect.h + PAD, right: 0, bottom: 0 }]} />
          <View pointerEvents="none" style={[styles.hole, { left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }]} />
          {step.hint ? (
            <View pointerEvents="none" style={[styles.hint, { left: Math.min(win.width - 170, Math.max(12, rect.x + rect.w / 2 - 75)), top: rect.y + rect.h + PAD + 10 }]}>
              <Text style={styles.hintText}>{step.hint} ↑</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.dimAll]} />
      )}

      {art && showBig ? (
        <Image
          source={art}
          contentFit="contain"
          accessibilityLabel={`${meta.name}, your pet`}
          style={[styles.big, { height: bigH, width: bigH * 0.85, bottom: bottom + dlgH - 18 }, side === 'right' ? { right: 8 } : { left: 8 }]}
          pointerEvents="none"
        />
      ) : null}

      {step.id === 'selfie' ? (
        <View style={[styles.modal, { top: insets.top + 12, maxHeight: win.height - dlgH - bottom - insets.top - 24 }]} accessibilityLabel="Practice proof photo">
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Practice proof</Text>
            <SelfiePractice onDone={next} onSkip={next} />
          </ScrollView>
        </View>
      ) : null}

      <Pressable
        onPress={() => !typedDone && next()}
        onLayout={(e) => setDlgH(e.nativeEvent.layout.height)}
        accessible={false}
        style={[styles.dlg, { bottom, borderColor: accent }]}
      >
        {art && !showBig ? <Image source={art} contentFit="contain" style={styles.avatar} pointerEvents="none" /> : null}
        <View style={[styles.who, { backgroundColor: accent }]}>
          <Text style={styles.whoText}>{meta.name}</Text>
        </View>
        <Text style={styles.txt} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {typed}
        </Text>
        <Text style={styles.sr} accessibilityLiveRegion="polite">{step.line}</Text>
        <View style={styles.ft}>
          <View style={styles.dots} accessibilityLabel={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((s, k) => (
              <View key={s.id} style={[styles.dot, k === i && { width: 22, backgroundColor: accent }]} />
            ))}
          </View>
          <View style={styles.btns}>
            {step.primary ? (
              <Pressable onPress={next} accessibilityRole="button" style={styles.next}>
                <Text style={styles.nextText}>{step.primary === 'Next' ? 'Next ▸' : step.primary}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={8} style={styles.skip}>
              <Text style={styles.skipText}>Skip tour</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 50 },
  dim: { position: 'absolute', backgroundColor: DIM },
  dimAll: { backgroundColor: DIM },
  hole: { position: 'absolute', borderRadius: 18, borderWidth: 3, borderColor: '#FFFFFF' },
  hint: { position: 'absolute', backgroundColor: '#F4B183', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  hintText: { color: '#102A43', fontSize: 14, fontWeight: '900' },
  big: { position: 'absolute' },
  modal: { position: 'absolute', left: 12, right: 12, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14 },
  modalTitle: { color: '#102A43', fontSize: 18, fontWeight: '900', marginBottom: 8 },
  dlg: {
    position: 'absolute', left: 12, right: 12, backgroundColor: '#FFFFFF', borderWidth: 3, borderRadius: 22,
    paddingTop: 24, paddingHorizontal: 16, paddingBottom: 12, shadowColor: '#102A43', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  avatar: { position: 'absolute', right: 14, top: -34, width: 56, height: 56 },
  who: { position: 'absolute', left: 16, top: -16, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 4 },
  whoText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  txt: { color: '#102A43', fontSize: 17, lineHeight: 24, fontWeight: '700', minHeight: 72 },
  sr: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  ft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#CBD5D0' },
  btns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  next: { backgroundColor: '#3F8580', borderRadius: 12, minHeight: 46, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  skip: { minHeight: 46, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#667085', fontSize: 14, fontWeight: '800' },
});
