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
import { Debt } from '../types';

const STORAGE_KEY = '@imperio_galletil_debts';
const TABLE = 'debts';
export const AUTO_PURGE_DAYS = 30;

export const INITIAL_DEBTS: Debt[] = [];

const pendingDebts = createIdSetStore('@imperio_galletil_pending_debts');

export async function getCachedDebts(): Promise<Debt[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading debts cache', err);
  }
  return [];
}

export async function setCachedDebts(items: Debt[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Error saving debts cache', err);
  }
}

export function purgeOldDebts(items: Debt[]): { valid: Debt[]; expiredIds: string[] } {
  const now = new Date();
  const valid: Debt[] = [];
  const expiredIds: string[] = [];

  for (const item of items) {
    if (item.paid) {
      const paidStr = item.paid_date || item.debt_date;
      const paidDate = new Date(paidStr);
      const diffMs = Math.abs(now.getTime() - paidDate.getTime());
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= AUTO_PURGE_DAYS) {
        expiredIds.push(item.id);
        continue;
      }
    }
    valid.push(item);
  }

  return { valid, expiredIds };
}

const DELETED_KEY = '@imperio_galletil_deleted_debts';

export async function getDeletedDebtIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error reading deleted debts cache', err);
  }
  return [];
}

export async function addDeletedDebtId(id: string): Promise<void> {
  try {
    const current = await getDeletedDebtIds();
    if (!current.includes(id)) {
      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify([...current, id]));
    }
  } catch (err) {
    console.warn('Error saving deleted debt id', err);
  }
}

export async function removeDeletedDebtId(id: string): Promise<void> {
  try {
    const current = await getDeletedDebtIds();
    const filtered = current.filter((x) => x !== id);
    await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Error removing deleted debt id', err);
  }
}

export function isDebtDeleted(debt: Debt, deletedIds?: Set<string>): boolean {
  if (debt.deleted || debt.is_deleted) return true;
  if (typeof debt.note === 'string' && debt.note.startsWith(DELETED_PREFIX)) return true;
  if (typeof debt.name === 'string' && debt.name.startsWith(DELETED_PREFIX)) return true;
  if (deletedIds && deletedIds.has(debt.id)) return true;
  return false;
}

/** Content fingerprint used to recognize legacy local debts that already exist remotely. */
export function debtContentKey(debt: Debt): string {
  return [
    stripDeletedPrefix(debt.name).trim().toLowerCase(),
    Number(debt.amount),
    debt.debt_date,
    stripDeletedPrefix(debt.note).trim(),
  ].join('|');
}

function fromRow(item: any): Debt {
  return {
    id: String(item.id),
    name: item.name,
    amount: Number(item.amount),
    debt_date: item.debt_date,
    note: item.note || '',
    paid: !!item.paid,
    paid_date: item.paid_date,
    created_at: item.created_at,
  };
}

function toRow(debt: Debt) {
  return {
    id: debt.id,
    name: debt.name,
    amount: debt.amount,
    debt_date: debt.debt_date,
    note: debt.note || '',
    paid: debt.paid,
    paid_date: debt.paid_date || null,
  };
}

/**
 * Idempotent save: the id is generated on the device, so retries never duplicate rows.
 * The id stays in the pending set until the server confirms the write.
 */
async function upsertDebt(debt: Debt): Promise<Debt> {
  await pendingDebts.add(debt.id);
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).upsert(toRow(debt), { onConflict: 'id' }).select().single()
    );
    if (!error && data) {
      await pendingDebts.remove(debt.id);
      return fromRow(data);
    }
    if (error) console.warn('Error upserting debt in Supabase', error);
  } catch (err) {
    console.warn('Error upserting debt in Supabase', err);
  }
  return debt;
}

export function dedupeDebts(debts: Debt[]): Debt[] {
  const result: Debt[] = [];
  for (const d of debts) {
    if (isDebtDeleted(d)) continue;
    const isDup = result.some((existing) => {
      const same =
        stripDeletedPrefix(existing.name).trim().toLowerCase() === stripDeletedPrefix(d.name).trim().toLowerCase() &&
        Number(existing.amount) === Number(d.amount) &&
        existing.debt_date === d.debt_date &&
        stripDeletedPrefix(existing.note || '').trim().toLowerCase() === stripDeletedPrefix(d.note || '').trim().toLowerCase();
      if (!same) return false;
      if (!existing.created_at || !d.created_at) return true;
      const diffMs = Math.abs(new Date(existing.created_at).getTime() - new Date(d.created_at).getTime());
      return diffMs < 12 * 60 * 60 * 1000;
    });
    if (!isDup) result.push(d);
  }
  return result;
}

