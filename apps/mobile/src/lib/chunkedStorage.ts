/**
 * Chunked key/value storage — the pure half, with no React Native imports, so
 * it can be unit-tested under `node --test`.
 *
 * WHY THIS EXISTS
 * `expo-secure-store` refuses (and warns about) values over 2048 bytes, but a
 * Supabase session — access JWT + refresh token + the serialised user object —
 * routinely runs 2–4 KB. Storing it whole either warns today or throws in a
 * future SDK, and a silently-dropped write means the participant is logged out
 * every time they reopen the app.
 *
 * So a value is split across several keychain entries:
 *
 *   "<key>"     → a manifest, `{"__chunks":N,"len":BYTES}`
 *   "<key>.0"   → first slice
 *   "<key>.1"   → …
 *
 * The manifest sits under the caller's own key, so a read of an absent key
 * still returns null and nothing else has to know chunking happened.
 *
 * Chunks are sized in BYTES, not characters: the 2048 limit is on the encoded
 * value, and a JWT is ASCII but a username may not be. Splitting must never cut
 * a multi-byte character in half, so we measure candidate slices with
 * TextEncoder and step back until one fits.
 */

export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/**
 * Bytes per chunk. Comfortably under SecureStore's 2048 so the manifest, the
 * key name and any platform overhead have room.
 */
export const CHUNK_BYTES = 1536;

/** Manifest written under the caller's key. */
type Manifest = { __chunks: number; len: number };

const encoder = new TextEncoder();

export const byteLength = (s: string): number => encoder.encode(s).length;

/**
 * Split a string into slices that each encode to at most `maxBytes`, never
 * splitting a surrogate pair or a multi-byte character.
 */
export function splitByBytes(value: string, maxBytes: number = CHUNK_BYTES): string[] {
  if (maxBytes <= 0) throw new RangeError('maxBytes must be positive');
  if (value === '') return [''];

  const chunks: string[] = [];
  let index = 0;

  while (index < value.length) {
    // Start optimistically: one byte per character is the best case.
    let take = Math.min(maxBytes, value.length - index);
    let slice = value.slice(index, index + take);

    while (byteLength(slice) > maxBytes) {
      // Overshoot in bytes — shrink proportionally, then walk down one at a time.
      const ratio = maxBytes / byteLength(slice);
      const next = Math.max(1, Math.floor(take * ratio));
      take = next < take ? next : take - 1;
      slice = value.slice(index, index + take);
    }

    // Never end a slice on a lone high surrogate.
    const last = slice.charCodeAt(slice.length - 1);
    if (last >= 0xd800 && last <= 0xdbff && index + take < value.length && take > 1) {
      take -= 1;
      slice = value.slice(index, index + take);
    }

    chunks.push(slice);
    index += take;
  }

  return chunks;
}

function parseManifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Manifest).__chunks === 'number' &&
      (parsed as Manifest).__chunks > 0
    ) {
      return parsed as Manifest;
    }
  } catch {
    /* Not a manifest — an older plain value. Fall through. */
  }
  return null;
}

const chunkKey = (key: string, i: number) => `${key}.${i}`;

/**
 * Wrap a key/value store so arbitrarily long values survive a per-entry size
 * limit. The returned object is the shape `supabase-js` expects for
 * `auth.storage`.
 */
export function createChunkedStorage(store: KeyValueStore, maxBytes: number = CHUNK_BYTES) {
  async function clearChunks(key: string, count: number): Promise<void> {
    const deletions: Promise<void>[] = [];
    for (let i = 0; i < count; i++) deletions.push(store.deleteItemAsync(chunkKey(key, i)));
    await Promise.all(deletions);
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const head = await store.getItemAsync(key);
      const manifest = parseManifest(head);
      // A value small enough to have been written whole (or by an older build).
      if (!manifest) return head;

      const parts: string[] = [];
      for (let i = 0; i < manifest.__chunks; i++) {
        const part = await store.getItemAsync(chunkKey(key, i));
        // A missing chunk means the entry is torn — treat the whole value as
        // absent rather than handing back a truncated session.
        if (part == null) return null;
        parts.push(part);
      }
      const joined = parts.join('');
      if (typeof manifest.len === 'number' && byteLength(joined) !== manifest.len) return null;
      return joined;
    },

    async setItem(key: string, value: string): Promise<void> {
      // Drop any chunks left by a previous, longer value before rewriting.
      const previous = parseManifest(await store.getItemAsync(key));
      if (previous) await clearChunks(key, previous.__chunks);

      if (byteLength(value) <= maxBytes) {
        // Small enough to store whole — but it must not be mistaken for a
        // manifest on the way back out.
        if (parseManifest(value)) {
          const chunks = splitByBytes(value, maxBytes);
          await writeChunks(key, value, chunks);
          return;
        }
        await store.setItemAsync(key, value);
        return;
      }

      await writeChunks(key, value, splitByBytes(value, maxBytes));
    },

    async removeItem(key: string): Promise<void> {
      const manifest = parseManifest(await store.getItemAsync(key));
      if (manifest) await clearChunks(key, manifest.__chunks);
      await store.deleteItemAsync(key);
    },
  };

  async function writeChunks(key: string, value: string, chunks: string[]): Promise<void> {
    // Chunks first, manifest last: if the write is interrupted, the manifest
    // is absent or stale rather than pointing at slices that do not exist.
    for (let i = 0; i < chunks.length; i++) await store.setItemAsync(chunkKey(key, i), chunks[i]);
    const manifest: Manifest = { __chunks: chunks.length, len: byteLength(value) };
    await store.setItemAsync(key, JSON.stringify(manifest));
  }
}

export type ChunkedStorage = ReturnType<typeof createChunkedStorage>;
