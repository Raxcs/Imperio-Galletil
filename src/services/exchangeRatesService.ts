import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExchangeRates } from '../types';

const STORAGE_KEY = '@imperio_galletil_rates';

export const DEFAULT_RATES: ExchangeRates = {
  usd_ves: 875.70,
  eur_ves: 976.62,
};

export async function getExchangeRates(): Promise<ExchangeRates> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.usd_ves && parsed.eur_ves) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading rates from storage', err);
  }
  return DEFAULT_RATES;
}

export async function saveExchangeRates(rates: ExchangeRates): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch (err) {
    console.warn('Error saving rates to storage', err);
  }
}

export interface SyncBcvResult {
  rates: ExchangeRates;
  updated: boolean;
  lastUpdated?: string;
  error?: string;
}

export async function syncBcvRates(): Promise<SyncBcvResult> {
  const current = await getExchangeRates();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const [usdRes, eurRes] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: controller.signal }),
      fetch('https://ve.dolarapi.com/v1/euros/oficial', { signal: controller.signal }),
    ]);
    clearTimeout(timeoutId);

    if (usdRes.ok) {
      const usdJson = await usdRes.json();
      const eurJson = eurRes.ok ? await eurRes.json() : null;

      const newUsd = typeof usdJson.promedio === 'number' && usdJson.promedio > 0
        ? Number(usdJson.promedio.toFixed(2))
        : current.usd_ves;

      const newEur = eurJson && typeof eurJson.promedio === 'number' && eurJson.promedio > 0
        ? Number(eurJson.promedio.toFixed(2))
        : current.eur_ves;

      const newRates: ExchangeRates = {
        usd_ves: newUsd,
        eur_ves: newEur,
      };

      await saveExchangeRates(newRates);
      return {
        rates: newRates,
        updated: true,
        lastUpdated: usdJson.fechaActualizacion || new Date().toISOString(),
      };
    }
  } catch (err: any) {
    console.warn('Error fetching live BCV exchange rates', err?.message || err);
    return { rates: current, updated: false, error: err?.message || 'Error de conexion' };
  }

  return { rates: current, updated: false };
}

