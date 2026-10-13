import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETED_PREFIX = '__DELETED__';

/**
 * Generates a client-side UUID v4. Records get their final id at creation time,
 * so retrying a save is idempotent (upsert on `id`) and never creates duplicates.
 */
export function generateId(): string {
  try {
    if (typeof Crypto?.randomUUID === 'function') {
      return Crypto.randomUUID();
    }
  } catch {}

  // RFC4122 v4 fallback in pure JS (safe across any JS runtime / build state)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

export function stripDeletedPrefix(value: string | null | undefined): string {
  return (value || '').replace(/^__DELETED__/, '');
}

/**
 * Persistent set of ids stored in AsyncStorage.
 * Writes are serialized so concurrent add/remove calls never overwrite each other.
 */
export interface IdSetStore {
  getAll(): Promise<Set<string>>;
  add(id: string): Promise<void>;
  addMany(ids: string[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createIdSetStore(storageKey: string): IdSetStore {
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch (err) {
      console.warn(`Error reading id set ${storageKey}`, err);
    }
    return new Set();
  };

  const mutate = (fn: (ids: Set<string>) => void): Promise<void> => {
    const next = queue.then(async () => {
      const ids = await read();
      fn(ids);
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify([...ids]));
      } catch (err) {
        console.warn(`Error saving id set ${storageKey}`, err);
      }
    });
    queue = next.catch(() => {});
    return next;
  };

  return {
    getAll: () => queue.then(read, read),
    add: (id) => mutate((ids) => ids.add(id)),
    addMany: (newIds) => mutate((ids) => newIds.forEach((id) => ids.add(id))),
    remove: (id) => mutate((ids) => ids.delete(id)),
  };
}

/**
 * Wraps an async function so concurrent callers share the same in-flight promise
 * instead of running the sync twice in parallel.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

export interface MergeOptions<T extends { id: string }> {
  /** Active (non deleted) remote records. The server is the source of truth. */
  remote: T[];
  /** Every remote record, including soft deleted ones. Used to match legacy local records. */
  remoteAll: T[];
  /** Active (non deleted) local cached records. */
  local: T[];
  /** Ids of local records with changes that have not reached the server yet. */
  pendingIds: Set<string>;
  /** Content key used to detect if a legacy (non UUID) local record already exists remotely. */
  contentKey: (item: T) => string;
  /** Legacy local records that must be discarded instead of uploaded (e.g. sample seed data). */
  discardLegacy?: (item: T) => boolean;
  /** How to combine a remote record with its local copy when there are no pending local changes. */
  combine?: (remoteItem: T, localItem: T | undefined) => T;
  /** Put local-only records before remote ones (newest first lists). */
  prependLocal?: boolean;
}

export interface MergeResult<T> {
  merged: T[];
  /** Records that must be upserted to the server. */
  toUpsert: T[];
}

/**
 * Merges remote and local records without ever creating duplicates:
 * - Remote records win, unless the local copy has pending changes.
 * - Local UUID records missing remotely are kept (and re-upserted) only while pending.
 *   Otherwise they were deleted elsewhere and are dropped from the cache.
 * - Legacy local records (temp_/local_/seed ids) are dropped if the server already has
 *   equivalent content, otherwise they get a fresh UUID and are uploaded exactly once.
 */
export function mergeWithRemote<T extends { id: string }>(options: MergeOptions<T>): MergeResult<T> {
  const { remote, remoteAll, local, pendingIds, contentKey, discardLegacy, combine, prependLocal } = options;

  const remoteIds = new Set(remote.map((r) => r.id));
  const knownContent = new Set(remoteAll.map(contentKey));
  const localById = new Map(local.map((l) => [l.id, l]));
  const toUpsert: T[] = [];

  const merged: T[] = remote.map((remoteItem) => {
    const localItem = localById.get(remoteItem.id);
    if (localItem && pendingIds.has(localItem.id)) {
      toUpsert.push(localItem);
      return localItem;
    }
    return combine ? combine(remoteItem, localItem) : remoteItem;
  });

  const localOnly: T[] = [];
  for (const localItem of local) {
    if (remoteIds.has(localItem.id)) continue;

    if (!isUuid(localItem.id)) {
      if (discardLegacy?.(localItem)) continue;
      const key = contentKey(localItem);
      if (knownContent.has(key)) continue;
      knownContent.add(key); // collapse duplicated legacy copies inside the cache itself
      const migrated = { ...localItem, id: generateId() };
      localOnly.push(migrated);
      toUpsert.push(migrated);
      continue;
    }

    if (pendingIds.has(localItem.id)) {
      localOnly.push(localItem);
      toUpsert.push(localItem);
    }
    // Not pending and not on the server: it was removed remotely, drop it.
  }

  return {
    merged: prependLocal ? [...localOnly, ...merged] : [...merged, ...localOnly],
    toUpsert,
  };
}
