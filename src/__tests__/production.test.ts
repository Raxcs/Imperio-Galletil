import { ProductionLog } from '../types';

describe('Production Calculations and Financial Metrics', () => {
  const sampleLogs: ProductionLog[] = [
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

  it('should accurately calculate total gross revenue', () => {
    let totalGross = 0;
    sampleLogs.forEach((item) => {
      totalGross += item.qty * item.price_ves;
    });

    // 40 * 1000 = 40,000 + 8 * 2500 = 20,000 => 60,000
    expect(totalGross).toBe(60000);
  });

  it('should accurately calculate untouchable raw materials fund', () => {
    let totalCost = 0;
    sampleLogs.forEach((item) => {
      totalCost += item.qty * item.cost_ves;
    });

    // 40 * 286.93 = 11,477.20
    // 8 * 997.04 = 7,976.32
    // total = 19,453.52
    expect(totalCost).toBeCloseTo(19453.52, 2);
  });

  it('should accurately calculate net free profit and profitability margin', () => {
    let totalGross = 0;
    let totalCost = 0;

    sampleLogs.forEach((item) => {
      totalGross += item.qty * item.price_ves;
      totalCost += item.qty * item.cost_ves;
    });

    const netProfit = totalGross - totalCost;
    // 60,000 - 19,453.52 = 40,546.48
    expect(netProfit).toBeCloseTo(40546.48, 2);

    const marginPercentage = (netProfit / totalGross) * 100;
    // 40,546.48 / 60,000 * 100 = 67.577% ~ 67.6%
    expect(marginPercentage).toBeCloseTo(67.58, 1);
  });

  it('should handle zero production gracefully without division by zero', () => {
    const emptyLogs: ProductionLog[] = [];
    let totalGross = 0;
    let totalCost = 0;

    emptyLogs.forEach((item) => {
      totalGross += item.qty * item.price_ves;
      totalCost += item.qty * item.cost_ves;
    });

    const netProfit = Math.max(0, totalGross - totalCost);
    const margin = totalGross > 0 ? (netProfit / totalGross) * 100 : 0;

    expect(netProfit).toBe(0);
    expect(margin).toBe(0);
  });



  it('should recognize mock legacy seed production logs', () => {
    const { isLegacySeedLog } = require('../data/migrateLegacy');
    const seedCookies = { id: 'uuid-1', name: 'Galletas Clasicas', qty: 40, price_ves: 1000, cost_ves: 286.93 };
    const seedBrownies = { id: 'uuid-2', name: 'Brownie con Galleta', qty: 8, price_ves: 2500, cost_ves: 997.04 };
    const realBatch = { id: 'uuid-3', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22 };

    expect(isLegacySeedLog(seedCookies as any)).toBe(true);
    expect(isLegacySeedLog(seedBrownies as any)).toBe(true);
    expect(isLegacySeedLog(realBatch as any)).toBe(false);
  });

});

