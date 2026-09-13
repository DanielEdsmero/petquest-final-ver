import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import ScreenContainer from '@/components/ScreenContainer';
import { Card, PhaseNotice } from '@/components/states';
import { Colors, FontSize, Spacing } from '@/theme';

/**
 * Create a quest — the route exists so navigation can be walked end to end.
 *
 * The real form (title, evidence type, planned date, the period caps) and the
 * server-side validity check land in Phase 4B. Creation must stay
 * server-authoritative: the client never decides that a quest is accepted, and
 * the database trigger forces any direct insert to `pending_ai_review`.
 */
export default function CreateQuestScreen() {
  const router = useRouter();

  return (
    <ScreenContainer insetTop={false}>
      <Text style={styles.lead}>
        PetQuest checks whether your quest is specific, meaningful, and possible to verify. This
        helps keep the study fair.
      </Text>

      <Card title="Not wired up yet">
        <Text style={styles.body}>
          This screen is a navigation placeholder. Creating a quest will call the same
          server-side validity check the web app uses, so acceptance is never decided on the
          phone.
        </Text>
      </Card>

      <PhaseNotice
        phase="Phase 4B"
        items={[
          'Title, evidence type and planned finish date',
          'Difficulty and the weekly / 3-day caps',
          'Accepted, needs-clarification, rejected and awaiting-check results',
        ]}
      />

      <Text style={styles.hint} onPress={() => router.back()}>
        Go back
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  lead: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.md },
  body: { color: Colors.textSoft, fontSize: FontSize.sm, lineHeight: 20 },
  hint: {
    color: Colors.gold,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
});
