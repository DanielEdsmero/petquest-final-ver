import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** Wrap the content in a ScrollView. Off for screens that own a FlatList. */
  scroll?: boolean;
  /** Centre the content vertically (loading and empty states). */
  center?: boolean;
  /**
   * Pad for the top safe area. Off when a navigation header already occupies
   * that space — otherwise the content sits a header's height too low.
   */
  insetTop?: boolean;
  /**
   * Pad for the bottom safe area. Off inside the tab navigator: the tab bar
   * already sits above the home indicator and the scene is laid out above the
   * tab bar, so adding the inset again would double-pad.
   */
  insetBottom?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * The safe-area + keyboard wrapper every screen uses.
 *
 * Handles, in one place: the notch and the home indicator, the keyboard pushing
 * inputs out of view on iOS, a side gutter that keeps text off the screen edge,
 * and a max content width so the layout does not stretch on a Pro Max.
 *
 * Long lists must pass `scroll={false}` and render their own FlatList — nesting
 * a list inside a ScrollView breaks virtualisation.
 */
export default function ScreenContainer({
  children,
  scroll = true,
  center = false,
  insetTop = true,
  insetBottom = true,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: (insetTop ? insets.top : 0) + Spacing.md,
    paddingBottom: (insetBottom ? insets.bottom : 0) + Spacing.lg,
    // Side insets matter in landscape and on devices with a curved edge.
    paddingLeft: Math.max(insets.left, Spacing.md),
    paddingRight: Math.max(insets.right, Spacing.md),
  };

  const inner = (
    <View style={[styles.column, center && styles.center, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, styles.scrollContent, center && styles.center]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.root, padding]}>{inner}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgDeep },
  scrollContent: { flexGrow: 1 },
  center: { justifyContent: 'center' },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flex: 1,
  },
});
