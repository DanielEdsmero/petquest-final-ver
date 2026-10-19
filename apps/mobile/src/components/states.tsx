import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * The four states every data screen needs, so each one looks the same wherever
 * it appears and Phase 4 has somewhere to plug real data in.
 *
 *   <LoadingState/>  — fetching
 *   <EmptyState/>    — the fetch worked and there is nothing to show
 *   <ErrorState/>    — the fetch failed, with a way to retry
 *   <Card/>          — the standard surface everything else sits on
 *
 * An empty list and a failed load are deliberately different components: telling
 * a participant "no quests yet" when the request actually failed sends them to
 * create a quest they may already have.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={Colors.primary} />
      <Text style={styles.mutedText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={28} color={Colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, styles.iconCircleError]}>
        <Ionicons name="alert-circle-outline" size={28} color={Colors.warning} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Row({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tint ? { color: tint } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Marks a screen whose real implementation lands in a later phase. */
export function PhaseNotice({ phase, items }: { phase: string; items: string[] }) {
  return (
    <Card title={`Coming in ${phase}`}>
      {items.map((item) => (
        <Text key={item} style={styles.listItem}>
          • {item}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryTint,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  iconCircleError: {
    backgroundColor: Colors.warningTint,
    borderColor: Colors.border,
  },
  title: {
    color: Colors.ink,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: Colors.inkMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  mutedText: { color: Colors.inkMuted, fontSize: FontSize.sm, textAlign: 'center' },

  primaryButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: Colors.onPrimary, fontSize: FontSize.md, fontWeight: '700' },
  secondaryButton: {
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceElevated,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.8 },

  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.inkMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  rowLabel: { color: Colors.inkMuted, fontSize: FontSize.sm },
  rowValue: { color: Colors.ink, fontSize: FontSize.sm, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listItem: { color: Colors.inkSoft, fontSize: FontSize.sm, paddingVertical: 2 },
});
