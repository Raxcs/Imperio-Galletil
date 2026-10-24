import { Debt } from '../types';

export const AUTO_PURGE_DAYS = 30;

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
