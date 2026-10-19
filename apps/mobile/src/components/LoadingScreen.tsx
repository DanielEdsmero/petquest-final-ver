import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Shown while the stored session is being restored from the keychain.
 *
 * Deliberately plain: the mandatory mascot wake-up sequence is Phase 6, and
 * putting a 4.2-second animation here before authentication even works would
 * make every debug cycle slower. This is the placeholder it replaces.
 */
export default function LoadingScreen({ message = 'Restoring your session…' }: { message?: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.glow} />
        <Image
          source={MASCOT}
          style={styles.mascot}
          contentFit="contain"
          allowDownscaling={false}
          accessibilityLabel="PetQuest"
        />
      </View>
      <ActivityIndicator color={Colors.primary} />
      <Text style={styles.text} accessibilityRole="text">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
  },
  hero: { alignItems: 'center', justifyContent: 'center', height: 130 },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.35,
  },
  mascot: { width: 112, height: 112 },
  text: { color: Colors.inkMuted, fontSize: FontSize.sm, textAlign: 'center' },
});
