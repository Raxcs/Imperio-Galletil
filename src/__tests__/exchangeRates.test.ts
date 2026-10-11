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
});
