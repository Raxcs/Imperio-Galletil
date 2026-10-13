import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, withTimeout } from '../lib/supabase';
import { ProductionLog } from '../types';

const STORAGE_KEY = '@imperio_galletil_production_logs';

export const INITIAL_PRODUCTION_LOGS: ProductionLog[] = [
  {
    id: '1',
    name: 'Galletas Clasicas',
    qty: 40,
    price_ves: 1000,
    cost_ves: 286.93,
  },
  {
    id: '2',
    name: 'Brownie con Galleta',
    qty: 8,
    price_ves: 2500,
    cost_ves: 997.04,
  },
];

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
  return INITIAL_PRODUCTION_LOGS;
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
  if (typeof log.name === 'string' && log.name.startsWith('__DELETED__')) return true;
  if (deletedIds && deletedIds.has(log.id)) return true;
  return false;
}

export async function fetchProductionLogs(): Promise<ProductionLog[]> {
  const deletedIdsList = await getDeletedProductionLogIds();
  const deletedIdsSet = new Set(deletedIdsList);
  let list: ProductionLog[] = [];
  let isFetchSuccess = false;

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('production_logs')
        .select('*')
        .order('created_at', { ascending: false })
    );

    if (!error && Array.isArray(data)) {
      isFetchSuccess = true;
      list = data
        .filter((item: any) => !item.name?.startsWith('__DELETED__') && !deletedIdsSet.has(String(item.id)))
        .map((item: any) => ({
          id: String(item.id),
          name: item.name,
          qty: Number(item.qty),
          price_ves: Number(item.price_ves),
          cost_ves: Number(item.cost_ves),
          created_at: item.created_at,
        }));
    } else if (error) {
      // Fallback to produccion table if present
      const { data: fbData, error: fbError } = await withTimeout(
        supabase
          .from('produccion')
          .select('*')
          .order('created_at', { ascending: false })
      );

      if (!fbError && Array.isArray(fbData)) {
        isFetchSuccess = true;
        list = fbData
          .filter((item: any) => !item.name?.startsWith('__DELETED__') && !deletedIdsSet.has(String(item.id)))
          .map((item: any) => ({
            id: String(item.id),
            name: item.name,
            qty: Number(item.qty),
            price_ves: Number(item.price_ves),
            cost_ves: Number(item.cost_ves),
            created_at: item.created_at,
          }));
      }
    }
  } catch (err) {
    console.warn('Error fetching production logs from Supabase', err);
  }

  const localList = await getCachedProductionLogs();
  const activeLocalList = localList.filter((l) => !isProductionLogDeleted(l, deletedIdsSet));

  if (!isFetchSuccess) {
    return activeLocalList;
  }

  const remoteMap = new Map(list.map((p) => [p.id, p]));
  const merged: ProductionLog[] = [...list];

  // Preserve and auto sync any local production logs
  for (const local of activeLocalList) {
    if (!remoteMap.has(local.id) && !deletedIdsSet.has(local.id)) {
      merged.push(local);
      addProductionLogInBackend(local).catch(() => {});
    }
  }

  await setCachedProductionLogs(merged);
  return merged;
}

export async function addProductionLogInBackend(
  log: Omit<ProductionLog, 'id'>
): Promise<ProductionLog> {
  const payload = {
    name: log.name,
    qty: log.qty,
    price_ves: log.price_ves,
    cost_ves: log.cost_ves,
  };

  try {
    const { data, error } = await supabase
      .from('production_logs')
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return {
        id: String(data.id),
        name: data.name,
        qty: Number(data.qty),
        price_ves: Number(data.price_ves),
        cost_ves: Number(data.cost_ves),
        created_at: data.created_at,
      };
    }

    const { data: fbData } = await supabase
      .from('produccion')
      .insert(payload)
      .select()
      .single();

    if (fbData) {
      return {
        id: String(fbData.id),
        name: fbData.name,
        qty: Number(fbData.qty),
        price_ves: Number(fbData.price_ves),
        cost_ves: Number(fbData.cost_ves),
        created_at: fbData.created_at,
      };
    }
  } catch (err) {
    console.warn('Error creating production log in Supabase', err);
  }

  return {
    ...log,
    id: 'temp_' + Date.now(),
  };
}

export async function updateProductionLogInBackend(log: ProductionLog): Promise<void> {
  const payload = {
    name: log.name,
    qty: log.qty,
    price_ves: log.price_ves,
    cost_ves: log.cost_ves,
  };

  try {
    const { error } = await supabase
      .from('production_logs')
      .update(payload)
      .eq('id', log.id);

    if (error) {
      await supabase
        .from('produccion')
        .update(payload)
        .eq('id', log.id);
    }
  } catch (err) {
    console.warn('Error updating production log in Supabase', err);
  }
}

export async function deleteProductionLogInBackend(id: string, log?: ProductionLog): Promise<void> {
  // Soft delete: Nunca se borra permanentemente de la base de datos
  await addDeletedProductionLogId(id);
  try {
    const name = log?.name || '';
    const newName = name.startsWith('__DELETED__') ? name : '__DELETED__' + name;

    const { error } = await supabase
      .from('production_logs')
      .update({ name: newName })
      .eq('id', id);

    if (error) {
      await supabase
        .from('produccion')
        .update({ name: newName })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('Error soft deleting production log in Supabase', err);
  }
}

export async function restoreProductionLogInBackend(id: string, log: ProductionLog): Promise<void> {
  await removeDeletedProductionLogId(id);
  try {
    const cleanName = (log.name || '').replace(/^__DELETED__/, '');

    const { error } = await supabase
      .from('production_logs')
      .update({ name: cleanName })
      .eq('id', id);

    if (error) {
      await supabase
        .from('produccion')
        .update({ name: cleanName })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('Error restoring production log in Supabase', err);
  }
}


