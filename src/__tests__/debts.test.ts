import { Debt } from '../types';
import { purgeOldDebts, AUTO_PURGE_DAYS } from '../services/debtsService';

describe('Debts Business Logic and Auto-Purge', () => {
  it('should retain unpaid debts regardless of age', () => {
    const oldUnpaidDebt: Debt = {
      id: 'd1',
      name: 'Maria Fernandez',
      amount: 1700,
      debt_date: '2026-01-01',
      note: 'Debe desde hace meses pero no ha pagado',
      paid: false,
      paid_date: null,
    };

    const { valid, expiredIds } = purgeOldDebts([oldUnpaidDebt]);
    expect(valid).toHaveLength(1);
    expect(valid[0].id).toBe('d1');
    expect(expiredIds).toHaveLength(0);
  });

  it('should retain paid debts that are within 30 days', () => {
    const today = new Date();
    const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const recentPaidDebt: Debt = {
      id: 'd2',
      name: 'Carlos Mendoza',
      amount: 2500,
      debt_date: tenDaysAgo,
      paid: true,
      paid_date: tenDaysAgo,
    };

    const { valid, expiredIds } = purgeOldDebts([recentPaidDebt]);
    expect(valid).toHaveLength(1);
    expect(valid[0].id).toBe('d2');
    expect(expiredIds).toHaveLength(0);
  });

  it('should purge paid debts older than AUTO_PURGE_DAYS (30 days)', () => {
    const today = new Date();
    const thirtyFiveDaysAgo = new Date(
      today.getTime() - (AUTO_PURGE_DAYS + 5) * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];

    const expiredPaidDebt: Debt = {
      id: 'd3',
      name: 'Pedro Ramirez',
      amount: 1200,
      debt_date: thirtyFiveDaysAgo,
      paid: true,
      paid_date: thirtyFiveDaysAgo,
    };

    const { valid, expiredIds } = purgeOldDebts([expiredPaidDebt]);
    expect(valid).toHaveLength(0);
    expect(expiredIds).toContain('d3');
  });

  it('should correctly separate valid debts and expired debt IDs in mixed lists', () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const mixed: Debt[] = [
      {
        id: '1',
        name: 'Cliente Activo',
        amount: 500,
        debt_date: fortyDaysAgo,
        paid: false,
      },
      {
        id: '2',
        name: 'Cliente Reciente Cobrado',
        amount: 800,
        debt_date: fiveDaysAgo,
        paid: true,
        paid_date: fiveDaysAgo,
      },
      {
        id: '3',
        name: 'Cliente Antiguo Cobrado',
        amount: 1200,
        debt_date: fortyDaysAgo,
        paid: true,
        paid_date: fortyDaysAgo,
      },
    ];

    const { valid, expiredIds } = purgeOldDebts(mixed);
    expect(valid).toHaveLength(2);
    expect(valid.map((d) => d.id)).toEqual(['1', '2']);
    expect(expiredIds).toEqual(['3']);
  });

});

