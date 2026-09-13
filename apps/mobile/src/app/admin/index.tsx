import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Admin landing — a Phase 2 placeholder that exists to prove the role gate.
 *
 * The real validity queue, verification queue and research views are Phase 7,
 * and they read admin-only tables that RLS already restricts to `is_admin()`.
 */
export default function AdminHome() {
  const { profile } = useAuth();
  const router = useRouter();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.subtitle}>Signed in as {profile?.username ?? profile?.id ?? '—'}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Role gate</Text>
        <Text style={styles.body}>
          You can see this screen because your <Text style={styles.code}>profiles.role</Text> row
          says <Text style={styles.ok}>admin</Text>. A participant who reaches this route is
          redirected home, and Row Level Security refuses the underlying tables regardless of
          which screen asks.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coming in Phase 7</Text>
        {['Quest validity queue', 'Verification queue', 'Research data views'].map((item) => (
          <Text key={item} style={styles.listItem}>
            • {item}
          </Text>
        ))}
      </View>

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back to home"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>← Back</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: Colors.goldLight,
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.lg },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  body: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 20 },
  code: { color: Colors.goldLight },
  ok: { color: Colors.green, fontWeight: '700' },
  listItem: { color: Colors.textSoft, fontSize: FontSize.sm, paddingVertical: 2 },
  button: {
    marginTop: 'auto',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorderHi,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
