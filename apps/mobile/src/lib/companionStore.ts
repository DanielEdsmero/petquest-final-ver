import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { DND_KEY, guideKey } from '@/data/petCompanion';

/**
 * Two tiny flags kept on this phone: whether the tour has been seen (per account)
 * and "Do not disturb". Neither is study data, so they never go to the server.
 *
 * Storage can fail (the web build has no SecureStore, and a locked-down device may
 * refuse), so every call is wrapped: a failed read means "not set", a failed write
 * is ignored, and the app keeps working with an in-memory copy for the session.
 */
const memory = new Map<string, string>();

/* The web build (used for development) has no SecureStore, so it uses localStorage. Phones never take this branch. */
const webStore = (): Storage | null => {
  try {
    return Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

async function read(key: string): Promise<string | null> {
  const web = webStore();
  if (web) {
    try {
      return web.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  }
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null) memory.set(key, v);
    return v ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

async function write(key: string, value: string): Promise<void> {
  memory.set(key, value);
  const web = webStore();
  if (web) {
    try {
      web.setItem(key, value);
    } catch {
      /* kept in memory for this session */
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* kept in memory for this session */
  }
}

export const isGuideDone = async (userId: string | null | undefined) => (userId ? (await read(guideKey(userId))) === '1' : true);
export const markGuideDone = (userId: string | null | undefined) => (userId ? write(guideKey(userId), '1') : Promise.resolve());
export const readDnd = async () => (await read(DND_KEY)) === '1';
export const writeDnd = (on: boolean) => write(DND_KEY, on ? '1' : '0');
