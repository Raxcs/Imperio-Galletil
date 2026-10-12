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

export async function fetchDebts(): Promise<Debt[]> {
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
      remoteList = data.map((item: any) => ({
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
        remoteList = fbData.map((item: any) => ({
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

  // If remote fetch failed, preserve and return local cache
  if (!isFetchSuccess) {
    const { valid } = purgeOldDebts(localDebts);
    await setCachedDebts(valid);
    return valid;
  }

  // Merge remote records with any local offline/unsynced records
  const remoteMap = new Map(remoteList.map((d) => [d.id, d]));
  const merged: Debt[] = [...remoteList];

  for (const local of localDebts) {
    if (!remoteMap.has(local.id)) {
      if (local.id.startsWith('temp_') || local.id.startsWith('local_')) {
        merged.unshift(local);
        saveDebtInBackend(local).catch(() => {});
      }
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

export async function deleteDebtInBackend(id: string): Promise<void> {
  try {
    await supabase.from('debts').delete().eq('id', id);
    await supabase.from('deudas').delete().eq('id', id);
  } catch (err) {
    console.warn('Error deleting debt in Supabase', err);
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

export async function clearPaidDebtsInBackend(): Promise<void> {
  try {
    await supabase.from('debts').delete().eq('paid', true);
    await supabase.from('deudas').delete().eq('paid', true);
  } catch (err) {
    console.warn('Error clearing paid debts', err);
  }
}
