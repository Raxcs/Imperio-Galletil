import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withTimeout } from '../lib/supabase';
import { Debt } from '../types';

const STORAGE_KEY = '@imperio_galletil_debts';
export const AUTO_PURGE_DAYS = 30;

export const INITIAL_DEBTS: Debt[] = [];

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
  if (typeof debt.note === 'string' && debt.note.startsWith('__DELETED__')) return true;
  if (typeof debt.name === 'string' && debt.name.startsWith('__DELETED__')) return true;
  if (deletedIds && deletedIds.has(debt.id)) return true;
  return false;
}

export async function fetchDebts(): Promise<Debt[]> {
  const deletedIdsList = await getDeletedDebtIds();
  const deletedIdsSet = new Set(deletedIdsList);
  const localDebts = await getCachedDebts();
  let remoteList: Debt[] = [];
  let isFetchSuccess = false;

  try {
    // 1. Try Supabase English table 'debts' with timeout
    const { data, error } = await withTimeout(
      supabase
        .from('debts')
        .select('*')
        .order('created_at', { ascending: false })
    );

    if (!error && Array.isArray(data)) {
      isFetchSuccess = true;
      remoteList = data
        .filter((item: any) => !item.note?.startsWith('__DELETED__') && !item.name?.startsWith('__DELETED__') && !deletedIdsSet.has(String(item.id)))
        .map((item: any) => ({
          id: String(item.id),
          name: item.name,
          amount: Number(item.amount),
          debt_date: item.debt_date,
          note: item.note || '',
          paid: !!item.paid,
          paid_date: item.paid_date,
          created_at: item.created_at,
        }));
    } else if (error) {
      // 2. Try Supabase fallback Spanish table 'deudas'
      const { data: fbData, error: fbError } = await withTimeout(
        supabase
          .from('deudas')
          .select('*')
          .order('created_at', { ascending: false })
      );

      if (!fbError && Array.isArray(fbData)) {
        isFetchSuccess = true;
        remoteList = fbData
          .filter((item: any) => !item.note?.startsWith('__DELETED__') && !item.name?.startsWith('__DELETED__') && !deletedIdsSet.has(String(item.id)))
          .map((item: any) => ({
            id: String(item.id),
            name: item.name,
            amount: Number(item.amount),
            debt_date: item.debt_date,
            note: item.note || '',
            paid: !!item.paid,
            paid_date: item.paid_date,
            created_at: item.created_at,
          }));
      }
    }
  } catch (err) {
    console.warn('Error fetching debts from Supabase, preserving local cache', err);
  }

  // Active local debts (excluding deleted)
  const activeLocalDebts = localDebts.filter((d) => !isDebtDeleted(d, deletedIdsSet));

  // If remote fetch failed, preserve and return local cache
  if (!isFetchSuccess) {
    const { valid } = purgeOldDebts(activeLocalDebts);
    await setCachedDebts(valid);
    return valid;
  }

  // Merge remote records with any local offline/unsynced records
  const remoteMap = new Map(remoteList.map((d) => [d.id, d]));
  const merged: Debt[] = [...remoteList];

  for (const local of activeLocalDebts) {
    if (!remoteMap.has(local.id) && !deletedIdsSet.has(local.id)) {
      merged.unshift(local);
      saveDebtInBackend(local).catch(() => {});
    }
  }

  // Auto-purge debts older than 30 days
  const { valid, expiredIds } = purgeOldDebts(merged);
  if (expiredIds.length > 0) {
    // Clean up expired debts in background
    for (const expId of expiredIds) {
      deleteDebtInBackend(expId).catch(() => {});
    }
  }

  await setCachedDebts(valid);
  return valid;
}

