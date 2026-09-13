import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Card, PhaseNotice, Row } from '@/components/states';
import { Colors, FontSize, Radius, Spacing } from '@/theme';

/**
 * Quest detail — reached from the quest log.
 *
 * Phase 4C fills in the goal, priority, planned date, validity status, evidence
 * requirement and timing, and wires completion through `submit_completion`.
 * Points are never computed here: the RPC is the only thing that awards.
 */
export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <ScreenContainer insetTop={false}>
      <Card title="Quest">
        <Row label="Id" value={String(id ?? '—')} />
        <Row label="Status" value="—" />
        <Row label="Evidence" value="—" />
      </Card>

      <Pressable
        onPress={() => router.push({ pathname: '/quest/verify', params: { questId: String(id ?? '') } })}
        accessibilityRole="button"
        accessibilityLabel="Submit evidence for this quest"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>Submit evidence</Text>
      </Pressable>

      <PhaseNotice
        phase="Phase 4C"
        items={['Goal, priority and planned finish date', 'Validity status and cooldown', 'Completion through submit_completion']}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  buttonText: { color: '#1a0d00', fontSize: FontSize.md, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
