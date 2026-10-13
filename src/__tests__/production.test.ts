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

  it('should correctly detect soft deleted production logs', () => {
    const { isProductionLogDeleted } = require('../services/productionService');
    const normalLog = { id: 'p1', name: 'Galletas Clasicas', qty: 10, price_ves: 100, cost_ves: 50 };
    const markedLog = { id: 'p2', name: 'Galletas', qty: 10, price_ves: 100, cost_ves: 50, deleted: true };
    const prefixLog = { id: 'p3', name: '__DELETED__Galletas', qty: 10, price_ves: 100, cost_ves: 50 };
    const cachedIds = new Set(['p4']);

    expect(isProductionLogDeleted(normalLog as any)).toBe(false);
    expect(isProductionLogDeleted(markedLog as any)).toBe(true);
    expect(isProductionLogDeleted(prefixLog as any)).toBe(true);
    expect(isProductionLogDeleted({ id: 'p4', name: 'Test' } as any, cachedIds)).toBe(true);
  });

  it('should correctly detect soft deleted ingredients without removing from cloud DB', () => {
    const { isIngredientDeleted } = require('../services/ingredientsService');
    const normalIng = { id: 'i1', name: 'Harina', presentation: '1kg', category: ['galletas'] };
    const markedIng = { id: 'i2', name: 'Azucar', presentation: '1kg', is_deleted: true };
    const prefixIng = { id: 'i3', name: 'Mantequilla', presentation: '__DELETED__1kg', category: ['galletas'] };
    const archivedIng = { id: 'i4', name: 'Cacao', presentation: '500g', category: ['archived'] };
    const cachedIds = new Set(['i5']);

    expect(isIngredientDeleted(normalIng as any)).toBe(false);
    expect(isIngredientDeleted(markedIng as any)).toBe(true);
    expect(isIngredientDeleted(prefixIng as any)).toBe(true);
    expect(isIngredientDeleted(archivedIng as any)).toBe(true);
    expect(isIngredientDeleted({ id: 'i5', name: 'Vainilla' } as any, cachedIds)).toBe(true);
  });

  it('should recognize mock legacy seed production logs', () => {
    const { isLegacySeedLog } = require('../services/productionService');
    const seedCookies = { id: 'uuid-1', name: 'Galletas Clasicas', qty: 40, price_ves: 1000, cost_ves: 286.93 };
    const seedBrownies = { id: 'uuid-2', name: 'Brownie con Galleta', qty: 8, price_ves: 2500, cost_ves: 997.04 };
    const realBatch = { id: 'uuid-3', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22 };

    expect(isLegacySeedLog(seedCookies as any)).toBe(true);
    expect(isLegacySeedLog(seedBrownies as any)).toBe(true);
    expect(isLegacySeedLog(realBatch as any)).toBe(false);
  });

  it('should collapse rapid duplicate production logs within 12 hours', () => {
    const { dedupeProductionLogs } = require('../services/productionService');
    const logA = { id: 'prod-1', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22, created_at: '2026-10-13T14:02:22Z' };
    const logB = { id: 'prod-2', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22, created_at: '2026-10-13T14:02:23Z' };
    const logC = { id: 'prod-3', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22, created_at: '2026-10-13T14:03:55Z' };
    const logOtherDay = { id: 'prod-4', name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22, created_at: '2026-10-20T14:00:00Z' };

    const deduped = dedupeProductionLogs([logA, logB, logC, logOtherDay] as any);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((l: any) => l.id)).toEqual(['prod-1', 'prod-4']);
  });
});

