import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Card, PhaseNotice, Row } from '@/components/states';
import { Colors, FontSize, Spacing } from '@/theme';

/**
 * Evidence submission — the camera, the progress log and the verification
 * waypoints land in Phases 4D and 4E.
 *
 * The web client captures a frame with getUserMedia and a canvas; on mobile
 * that becomes expo-image-picker plus a compression step, and the blank-frame
 * guard falls back to the server-side size check in api/verify.js
 * (MOBILE_MIGRATION_MAP.md §5).
 */
export default function VerifyQuestScreen() {
  const { questId } = useLocalSearchParams<{ questId?: string }>();

  return (
    <ScreenContainer insetTop={false}>
      <Card title="Evidence">
        <Row label="Quest" value={questId ? String(questId) : 'none selected'} />
      </Card>

      <Text style={styles.body}>
        Submitted → AI checking → Admin review if needed → Approved or rejected. The verdict is
        written server-side; the phone never marks its own quest as verified.
      </Text>

      <PhaseNotice
        phase="Phase 4D / 4E"
        items={['Camera and library capture', 'Image compression before upload', 'Live verification progress']}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    color: Colors.textSoft,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
});
