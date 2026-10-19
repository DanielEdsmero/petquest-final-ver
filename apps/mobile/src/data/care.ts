import { type CareAction, type CareResult } from '@/data/careModel';
import { supabase } from '@/lib/supabase';

/**
 * Feed / wash / play (Phase 8) — one RPC, `care_pet(p_action)`.
 *
 * The server debits the cost and raises the stat in a single transaction and
 * returns the new balance and stats. Nothing is written from here: the
 * profiles_economy_guard trigger would reject a direct write to
 * profiles.points from this client anyway.
 */
export async function carePet(action: CareAction): Promise<CareResult> {
  const { data, error } = await supabase.rpc('care_pet', { p_action: action });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) return { ok: false, error: 'network' };
    if (m.includes('jwt') || m.includes('expired')) return { ok: false, error: 'unauthenticated' };
    return { ok: false, error: error.message };
  }
  const r = (data ?? { ok: false, error: 'unknown' }) as CareResult;
  return r;
}
