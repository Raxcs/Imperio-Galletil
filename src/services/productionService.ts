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

export async function fetchProductionLogs(): Promise<ProductionLog[]> {
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
      list = data.map((item: any) => ({
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
        list = fbData.map((item: any) => ({
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

  if (!isFetchSuccess || list.length === 0) {
    list = await getCachedProductionLogs();
  } else {
    await setCachedProductionLogs(list);
  }

  return list;
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

export async function deleteProductionLogInBackend(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('production_logs').delete().eq('id', id);
    if (error) {
      await supabase.from('produccion').delete().eq('id', id);
    }
  } catch (err) {
    console.warn('Error deleting production log', err);
  }
}
