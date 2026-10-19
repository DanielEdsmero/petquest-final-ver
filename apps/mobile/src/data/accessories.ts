import { accessoryById, type AccessoryCategory, type EquippedMap } from '@/data/accessoryModel';
import { supabase } from '@/lib/supabase';

/**
 * Accessories — reads over `owned_accessories` and `equipped_accessories`,
 * and the one cosmetic write the participant may make: which OWNED item is
 * worn in a category.
 *
 * Both tables are the participant's own rows (`…: own all` RLS). Equipping is
 * cosmetic — it moves no points and touches no pet stat — and it is the same
 * write the web makes (`GameContext.equipAccessory`). Guard: this module only
 * ever writes an id that the server's own `owned_accessories` list contains,
 * so a locked item cannot be worn from here.
 *
 * PURCHASING IS NOT IMPLEMENTED ON MOBILE, deliberately. The web buys by
 * calling `spend_points()` and then inserting the `owned_accessories` row
 * from the browser — two calls, not one transaction, and the insert policy
 * would let a client insert a row without paying at all. Closing both needs
 * a `buy_accessory()` RPC (a migration), which is proposed in the phase
 * report, not done here. Until then the Accessories screen shows locked items
 * with their cost and sends purchases to the website.
 */

export async function fetchOwnedAccessories(userId: string): Promise<{ data: string[] | null; error: string | null }> {
  const { data, error } = await supabase.from('owned_accessories').select('accessory_id').eq('user_id', userId);
  if (error) return { data: null, error: friendly(error.message) };
  return { data: ((data ?? []) as unknown as { accessory_id: string }[]).map((r) => r.accessory_id), error: null };
}

export async function fetchEquippedAccessories(userId: string): Promise<{ data: EquippedMap | null; error: string | null }> {
  const { data, error } = await supabase.from('equipped_accessories').select('category, accessory_id').eq('user_id', userId);
  if (error) return { data: null, error: friendly(error.message) };
  const map: EquippedMap = {};
  for (const r of (data ?? []) as unknown as { category: AccessoryCategory; accessory_id: string }[]) map[r.category] = r.accessory_id;
  return { data: map, error: null };
}

/**
 * Wear an owned accessory in its category (replacing whatever was there).
 * `owned` is the list fetched from the server — the caller passes it so the
 * check happens against server truth, never against a local guess.
 */
export async function equipAccessory(userId: string, accessoryId: string, owned: string[]): Promise<{ error: string | null }> {
  const item = accessoryById(accessoryId);
  if (!item) return { error: 'Unknown accessory.' };
  if (!owned.includes(accessoryId)) return { error: 'You do not own this accessory yet.' };
  const { error } = await supabase
    .from('equipped_accessories')
    .upsert({ user_id: userId, category: item.category, accessory_id: accessoryId }, { onConflict: 'user_id,category' });
  return { error: error ? friendly(error.message) : null };
}

/** Take off whatever is worn in a category. */
export async function unequipCategory(userId: string, category: AccessoryCategory): Promise<{ error: string | null }> {
  const { error } = await supabase.from('equipped_accessories').delete().eq('user_id', userId).eq('category', category);
  return { error: error ? friendly(error.message) : null };
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (m.includes('jwt') || m.includes('expired')) return 'Your session expired — please sign in again.';
  return message;
}
