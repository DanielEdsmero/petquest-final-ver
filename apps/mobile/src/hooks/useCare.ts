import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { carePet } from '@/data/care';
import { CARE_ACTIONS, CARE_BOOST, CARE_COST, canAfford, careErrorMessage, careSuccessMessage, type CareAction, type CareStats } from '@/data/careModel';
import { STAT_META } from '@/data/petHomeModel';
import { type Reaction } from '@/data/spriteModel';

/**
 * The care flow, shared by the Pet tab and the View Pet screen so there is
 * exactly one implementation of the rule that matters:
 *
 *   confirm (cost + benefit) → care_pet() → show ONLY what the server returned
 *
 * `liveStats` / `livePoints` follow the fetched values passed in and are
 * overwritten by the RPC reply. On failure or insufficient points nothing
 * local changes except the notice. `reaction` is set only on `ok`, so the
 * sprite can never celebrate a care action the server refused.
 */
export function useCare({
  fetchedStats,
  statsLoading,
  profilePoints,
  petName,
  refreshProfile,
}: {
  fetchedStats: CareStats | null;
  statsLoading: boolean;
  profilePoints: number | null | undefined;
  petName: string | null;
  refreshProfile: () => Promise<void>;
}) {
  const [liveStats, setLiveStats] = useState<CareStats | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<CareAction | null>(null);
  /* A cosmetic reaction for the sprite — set ONLY after care_pet() replied ok. */
  const [reaction, setReaction] = useState<{ kind: Reaction; nonce: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  useEffect(() => {
    if (fetchedStats) setLiveStats({ hunger: fetchedStats.hunger, cleanliness: fetchedStats.cleanliness, happiness: fetchedStats.happiness });
    else if (!statsLoading) setLiveStats(null);
  }, [fetchedStats, statsLoading]);
  useEffect(() => {
    setLivePoints(typeof profilePoints === 'number' ? profilePoints : null);
  }, [profilePoints]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const runCare = useCallback(
    async (action: CareAction) => {
      if (busyAction) return; // a second tap while one is in flight does nothing
      setBusyAction(action);
      const r = await carePet(action);
      setBusyAction(null);
      if (typeof r.points === 'number') setLivePoints(r.points);
      if (!r.ok) {
        setNotice({ text: careErrorMessage(r.error), tone: 'bad' });
        return;
      }
      setLiveStats(r.stats);
      setReaction({ kind: action, nonce: Date.now() }); // the server said yes — now the pet may react
      const text = careSuccessMessage(action, petName);
      setNotice({ text, tone: 'ok' });
      AccessibilityInfo.announceForAccessibility(text);
      void refreshProfile(); // re-syncs the header balance from the server
    },
    [busyAction, petName, refreshProfile],
  );

  const confirmCare = useCallback(
    (action: CareAction) => {
      if (busyAction) return;
      if (!canAfford(livePoints)) {
        setNotice({ text: careErrorMessage('insufficient_points'), tone: 'bad' });
        return;
      }
      const a = CARE_ACTIONS.find((c) => c.key === action)!;
      const stat = STAT_META.find((s) => s.action === action)!;
      Alert.alert(
        `${a.label} ${petName ?? 'your companion'}?`,
        `Costs ${CARE_COST} points and raises ${stat.label} by up to ${CARE_BOOST}. The server settles it; you will see the real result.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `${a.label} · ${CARE_COST} pts`, onPress: () => void runCare(action) },
        ],
      );
    },
    [busyAction, livePoints, petName, runCare],
  );

  return { liveStats, livePoints, busyAction, reaction, notice, confirmCare };
}
