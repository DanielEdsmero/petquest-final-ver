import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Card, PhaseNotice, Row } from '@/components/states';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Pet tab — the companion shell.
 *
 * The real sprite comes from the evolution asset set once `config/pets.js` is
 * ported in Phase 4F; today it shows the splash mark and whatever the profile
 * row already says, so nothing invents a stage the server has not reported.
 */
export default function PetTab() {
  const { profile } = useAuth();

  return (
    <ScreenContainer insetBottom={false}>
      <Text style={styles.title}>Your companion</Text>

      <View style={styles.heroCard}>
        <View style={styles.hero}>
          <View style={styles.glow} />
          <Image
            source={MASCOT}
            style={styles.mascot}
            contentFit="contain"
            allowDownscaling={false}
            accessibilityLabel="Your companion"
          />
        </View>
        <Text style={styles.petName}>{profile?.selected_pet_id ?? 'Not hatched yet'}</Text>
        <Text style={styles.petStage}>
          {profile?.pet_level ? `Level ${profile.pet_level}` : 'Hatch your egg on the web app'}
        </Text>
      </View>

      <Card title="Stats">
        <Row label="Hunger" value="—" />
        <Row label="Cleanliness" value="—" />
        <Row label="Happiness" value="—" />
      </Card>

      <PhaseNotice
        phase="Phase 4F"
        items={[
          'The real Dragon / Mystic Cat / Spirit Wolf sprite',
          'Live evolution stage and progress bar',
          'Feed, wash and play actions',
        ]}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  heroCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  hero: { alignItems: 'center', justifyContent: 'center', height: 150 },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.13,
  },
  mascot: { width: 132, height: 132 },
  petName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  petStage: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
});
