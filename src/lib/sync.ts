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
