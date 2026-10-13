import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withTimeout } from '../lib/supabase';
import {
  createIdSetStore,
  generateId,
  isUuid,
  mergeWithRemote,
  singleFlight,
  stripDeletedPrefix,
  DELETED_PREFIX,
} from '../lib/sync';
import { ProductionLog } from '../types';

const STORAGE_KEY = '@imperio_galletil_production_logs';
const TABLE = 'production_logs';

/**
 * Sample ids from the old hardcoded seed data. They were never real sales and
 * were being re-inserted on every sync, so they are discarded from the cache.
 */
const LEGACY_SEED_IDS = new Set(['1', '2']);

export const INITIAL_PRODUCTION_LOGS: ProductionLog[] = [];

const pendingLogs = createIdSetStore('@imperio_galletil_pending_production_logs');

export async function getCachedProductionLogs(): Promise<ProductionLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading production logs cache', err);
  }
  return [];
}

export async function setCachedProductionLogs(items: ProductionLog[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Error saving production logs cache', err);
  }
}

const DELETED_KEY = '@imperio_galletil_deleted_production_logs';

export async function getDeletedProductionLogIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading deleted production logs cache', err);
  }
  return [];
}

export async function addDeletedProductionLogId(id: string): Promise<void> {
  try {
    const current = await getDeletedProductionLogIds();
    if (!current.includes(id)) {
      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify([...current, id]));
    }
  } catch (err) {
    console.warn('Error saving deleted production log id', err);
  }
}

export async function removeDeletedProductionLogId(id: string): Promise<void> {
  try {
    const current = await getDeletedProductionLogIds();
    const filtered = current.filter((x) => x !== id);
    await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Error removing deleted production log id', err);
  }
}

export function isProductionLogDeleted(log: ProductionLog, deletedIds?: Set<string>): boolean {
  if (log.deleted || log.is_deleted) return true;
  if (typeof log.name === 'string' && log.name.startsWith(DELETED_PREFIX)) return true;
  if (deletedIds && deletedIds.has(log.id)) return true;
  return false;
}

/**
 * Detects legacy mock seed records that were inserted into the database during early setup.
 */
export function isLegacySeedLog(log: ProductionLog): boolean {
  if (LEGACY_SEED_IDS.has(log.id)) return true;
  const cleanName = stripDeletedPrefix(log.name).trim().toLowerCase();
  if (
    (cleanName === 'galletas clasicas' && Number(log.qty) === 40 && Number(log.price_ves) === 1000 && Math.abs(Number(log.cost_ves) - 286.93) < 0.5) ||
    (cleanName === 'brownie con galleta' && Number(log.qty) === 8 && Number(log.price_ves) === 2500 && Math.abs(Number(log.cost_ves) - 997.04) < 0.5)
  ) {
    return true;
  }
  return false;
}

/**
 * Deduplicates production logs:
 * If multiple logs have the exact same name, quantity, price, and unit cost within a 12-hour window,
 * they are rapid double-tap or re-sync artifacts and must be collapsed to exactly one record.
 */
export function dedupeProductionLogs(logs: ProductionLog[]): ProductionLog[] {
  const result: ProductionLog[] = [];
  for (const log of logs) {
    if (isProductionLogDeleted(log) || isLegacySeedLog(log)) continue;

    const isDup = result.some((existing) => {
      const sameContent =
        stripDeletedPrefix(existing.name).trim().toLowerCase() === stripDeletedPrefix(log.name).trim().toLowerCase() &&
        Number(existing.qty) === Number(log.qty) &&
        Number(existing.price_ves) === Number(log.price_ves) &&
        Number(existing.cost_ves) === Number(log.cost_ves);

      if (!sameContent) return false;
      if (!existing.created_at || !log.created_at) return true;
      const diffMs = Math.abs(new Date(existing.created_at).getTime() - new Date(log.created_at).getTime());
      return diffMs < 12 * 60 * 60 * 1000;
    });

    if (!isDup) {
      result.push(log);
    }
  }
  return result;
}

/** Content fingerprint used to recognize legacy local logs that already exist remotely. */
export function productionLogContentKey(log: ProductionLog): string {
  return [
    stripDeletedPrefix(log.name).trim().toLowerCase(),
    Number(log.qty),
    Number(log.price_ves),
    Number(log.cost_ves),
  ].join('|');
}

function fromRow(item: any): ProductionLog {
  return {
    id: String(item.id),
    name: item.name,
    qty: Number(item.qty),
    price_ves: Number(item.price_ves),
    cost_ves: Number(item.cost_ves),
    created_at: item.created_at,
  };
}

