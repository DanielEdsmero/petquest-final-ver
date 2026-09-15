import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import ScreenContainer from '@/components/ScreenContainer';
import { Card } from '@/components/states';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Admin landing — the queue entry points.
 *
 * The queues themselves read admin-only tables that RLS already restricts to
 * `is_admin()`, so a participant who somehow reached these routes would see
 * empty lists and failed writes, not data.
 */
export default function AdminHome() {
  const { profile } = useAuth();
  const router = useRouter();

  return (
    <ScreenContainer insetTop={false}>
      <Text style={styles.subtitle}>Signed in as {profile?.username ?? profile?.id ?? '—'}</Text>

      <View style={styles.queueList}>
        <QueueLink
          icon="shield-checkmark-outline"
          title="Quest validity"
          body="Quests awaiting an AI check, and the decision log."
          onPress={() => router.push('/admin/validity')}
        />
        <QueueLink
          icon="camera-outline"
          title="Verification queue"
          body="Submitted evidence, AI verdicts and admin review."
          onPress={() => router.push('/admin/verification')}
        />
        <QueueLink
          icon="analytics-outline"
          title="Research data"
          body="Aggregate, anonymised study metrics."
          onPress={() => router.push('/admin/research')}
        />
      </View>

      <Card title="Role gate">
        <Text style={styles.body}>
          You can see this because your <Text style={styles.code}>profiles.role</Text> row says{' '}
          <Text style={styles.ok}>admin</Text>. A participant who reaches this route is
          redirected home, and Row Level Security refuses the underlying tables regardless of
          which screen asks.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

function QueueLink({
  icon,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.queueLink, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={Colors.gold} />
      <View style={styles.queueBody}>
        <Text style={styles.queueTitle}>{title}</Text>
        <Text style={styles.queueText}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  queueList: { gap: Spacing.sm, marginBottom: Spacing.md },
  queueLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.cardBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    minHeight: 64,
  },
  queueBody: { flex: 1 },
  queueTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  queueText: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  body: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 20 },
  code: { color: Colors.goldLight },
  ok: { color: Colors.green, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
