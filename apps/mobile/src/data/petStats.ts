import { supabase } from '@/lib/supabase';

/**
 * The companion's care stats, read from `pet_stats` (RLS: own row only).
 *
 * READ-ONLY on mobile, deliberately. The web client's feed / wash / play
 * actions raise a stat AND debit 10 points by writing `profiles.points`
 * straight from the browser — a hole supabase-schema.sql documents as a TODO
 * ("a determined user can still award themselves points by writing
 * profiles.points"). Reproducing that write on a second client would double
 * the surface of a known weakness, and the fix — a `spend_points()` RPC plus
 * `revoke update (points) on profiles` — is a migration that needs approval.
 * Until it exists, mobile shows the stats and sends care to the web.
 *
 * The web also DECAYS these client-side on a 30-minute timer while logged in.
 * Mobile does not run that timer, so the numbers here are whatever was last
 * written by any client.
 */

export type PetStats = {
  hunger: number;
  cleanliness: number;
  happiness: number;
  updated_at: string | null;
};

export async function fetchPetStats(userId: string): Promise<{ data: PetStats | null; error: string | null }> {
  const { data, error } = await supabase
    .from('pet_stats')
    .select('hunger, cleanliness, happiness, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error: friendly(error.message) };
  // A brand-new account may not have a row yet; that is "no stats", not an error.
  return { data: (data as unknown as PetStats | null) ?? null, error: null };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  return message;
}