export async function deleteDebtInBackend(id: string, debt?: Debt): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedDebtId(id);
  try {
    const note = debt?.note || '';
    const newNote = note.startsWith('__DELETED__') ? note : '__DELETED__' + note;

    const { error } = await supabase.from('debts').update({ note: newNote }).eq('id', id);
    if (error) {
      await supabase.from('deudas').update({ note: newNote }).eq('id', id);
    }
  } catch (err) {
    console.warn('Error soft deleting debt in Supabase', err);
  }
}

export async function saveDebtInBackend(
  debt: Omit<Debt, 'id'> | Debt
): Promise<Debt> {
  const isExisting = 'id' in debt && debt.id && !debt.id.startsWith('temp_');
  const payload = {
    name: debt.name,
    amount: debt.amount,
    debt_date: debt.debt_date,
    note: debt.note || '',
    paid: debt.paid,
    paid_date: debt.paid_date || null,
  };

  if (isExisting) {
    try {
      const { data, error } = await supabase
        .from('debts')
        .update(payload)
        .eq('id', (debt as Debt).id)
        .select()
        .single();

      if (!error && data) {
        return {
          id: String(data.id),
          name: data.name,
          amount: Number(data.amount),
          debt_date: data.debt_date,
          note: data.note || '',
          paid: !!data.paid,
          paid_date: data.paid_date,
          created_at: data.created_at,
        };
      }

      await supabase.from('deudas').update(payload).eq('id', (debt as Debt).id);
    } catch (err) {
      console.warn('Error updating debt in Supabase', err);
    }
    return debt as Debt;
  }

  // Insert new debt
  try {
    const { data, error } = await supabase
      .from('debts')
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        name: data.name,
        amount: Number(data.amount),
        debt_date: data.debt_date,
        note: data.note || '',
        paid: !!data.paid,
        paid_date: data.paid_date,
        created_at: data.created_at,
      };
    }

    const { data: fbData } = await supabase
      .from('deudas')
      .insert(payload)
      .select()
      .single();

    if (fbData) {
      return {
        id: String(fbData.id),
        name: fbData.name,
        amount: Number(fbData.amount),
        debt_date: fbData.debt_date,
        note: fbData.note || '',
        paid: !!fbData.paid,
        paid_date: fbData.paid_date,
        created_at: fbData.created_at,
      };
    }
  } catch (err) {
    console.warn('Error creating debt in Supabase', err);
  }

  return {
    ...debt,
    id: 'temp_' + Date.now(),
  } as Debt;
}

export async function togglePaidDebtInBackend(
  id: string,
  nowPaid: boolean
): Promise<void> {
  const todayISO = new Date().toISOString().split('T')[0];
  const payload = {
    paid: nowPaid,
    paid_date: nowPaid ? todayISO : null,
  };

  try {
    const { error } = await supabase.from('debts').update(payload).eq('id', id);
    if (error) {
      await supabase.from('deudas').update(payload).eq('id', id);
    }
  } catch (err) {
    console.warn('Error toggling debt paid status', err);
  }
}

export async function clearPaidDebtsInBackend(paidDebts?: Debt[]): Promise<void> {
  // Soft delete: Nunca borrar permanentemente de la base de datos
  try {
    if (Array.isArray(paidDebts)) {
      for (const d of paidDebts) {
        await addDeletedDebtId(d.id);
        const note = d.note || '';
        const newNote = note.startsWith('__DELETED__') ? note : '__DELETED__' + note;
        await supabase.from('debts').update({ note: newNote }).eq('id', d.id);
      }
    }
  } catch (err) {
    console.warn('Error soft clearing paid debts', err);
  }
}

export async function restoreDebtInBackend(id: string, debt: Debt): Promise<void> {
  await removeDeletedDebtId(id);
  try {
    const cleanNote = (debt.note || '').replace(/^__DELETED__/, '');
    const { error } = await supabase.from('debts').update({ note: cleanNote }).eq('id', id);
    if (error) {
      await supabase.from('deudas').update({ note: cleanNote }).eq('id', id);
    }
  } catch (err) {
    console.warn('Error restoring debt in Supabase', err);
  }
}
