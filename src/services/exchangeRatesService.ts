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
