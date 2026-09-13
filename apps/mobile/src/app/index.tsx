import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Env, missingEnvKeys, supabaseProjectRef } from '@/lib/env';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Phase 1 home screen — the branded shell.
 *
 * It deliberately does nothing but prove the app boots, the theme renders and
 * the public configuration is wired. No Supabase client, no auth, no quest data
 * yet; those are Phases 2 and 4.
 */
export default function HomeScreen() {
  const missing = missingEnvKeys();
  const ref = supabaseProjectRef();

  return (
    <ScreenContainer center>
      <View style={styles.hero}>
        <View style={styles.glow} />
        <Image
          source={MASCOT}
          style={styles.mascot}
          contentFit="contain"
          // Pixel art: keep the hard edges instead of smoothing them.
          allowDownscaling={false}
          transition={250}
          accessibilityLabel="Arcane Dragon"
        />
      </View>

      <Text style={styles.title}>PetQuest</Text>
      <Text style={styles.tagline}>Companion Chronicles</Text>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>Mobile shell · Phase 1</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Configuration</Text>

        {missing.length === 0 ? (
          <>
            <Row label="Supabase project" value={ref ?? 'custom host'} ok />
            <Row label="API base" value={hostOf(Env.apiBaseUrl)} ok />
            <Text style={styles.note}>
              Public values only. The service-role and Gemini keys stay on the server.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.warn}>Missing public environment values:</Text>
            {missing.map((k) => (
              <Text key={k} style={styles.missing}>
                • {k}
              </Text>
            ))}
            <Text style={styles.note}>
              Copy .env.example to .env, fill in the public values, then restart with
              {' '}
              <Text style={styles.code}>npx expo start -c</Text>.
            </Text>
          </>
        )}
      </View>

      <Text style={styles.footer}>Sign-in arrives in Phase 2.</Text>
    </ScreenContainer>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, ok && styles.rowValueOk]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Show only the host, never a full URL with a query string. */
function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1] : url || '—';
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 168,
    marginBottom: Spacing.sm,
  },
  glow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.14,
  },
  mascot: { width: 148, height: 148 },

  title: {
    color: Colors.goldLight,
    fontSize: FontSize.display,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  tagline: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  badge: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.45)',
  },
  badgeText: { color: '#a78bfa', fontSize: FontSize.xs, fontWeight: '700' },

  card: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  rowLabel: { color: Colors.textSoft, fontSize: FontSize.sm },
  rowValue: { color: Colors.textPrimary, fontSize: FontSize.sm, flexShrink: 1 },
  rowValueOk: { color: Colors.green },

  warn: { color: Colors.gold, fontSize: FontSize.sm, fontWeight: '700' },
  missing: { color: Colors.textSoft, fontSize: FontSize.sm, marginTop: 2 },
  note: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.sm, lineHeight: 16 },
  code: { color: Colors.goldLight },

  footer: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
