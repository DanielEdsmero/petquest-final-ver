import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { validateCredentials } from '@/auth/guards';
import ScreenContainer from '@/components/ScreenContainer';
import { isEnvConfigured, missingEnvKeys } from '@/lib/env';
import { Colors, FontSize, PetAccents, Radius, Spacing } from '@/theme';

const MASCOT = require('@/assets/images/splash-icon.png');

/**
 * Sign in.
 *
 * Email + password only, matching the web client — there is no OAuth provider
 * configured, so no deep link is involved. Registration and email confirmation
 * stay on the web for now (Phase 1 decision); a new participant signs up in a
 * browser and then signs in here.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = isEnvConfigured();
  const canSubmit = !busy && configured && email.trim().length > 0 && password.length > 0;

  const onSubmit = async () => {
    if (busy) return;
    const invalid = validateCredentials(email, password);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setBusy(true);
    const { error: authError } = await signIn(email, password);
    // On success the auth listener swaps the route out from under this screen;
    // clearing `busy` is only needed for the failure path, and is harmless
    // either way.
    setBusy(false);
    if (authError) setError(authError);
  };

  return (
    <ScreenContainer center>
      <View style={styles.hero}>
        <View style={styles.glow} />
        <Image
          source={MASCOT}
          style={styles.mascot}
          contentFit="contain"
          allowDownscaling={false}
          accessibilityLabel="Arcane Dragon"
        />
      </View>

      <Text style={styles.title}>PetQuest</Text>
      <Text style={styles.subtitle}>Sign in to continue your quest</Text>

      {!configured && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerTitle}>Not configured</Text>
          <Text style={styles.bannerBody}>
            Missing {missingEnvKeys().join(', ')}. Copy .env.example to .env and restart with
            npx expo start -c.
          </Text>
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={Colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          editable={!busy}
          accessibilityLabel="Email"
        />

        <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (error) setError(null);
          }}
          placeholder="••••••••"
          placeholderTextColor={Colors.inkFaint}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          editable={!busy}
          accessibilityLabel="Password"
        />

        {error && (
          <View style={[styles.banner, styles.bannerError]} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityState={{ disabled: !canSubmit, busy }}
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && canSubmit && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.footer}>
        New here? Create your account on the PetQuest website and confirm your email, then sign
        in with it above.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', justifyContent: 'center', height: 132 },
  glow: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: Radius.pill,
    backgroundColor: PetAccents.dragon,
    opacity: 0.35,
  },
  mascot: { width: 112, height: 112 },

  title: {
    color: Colors.ink,
    fontSize: FontSize.xl + 2,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: Colors.inkMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },

  form: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  label: {
    color: Colors.inkMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  labelSpaced: { marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    color: Colors.ink,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    // A 48pt target is comfortable to tap and leaves room for large text.
    paddingVertical: 12,
    minHeight: 48,
  },

  banner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  bannerWarn: {
    backgroundColor: Colors.accentWarmTint,
    borderColor: Colors.accentWarm,
    marginBottom: Spacing.md,
  },
  bannerError: {
    backgroundColor: Colors.warningTint,
    borderColor: Colors.warning,
  },
  bannerTitle: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '700' },
  bannerBody: { color: Colors.inkSoft, fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  errorText: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '600' },

  button: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { backgroundColor: Colors.primaryPressed },
  buttonText: { color: Colors.onPrimary, fontSize: FontSize.md, fontWeight: '700' },

  footer: {
    color: Colors.inkMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 17,
  },
});
