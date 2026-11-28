import { describe, it, expect } from 'vitest';
import { expenseInMonth, monthlyProfit } from './gymView';

const TODAY = '2026-11-28';
const biz = {
  payments: [
    { id: 'p1', amount_inr: 200000, paid_on: '2026-11-05' },
    { id: 'p2', amount_inr: 40000, paid_on: '2026-11-20' },
    { id: 'p3', amount_inr: 50000, paid_on: '2026-10-10' }
  ],
  expenses: [
    { id: 'rent', category: 'rent', amount_inr: 80000, spent_on: '2026-09-01', monthly: true, stopped_on: null },
    { id: 'wifi', category: 'other', amount_inr: 1000, spent_on: '2026-06-03', monthly: true, stopped_on: '2026-10-15' },
    { id: 'rack', category: 'equipment', amount_inr: 25000, spent_on: '2026-11-12', monthly: false, stopped_on: null },
    { id: 'old', category: 'marketing', amount_inr: 9000, spent_on: '2026-10-02', monthly: false, stopped_on: null }
  ],
  payouts: [
    { trainer_id: 't1', month: '2026-11-01', amount_inr: 12000 },
    { trainer_id: 't2', month: '2026-10-01', amount_inr: 0 }
  ]
};

describe('profit', () => {
  it('counts a one-off expense in its own month only', () => {
    const e = { spent_on: '2026-11-12', monthly: false };
    expect(expenseInMonth(e, '2026-11')).toBe(true);
    expect(expenseInMonth(e, '2026-12')).toBe(false);
  });

  it('repeats a monthly expense from its start month through its stop month', () => {
    const e = { spent_on: '2026-06-03', monthly: true, stopped_on: '2026-10-15' };
    expect(expenseInMonth(e, '2026-05')).toBe(false);
    expect(expenseInMonth(e, '2026-06')).toBe(true);
    expect(expenseInMonth(e, '2026-10')).toBe(true);
    expect(expenseInMonth(e, '2026-11')).toBe(false);
    expect(expenseInMonth({ spent_on: '2026-09-01', monthly: true, stopped_on: null }, '2027-04')).toBe(true);
  });

  it('works out collected, spent and profit for this month, biggest cost first', () => {
    const { thisMonth, months } = monthlyProfit(biz, TODAY, 6);
    expect(months.map((m) => m.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(thisMonth).toMatchObject({ key: '2026-11', collected: 240000, spent: 117000, profit: 123000 });
    expect(thisMonth.byCategory).toEqual([
      { key: 'rent', label: 'Rent', total: 80000 },
      { key: 'equipment', label: 'Equipment', total: 25000 },
      { key: 'payouts', label: 'Trainer PT payouts', total: 12000 }
    ]);
    expect(thisMonth.items.map((e) => e.id)).toEqual(['rent', 'rack']);
  });

  it('shows a loss when spending is more than what came in', () => {
    const oct = monthlyProfit(biz, TODAY, 6).months[4];
    expect(oct).toMatchObject({ collected: 50000, spent: 90000, profit: -40000 });
    const jul = monthlyProfit(biz, TODAY, 6).months[1];
    expect(jul).toMatchObject({ collected: 0, spent: 1000, profit: -1000 });
  });

  it('works before the expenses table exists', () => {
    const { thisMonth } = monthlyProfit({ ...biz, expenses: null }, TODAY, 6);
    expect(thisMonth).toMatchObject({ collected: 240000, spent: 12000, profit: 228000 });
  });
});
