import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { MOOD_CUE, MOOD_FRAME, type Mood } from '@/data/moodModel';
import { type PetId } from '@/data/petModel';
import { type FrameSet } from '@/data/spriteFrames';
import { flourishFor, type Reaction } from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors } from '@/theme';

/**
 * The enlarged companion on the View Pet screen.
 *
 * A Baby-stage companion shows the sheet frame for its mood (`MOOD_FRAME`)
 * with a slow breathing scale, a small mood cue (dust / sparkles), and the
 * species flourish on a confirmed care reaction or a tap. Older stages show
 * the evolution portrait with the same breathing — the portrait is the
 * official identity image and is never distorted; only translate/scale of a
 * few percent are applied.
 *
 * No timers other than the animation loop; everything stops on unmount and
 * under Reduce Motion.
 */
export function PetExpression({
  frames,
  portrait,
  mood,
  petId,
  size = 220,
  reaction,
  onTap,
  accessibilityLabel,
}: {
  /** Sheet frames for a Baby companion, or null to show the portrait. */
  frames: FrameSet | null;
  portrait: ImageSourcePropType | null;
  mood: Mood;
  petId: PetId | null;
  size?: number;
  reaction?: { kind: Reaction; nonce: number } | null;
  onTap?: () => void;
  accessibilityLabel: string;
}) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const hopping = useRef<Animated.CompositeAnimation | null>(null);

  // Breathing: a 2 % scale over 3.6 s; slower and shallower when the pet is low.
  useEffect(() => {
    if (reduced) {
      breath.setValue(0);
      return;
    }
    const period = mood === 'sad' || mood === 'unclean' ? 2600 : 1800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, breath, mood]);

  const play = (kind: 'flourish' | 'happy') => {
    hopping.current?.stop();
    hop.setValue(0);
    if (reduced) return;
    const f = flourishFor(petId);
    const hops: [number, number][] = kind === 'flourish' && f ? f.hops.map(([h, up]) => [h * 1.6, up]) : [[12, 180]];
    const hoverMs = kind === 'flourish' && f ? f.hoverMs : 0;
    const seq: Animated.CompositeAnimation[] = [];
    hops.forEach(([h, up], i) => {
      seq.push(Animated.timing(hop, { toValue: -h, duration: up, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      if (i === hops.length - 1 && hoverMs > 0) seq.push(Animated.delay(hoverMs));
      seq.push(Animated.timing(hop, { toValue: 0, duration: up, easing: Easing.in(Easing.quad), useNativeDriver: true }));
    });
    hopping.current = Animated.sequence(seq);
    hopping.current.start(() => {
      hopping.current = null;
    });
  };

  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!reaction || reaction.nonce === lastNonce.current) return;
    lastNonce.current = reaction.nonce;
    play(reaction.kind === 'play' || reaction.kind === 'tap' ? 'flourish' : 'happy');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction]);

  useEffect(
    () => () => {
      hopping.current?.stop();
    },
    [],
  );

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, mood === 'sad' ? 1.012 : 1.02] });
  const droop = mood === 'sad' ? 4 : 0;
  const cue = MOOD_CUE[mood];
  const source = frames ? frames[MOOD_FRAME[mood]] : portrait;

  return (
    <Pressable
      onPress={() => {
        play('flourish');
        onTap?.();
      }}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Says hello"
      style={{ width: size, height: size }}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ translateY: Animated.add(hop, new Animated.Value(droop)) }, { scale }] }}>
        {source ? (
          <Image source={source} style={{ width: size, height: size }} contentFit="contain" allowDownscaling={false} transition={150} />
        ) : (
          <Text style={[styles.egg, { fontSize: size * 0.5, lineHeight: size }]}>🥚</Text>
        )}
      </Animated.View>
      {cue === 'dust' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
          <View style={[styles.dust, { left: size * 0.14, top: size * 0.24, width: 12, height: 12 }]} />
          <View style={[styles.dust, { left: size * 0.8, top: size * 0.32, width: 9, height: 9 }]} />
          <View style={[styles.dust, { left: size * 0.72, top: size * 0.14, width: 7, height: 7 }]} />
        </View>
      )}
      {cue === 'sparkle' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
          <Text style={[styles.sparkle, { left: size * 0.08, top: size * 0.12 }]}>✦</Text>
          <Text style={[styles.sparkle, styles.sparkleSmall, { left: size * 0.84, top: size * 0.22 }]}>✦</Text>
          <Text style={[styles.sparkle, styles.sparkleSmall, { left: size * 0.16, top: size * 0.7 }]}>✦</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  egg: { textAlign: 'center' },
  dust: { position: 'absolute', borderRadius: 99, backgroundColor: Colors.inkFaint, opacity: 0.5 },
  sparkle: { position: 'absolute', color: Colors.accentWarm, fontSize: 18 },
  sparkleSmall: { fontSize: 13 },
});
