import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { PetSprite } from '@/components/PetSprite';
import { ProgressBar } from '@/components/ui';
import { type PetHome } from '@/data/petHomeModel';
import { type FrameSet } from '@/data/spriteFrames';
import { type Reaction } from '@/data/spriteModel';
import useReducedMotion from '@/hooks/useReducedMotion';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/theme';

/**
 * The selected companion inside its own environment.
 *
 * The home image sits behind the pet sprite in a 4:3 card; the sprite is the
 * real evolution asset (`contentFit="contain"`, never downscaled) and floats a
 * few points, unless Reduce Motion is on. When the home changes — the
 * participant hatched or switched companions on the web — the previous image
 * fades out and the new one fades in, so the pet and its home change
 * together. The level line is server data (`pet_level`,
 * `total_points_earned`); nothing here is computed from a local award.
 *
 * With `walking` set (a baby companion, whose sheet frames exist) the static
 * portrait is replaced by the walking sprite (PetSprite), which strolls the
 * home's walkable strip. Older stages keep their evolution portrait — the
 * supplied sheets are baby art, and a walking baby under an Elder's name
 * would be a lie.
 */
export function PetHomeHero({
  home,
  homeImage,
  sprite,
  petName,
  stageLabel,
  levelLine,
  fraction,
  accessoryEmojis = [],
  compact = false,
  walking = null,
}: {
  home: PetHome;
  homeImage: ImageSourcePropType;
  sprite: ImageSourcePropType | null;
  petName: string;
  stageLabel: string | null;
  /** "1,240 / 1,500 · 260 to Elder", or null when not loaded. */
  levelLine: string | null;
  /** 0–1 for the evolution bar, or null when not loaded. */
  fraction: number | null;
  /** Equipped accessory glyphs, shown beside the pet. */
  accessoryEmojis?: string[];
  compact?: boolean;
  /** Walking-sprite mode: the frame set for the companion and an optional care reaction to play. */
  walking?: { frames: FrameSet; reaction?: { kind: Reaction; nonce: number } | null } | null;
}) {
  const reduced = useReducedMotion();
  const float = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState({ home, homeImage });

  // Idle float — a slow 3.6 s breath. Off under Reduce Motion.
  useEffect(() => {
    if (reduced) {
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
  }, [reduced, float]);

  // Cross-fade to a new home. Only fires when the home id actually changes.
  useEffect(() => {
    if (shown.home.id === home.id) return;
    if (reduced) {
      setShown({ home, homeImage });
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShown({ home, homeImage });
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }, [home, homeImage, shown.home.id, reduced, fade]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const spriteSize = compact ? 120 : 150;

  return (
    <View style={[styles.card, { backgroundColor: shown.home.palette.background }, Shadow.card]}>
      <Animated.View style={[styles.scene, compact && styles.sceneCompact, { opacity: fade }]}>
        <Image
          source={shown.homeImage}
          style={styles.scenery}
          contentFit="cover"
          contentPosition="center"
          transition={0}
          accessibilityLabel={`${shown.home.displayName}: ${shown.home.blurb}`}
        />
        {walking ? (
          <>
            <PetSprite
              home={shown.home.id}
              frames={walking.frames}
              reaction={walking.reaction ?? null}
              size={compact ? 56 : 64}
              accessibilityLabel={`${petName}${stageLabel ? `, ${stageLabel} stage` : ''}, walking around ${shown.home.displayName}`}
            />
            {accessoryEmojis.length > 0 && (
              <Text style={styles.accessoriesCorner} accessibilityLabel={`Wearing ${accessoryEmojis.length} accessories`}>
                {accessoryEmojis.join(' ')}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.stage}>
            <Animated.View style={{ transform: [{ translateY }] }}>
              {sprite ? (
                <Image
                  source={sprite}
                  style={{ width: spriteSize, height: spriteSize }}
                  contentFit="contain"
                  allowDownscaling={false}
                  transition={200}
                  accessibilityLabel={`${petName}${stageLabel ? `, ${stageLabel} stage` : ''}, at home in ${shown.home.displayName}`}
                />
              ) : (
                <Text style={styles.egg} accessibilityLabel="No companion yet">
                  🥚
                </Text>
              )}
            </Animated.View>
            {accessoryEmojis.length > 0 && (
              <Text style={styles.accessories} accessibilityLabel={`Wearing ${accessoryEmojis.length} accessories`}>
                {accessoryEmojis.join(' ')}
              </Text>
            )}
          </View>
        )}
        <View style={[styles.homeTag, { backgroundColor: shown.home.palette.surface }]}>
          <Text style={[styles.homeTagText, { color: shown.home.palette.accent }]} numberOfLines={1}>
            {shown.home.displayName}
          </Text>
        </View>
      </Animated.View>

      <View style={styles.caption}>
        <Text style={styles.petName} numberOfLines={1}>
          {petName}
          {stageLabel ? <Text style={styles.stage_}> · {stageLabel}</Text> : null}
        </Text>
        {fraction != null ? (
          <View style={styles.bar}>
            <ProgressBar fraction={fraction} height={6} color={shown.home.palette.accent} accessibilityLabel={levelLine ?? undefined} />
          </View>
        ) : null}
        <Text style={styles.levelLine} numberOfLines={1}>
          {levelLine ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  scene: { width: '100%', aspectRatio: 4 / 3, maxHeight: 260, overflow: 'hidden' },
  sceneCompact: { aspectRatio: 16 / 10, maxHeight: 200 },
  scenery: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: Spacing.sm },
  egg: { fontSize: 72 },
  accessories: { fontSize: 18, marginTop: -4, letterSpacing: 2 },
  accessoriesCorner: { position: 'absolute', right: Spacing.sm, bottom: Spacing.sm, fontSize: 18, letterSpacing: 2 },
  homeTag: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  homeTagText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.4 },

  caption: { padding: Spacing.md, backgroundColor: Colors.surfaceElevated, gap: Spacing.xs },
  petName: { color: Colors.ink, fontSize: FontSize.lg, fontWeight: '700' },
  stage_: { color: Colors.inkMuted, fontWeight: '500' },
  bar: { marginTop: 2 },
  levelLine: { color: Colors.inkMuted, fontSize: FontSize.xs },
});
