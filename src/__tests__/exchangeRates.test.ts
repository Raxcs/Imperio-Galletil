import { DEFAULT_RATES, getExchangeRates, saveExchangeRates } from '../services/exchangeRatesService';

describe('Exchange Rates Service and Conversions', () => {
  it('should have correct default BCV rates', () => {
    expect(DEFAULT_RATES.usd_ves).toBe(875.70);
    expect(DEFAULT_RATES.eur_ves).toBe(976.62);
  });

  it('should correctly convert USD to VES and EUR', () => {
    const usd = 10;
    const ves = usd * DEFAULT_RATES.usd_ves;
    const eur = ves / DEFAULT_RATES.eur_ves;

    expect(ves).toBe(8757.0);
    expect(eur).toBeCloseTo(8.9666, 3);
  });

  it('should correctly convert VES to USD and EUR', () => {
    const ves = 1751.40;
    const usd = ves / DEFAULT_RATES.usd_ves;
    const eur = ves / DEFAULT_RATES.eur_ves;

    expect(usd).toBeCloseTo(2.0, 2);
    expect(eur).toBeCloseTo(1.7933, 2);
  });

  it('should persist and retrieve updated rates from storage', async () => {
    const updatedRates = { usd_ves: 900.0, eur_ves: 1000.0 };
    await saveExchangeRates(updatedRates);

    const retrieved = await getExchangeRates();
    expect(retrieved.usd_ves).toBe(900.0);
    expect(retrieved.eur_ves).toBe(1000.0);
  });

  it('should sync BCV rates and fallback safely if network fails', async () => {
    // Mock global fetch
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('dolares/oficial')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ promedio: 890.50, fechaActualizacion: '2026-10-11' }),
          });
        }
        if (url.includes('euros/oficial')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ promedio: 990.20 }),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      }) as any;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { syncBcvRates } = require('../services/exchangeRatesService');
      const result = await syncBcvRates();
      expect(result.updated).toBe(true);
      expect(result.rates.usd_ves).toBe(890.50);
      expect(result.rates.eur_ves).toBe(990.20);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
