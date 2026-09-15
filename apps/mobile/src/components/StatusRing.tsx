import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ringFraction, statState } from '@/data/petHomeModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors, FontSize, Spacing, TapTarget } from '@/theme';

/**
 * One compact circular indicator: Hunger / Cleanliness / Happiness.
 *
 * `value` is the server's 0–100 figure or null (not loaded → an empty ring
 * with a dash, never a fake 0). The ring animates to a NEW value only — the
 * only way the value changes is a fetched row or a `care_pet()` reply, so the
 * motion is always a response to the server. Reduce Motion snaps instead.
 *
 * Colour never carries the state alone: the percentage sits in the centre,
 * the label below, and the neutral state word ("Needs attention") under that.
 * Tapping never spends anything — it hands the action to the caller, who
 * navigates or confirms.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type StatusRingProps = {
  label: string;
  value: number | null;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  onPress?: () => void;
  /** Read after the label, e.g. "Feed". */
  actionHint?: string;
};

export function StatusRing({ label, value, color, icon, size = 76, onPress, actionHint }: StatusRingProps) {
  const reduced = useReducedMotion();
  const fraction = ringFraction(value);
  const target = fraction ?? 0;
  const anim = useRef(new Animated.Value(target)).current;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (reduced) {
      anim.setValue(target);
      return;
    }
    Animated.timing(anim, { toValue: target, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, reduced, anim]);

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const state = statState(value);
  const pct = fraction == null ? '—' : `${Math.round(fraction * 100)}%`;
  const a11y = `${label}: ${fraction == null ? 'not loaded' : `${Math.round(fraction * 100)} percent, ${state.label}`}${actionHint ? `. ${actionHint}` : ''}`;

  const body = (
    <>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.centre} pointerEvents="none">
          <Ionicons name={icon} size={14} color={color} />
          <Text style={styles.pct} numberOfLines={1} adjustsFontSizeToFit>
            {pct}
          </Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.state, state.low && { color }]} numberOfLines={1}>
        {state.label}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityLabel={a11y} accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 2, minHeight: TapTarget, paddingVertical: Spacing.xs },
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pct: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700', marginTop: 1 },
  label: { color: Colors.ink, fontSize: FontSize.xs, fontWeight: '600', marginTop: Spacing.xs },
  state: { color: Colors.inkMuted, fontSize: FontSize.xs },
  pressed: { opacity: 0.7 },
});