async function syncDebts(): Promise<Debt[]> {
  const deletedIdsSet = new Set(await getDeletedDebtIds());
  const localDebts = await getCachedDebts();
  const activeLocalDebts = localDebts.filter((d) => !isDebtDeleted(d, deletedIdsSet));

  let remoteAll: Debt[] | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).select('*').order('created_at', { ascending: false })
    );
    if (!error && Array.isArray(data)) {
      remoteAll = data.map(fromRow);
    } else if (error) {
      console.warn('Error fetching debts from Supabase', error);
    }
  } catch (err) {
    console.warn('Error fetching debts from Supabase, preserving local cache', err);
  }

  // If remote fetch failed, preserve and return local cache
  if (!remoteAll) {
    const { valid } = purgeOldDebts(dedupeDebts(activeLocalDebts));
    await setCachedDebts(valid);
    return valid;
  }

  const { merged, toUpsert } = mergeWithRemote({
    remote: remoteAll.filter((d) => !isDebtDeleted(d, deletedIdsSet)),
    remoteAll,
    local: activeLocalDebts,
    pendingIds: await pendingDebts.getAll(),
    contentKey: debtContentKey,
    prependLocal: true,
    dedupeRemote: dedupeDebts,
  });

  // Soft-delete duplicate remote debts in the background
  const seenDebts = new Set<string>();
  const duplicateDebtIds: string[] = [];
  for (const item of remoteAll) {
    if (isDebtDeleted(item, deletedIdsSet)) continue;
    const key = debtContentKey(item);
    if (seenDebts.has(key)) {
      duplicateDebtIds.push(item.id);
    } else {
      seenDebts.add(key);
    }
  }
  if (duplicateDebtIds.length > 0) {
    for (const dupId of duplicateDebtIds) {
      deleteDebtInBackend(dupId).catch(() => {});
    }
  }

  // Auto-purge debts older than 30 days
  const { valid, expiredIds } = purgeOldDebts(merged);

  await pendingDebts.addMany(toUpsert.map((d) => d.id));
  await setCachedDebts(valid);

  await Promise.allSettled(toUpsert.map(upsertDebt));
  // Clean up expired debts in background
  for (const expId of expiredIds) {
    deleteDebtInBackend(expId, merged.find((d) => d.id === expId)).catch(() => {});
  }

  return valid;
}

export const fetchDebts = singleFlight(syncDebts);

export async function deleteDebtInBackend(id: string, debt?: Debt): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedDebtId(id);
  try {
    const note = debt?.note || '';
    const newNote = note.startsWith(DELETED_PREFIX) ? note : DELETED_PREFIX + note;
    const { error } = await supabase.from(TABLE).update({ note: newNote }).eq('id', id);
    if (error) console.warn('Error soft deleting debt in Supabase', error);
  } catch (err) {
    console.warn('Error soft deleting debt in Supabase', err);
  }
}

export async function saveDebtInBackend(debt: Omit<Debt, 'id'> | Debt): Promise<Debt> {
  const currentId = 'id' in debt ? debt.id : undefined;
  const withId: Debt = { ...debt, id: isUuid(currentId) ? currentId : generateId() };
  return upsertDebt(withId);
}

export async function togglePaidDebtInBackend(id: string, nowPaid: boolean): Promise<void> {
  const todayISO = new Date().toISOString().split('T')[0];
  const payload = {
    paid: nowPaid,
    paid_date: nowPaid ? todayISO : null,
  };

  try {
    const { error } = await supabase.from(TABLE).update(payload).eq('id', id);
    if (!error) return;
    console.warn('Error toggling debt paid status', error);
  } catch (err) {
    console.warn('Error toggling debt paid status', err);
  }
  // Retry on next sync with the full cached record
  await pendingDebts.add(id);
}

export async function clearPaidDebtsInBackend(paidDebts?: Debt[]): Promise<void> {
  // Soft delete: Nunca borrar permanentemente de la base de datos
  try {
    if (Array.isArray(paidDebts)) {
      for (const d of paidDebts) {
        await addDeletedDebtId(d.id);
        const note = d.note || '';
        const newNote = note.startsWith(DELETED_PREFIX) ? note : DELETED_PREFIX + note;
        await supabase.from(TABLE).update({ note: newNote }).eq('id', d.id);
      }
    }
  } catch (err) {
    console.warn('Error soft clearing paid debts', err);
  }
}

export async function restoreDebtInBackend(id: string, debt: Debt): Promise<void> {
  await removeDeletedDebtId(id);
  try {
    const cleanNote = stripDeletedPrefix(debt.note);
    const { error } = await supabase.from(TABLE).update({ note: cleanNote }).eq('id', id);
    if (error) console.warn('Error restoring debt in Supabase', error);
  } catch (err) {
    console.warn('Error restoring debt in Supabase', err);
  }
}