function toRow(log: ProductionLog) {
  return {
    id: log.id,
    name: log.name,
    qty: log.qty,
    price_ves: log.price_ves,
    cost_ves: log.cost_ves,
  };
}

/**
 * Idempotent save: the id is generated on the device, so retries never duplicate rows.
 * The id stays in the pending set until the server confirms the write.
 */
async function upsertProductionLog(log: ProductionLog): Promise<ProductionLog> {
  await pendingLogs.add(log.id);
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).upsert(toRow(log), { onConflict: 'id' }).select().single()
    );
    if (!error && data) {
      await pendingLogs.remove(log.id);
      return fromRow(data);
    }
    if (error) console.warn('Error upserting production log in Supabase', error);
  } catch (err) {
    console.warn('Error upserting production log in Supabase', err);
  }
  return log;
}

async function syncProductionLogs(): Promise<ProductionLog[]> {
  const deletedIdsSet = new Set(await getDeletedProductionLogIds());
  const localList = await getCachedProductionLogs();
  const activeLocalList = localList.filter((l) => !isProductionLogDeleted(l, deletedIdsSet) && !isLegacySeedLog(l));

  let remoteAll: ProductionLog[] | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).select('*').order('created_at', { ascending: false })
    );
    if (!error && Array.isArray(data)) {
      remoteAll = data.map(fromRow);
    } else if (error) {
      console.warn('Error fetching production logs from Supabase', error);
    }
  } catch (err) {
    console.warn('Error fetching production logs from Supabase', err);
  }

  if (!remoteAll) {
    return dedupeProductionLogs(activeLocalList);
  }

  const { merged, toUpsert } = mergeWithRemote({
    remote: remoteAll.filter((l) => !isProductionLogDeleted(l, deletedIdsSet) && !isLegacySeedLog(l)),
    remoteAll,
    local: activeLocalList,
    pendingIds: await pendingLogs.getAll(),
    contentKey: productionLogContentKey,
    discardLegacy: (l) => isLegacySeedLog(l),
    prependLocal: true,
    dedupeRemote: dedupeProductionLogs,
  });

  // Soft-delete any duplicate remote copies in the background so the cloud stays clean
  const seenRemoteContent = new Set<string>();
  const duplicateRemoteIds: string[] = [];
  for (const item of remoteAll) {
    if (isProductionLogDeleted(item, deletedIdsSet) || isLegacySeedLog(item)) continue;
    const key = productionLogContentKey(item);
    if (seenRemoteContent.has(key)) {
      duplicateRemoteIds.push(item.id);
    } else {
      seenRemoteContent.add(key);
    }
  }
  if (duplicateRemoteIds.length > 0) {
    for (const dupId of duplicateRemoteIds) {
      deleteProductionLogInBackend(dupId).catch(() => {});
    }
  }

  await pendingLogs.addMany(toUpsert.map((l) => l.id));
  await setCachedProductionLogs(merged);
  await Promise.allSettled(toUpsert.map(upsertProductionLog));

  return merged;
}

export const fetchProductionLogs = singleFlight(syncProductionLogs);

export async function addProductionLogInBackend(
  log: Omit<ProductionLog, 'id'> | ProductionLog
): Promise<ProductionLog> {
  const currentId = 'id' in log ? log.id : undefined;
  const withId: ProductionLog = { ...log, id: isUuid(currentId) ? currentId : generateId() };
  return upsertProductionLog(withId);
}

export async function updateProductionLogInBackend(log: ProductionLog): Promise<void> {
  if (!isUuid(log.id)) return; // legacy record, it will be migrated on next sync
  await upsertProductionLog(log);
}

export async function deleteProductionLogInBackend(id: string, log?: ProductionLog): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedProductionLogId(id);
  try {
    const name = log?.name || '';
    const newName = name.startsWith(DELETED_PREFIX) ? name : DELETED_PREFIX + name;
    const { error } = await supabase.from(TABLE).update({ name: newName }).eq('id', id);
    if (error) console.warn('Error soft deleting production log in Supabase', error);
  } catch (err) {
    console.warn('Error soft deleting production log in Supabase', err);
  }
}

export async function restoreProductionLogInBackend(id: string, log: ProductionLog): Promise<void> {
  await removeDeletedProductionLogId(id);
  try {
    const cleanName = stripDeletedPrefix(log.name);
    const { error } = await supabase.from(TABLE).update({ name: cleanName }).eq('id', id);
    if (error) console.warn('Error restoring production log in Supabase', error);
  } catch (err) {
    console.warn('Error restoring production log in Supabase', err);
  }
}
