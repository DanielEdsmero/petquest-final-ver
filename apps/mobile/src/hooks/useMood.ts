import { useEffect, useRef, useState } from 'react';

import { type CareStats } from '@/data/careModel';
import { nextDialogue, resolveMood, type Dialogue, type Mood, type MoodState } from '@/data/moodModel';
import { type PetId } from '@/data/petModel';

/**
 * The companion's presentation state for a screen: the mood (with hysteresis
 * and a cooldown, so a stat hovering at a threshold cannot flicker it) and
 * the one line of dialogue currently allowed (with its own cooldown, so a
 * re-render or a focus event never spams the bubble).
 *
 * Inputs are the server's stats — the fetched row or a `care_pet()` reply.
 * `event` lets a screen inject a server-confirmed moment ("verified") once;
 * it is shown immediately, bypassing the cooldown, and never repeated for
 * the same nonce.
 */
export function useMood(
  stats: CareStats | null,
  petId: PetId | null,
  event: { kind: 'verified' | 'greet'; nonce: number } | null = null,
): { mood: Mood; message: string | null } {
  const [moodState, setMoodState] = useState<MoodState | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const lastEvent = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    setMoodState((prev) => resolveMood(prev, stats, now));
  }, [stats]);

  const mood = moodState?.mood ?? 'balanced';

  useEffect(() => {
    const now = Date.now();
    if (event && event.nonce !== lastEvent.current) {
      lastEvent.current = event.nonce;
      setDialogue((prev) => nextDialogue(prev, event.kind, petId, now, Math.random, true));
      return;
    }
    setDialogue((prev) => nextDialogue(prev, mood, petId, now, Math.random));
  }, [mood, petId, event]);

  return { mood, message: dialogue?.text ?? null };
}
