import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors, FontSize, Radius, Shadow, Spacing, TapTarget } from '@/theme';

/**
 * The small shared vocabulary of the "Today's Adventure" UI.
 *
 * One filled button (`PrimaryButton`), one outlined one, one card surface, one
 * chip, one status pill, one animated bar and the pet hero. Everything else is
 * composed from these so the screens stay consistent without a component
 * library. All tap targets are at least `TapTarget` (48pt) tall.
 */

/* ── Buttons ── */

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  disabled?: boolean;
  /** Announced instead of `label` when the visible text is not self-explanatory. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, icon, busy, disabled, accessibilityLabel, style }: ButtonProps) {
  const off = !!disabled || !!busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.primaryPressed,
        disabled && !busy && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={Colors.onPrimary} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={Colors.onPrimary} /> : null}
          <Text style={styles.primaryText} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon, busy, disabled, accessibilityLabel, style }: ButtonProps) {
  const off = !!disabled || !!busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed, off && styles.disabled, style]}
    >
      {busy ? (
        <ActivityIndicator color={Colors.primary} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={Colors.primary} /> : null}
          <Text style={styles.secondaryText} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A quiet text action — "View all quests →". Still a full-height tap target. */
export function TextButton({ label, onPress, accessibilityLabel }: Pick<ButtonProps, 'label' | 'onPress' | 'accessibilityLabel'>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressedText]}
    >
      <Text style={styles.textButtonLabel}>{label}</Text>
      <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
    </Pressable>
  );
}

/* ── Surfaces ── */

export function Surface({ children, style, elevated = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; elevated?: boolean }) {
  return <View style={[styles.surface, elevated && Shadow.card, style]}>{children}</View>;
}

/** The small uppercase heading over a section: NEXT QUEST, TODAY'S PATH. */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.sectionLabel, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/* ── Chips and pills ── */

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
        {count != null && count > 0 ? ` ${count}` : ''}
      </Text>
    </Pressable>
  );
}

export type Tone = 'good' | 'waiting' | 'bad' | 'neutral' | 'active';

export const toneColor = (tone: Tone): { fg: string; bg: string } => {
  switch (tone) {
    case 'good':
      return { fg: Colors.success, bg: Colors.successTint };
    case 'bad':
      return { fg: Colors.warning, bg: Colors.warningTint };
    case 'waiting':
      return { fg: Colors.accentWarm, bg: Colors.accentWarmTint };
    case 'active':
      return { fg: Colors.primary, bg: Colors.primaryTint };
    default:
      return { fg: Colors.inkMuted, bg: Colors.surface };
  }
};

/** Text + colour, never colour alone. */
export function StatusPill({ label, tone, icon }: { label: string; tone: Tone; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]} accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={12} color={c.fg} /> : null}
      <Text style={[styles.pillText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ── Progress bar ── */

/**
 * A 0–1 bar that animates to its new value. Call sites pass a value they got
 * from the server — the animation is a response to a confirmed change, never
 * a prediction of one. Reduced motion snaps instead.
 */
export function ProgressBar({ fraction, color = Colors.primary, height = 8, accessibilityLabel }: { fraction: number; color?: string; height?: number; accessibilityLabel?: string }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const anim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (reduced) {
      anim.setValue(clamped);
      return;
    }
    Animated.timing(anim, { toValue: clamped, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clamped, reduced, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

/* ── Pet hero ── */

/**
 * The companion, large and centred, on a soft disc. The sprite is the real
 * PetQuest asset and is never blurred or stretched (`contentFit="contain"`,
 * no downscaling). Idle motion is a slow 3.6 s float of a few points — off
 * under Reduce Motion.
 */
export function PetHero({
  sprite,
  accent,
  size = 160,
  accessibilityLabel,
  idle = true,
}: {
  sprite: ImageSourcePropType | null;
  accent: string;
  size?: number;
  accessibilityLabel: string;
  idle?: boolean;
}) {
  const reduced = useReducedMotion();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || !idle) {
      float.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, idle, float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const disc = Math.round(size * 0.9);

  return (
    <View style={[styles.heroWrap, { height: size + Spacing.md }]}>
      <View style={[styles.heroDisc, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: accent }]} />
      {sprite ? (
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Image
            source={sprite}
            style={{ width: size, height: size }}
            contentFit="contain"
            allowDownscaling={false}
            transition={200}
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
      ) : (
        <Text style={[styles.egg, { fontSize: size * 0.5 }]} accessibilityLabel={accessibilityLabel}>
          🥚
        </Text>
      )}
    </View>
  );
}

/* ── Skeleton ── */

/** Calm placeholder blocks while data loads. No spinner ring, no pulse. */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeleton, { height, width }, style]} accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  primary: {
    minHeight: TapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  primaryPressed: { backgroundColor: Colors.primaryPressed },
  primaryText: { color: Colors.onPrimary, fontSize: FontSize.md, fontWeight: '700' },

  secondary: {
    minHeight: TapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceElevated,
  },
  secondaryPressed: { backgroundColor: Colors.primaryTint },
  secondaryText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },

  textButton: { minHeight: TapTarget, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start' },
  textButtonLabel: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700' },
  pressedText: { opacity: 0.6 },
  disabled: { opacity: 0.45 },

  surface: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  sectionLabel: {
    color: Colors.inkMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.inkSoft, fontSize: FontSize.sm, fontWeight: '600' },
  chipTextSelected: { color: Colors.onPrimary },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: FontSize.xs, fontWeight: '700' },

  track: { width: '100%', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  fill: { height: '100%' },

  heroWrap: { alignItems: 'center', justifyContent: 'center' },
  heroDisc: { position: 'absolute', opacity: 0.35 },
  egg: { textAlign: 'center' },

  skeleton: { backgroundColor: Colors.surface, borderRadius: Radius.sm },
});
