import { describe, it, expect } from 'vitest';
import { visitGrid, dayStreak, memberTag, rankTrainers, initials } from './gymView';

describe('gymView', () => {
  it('marks the days trained, oldest first', () => {
    const g = visitGrid(['2026-10-18', '2026-10-16'], '2026-10-18', 4);
    expect(g).toEqual([false, true, false, true]);
  });
  it('counts a streak back from today', () => {
    expect(dayStreak(['2026-10-18', '2026-10-17', '2026-10-16', '2026-10-14'], '2026-10-18')).toBe(3);
  });
  it('does not zero the streak just because today is not trained yet', () => {
    expect(dayStreak(['2026-10-17', '2026-10-16'], '2026-10-18')).toBe(2);
  });
  it('is 0 when they last trained 2+ days ago', () => {
    expect(dayStreak(['2026-10-15'], '2026-10-18')).toBe(0);
  });
  it('tags members by training health', () => {
    expect(memberTag({ engagement: { status: 'quiet' } }).label).toBe('Stopped coming');
    expect(memberTag({ engagement: { status: 'thriving' } }).action).toBe('High-five');
  });
  it('ranks trainers by share still training', () => {
    const t = (id, pct, n) => ({ id, clientCount: n, stats: { activePct: pct } });
    expect(rankTrainers([t('a', 50, 4), t('b', 90, 2), t('c', null, 0)]).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('makes initials', () => {
    expect(initials('Rahul Kumar')).toBe('RK');
    expect(initials('Asha')).toBe('A');
  });
});

import { memberPlans, monthlyCollections, memberRowTag, rupees } from './gymView';

describe('gymView money', () => {
  const biz = {
    memberships: [
      { id: 'm1', member_id: 'a', plan_name: 'Monthly', starts_on: '2026-09-01', ends_on: '2026-09-30', price_inr: 3000 },
      { id: 'm2', member_id: 'a', plan_name: 'Quarterly', starts_on: '2026-10-01', ends_on: '2026-12-31', price_inr: 8400 },
      { id: 'm3', member_id: 'b', plan_name: 'Monthly', starts_on: '2026-10-01', ends_on: '2026-10-22', price_inr: 3000 },
      { id: 'm4', member_id: 'c', plan_name: 'Monthly', starts_on: '2026-09-01', ends_on: '2026-09-30', price_inr: 3000 },
      { id: 'm5', member_id: 'd', plan_name: 'Monthly', starts_on: '2026-10-10', ends_on: '2026-11-09', price_inr: 3000 }
    ],
    paidByMembership: [
      { membership_id: 'm2', amount_inr: 8400 }, { membership_id: 'm3', amount_inr: 3000 },
      { membership_id: 'm4', amount_inr: 3000 }, { membership_id: 'm5', amount_inr: 1000 }
    ]
  };
  const plans = memberPlans(biz, '2026-10-18');
  it('uses the membership that ends last', () => {
    expect(plans.a.planName).toBe('Quarterly');
    expect(plans.a.state).toBe('active');
  });
  it('flags plans ending within a week', () => {
    expect(plans.b.state).toBe('ends-soon');
    expect(plans.b.daysLeft).toBe(4);
  });
  it('flags ended plans and unpaid balances', () => {
    expect(plans.c.state).toBe('expired');
    expect(plans.d.state).toBe('due');
    expect(plans.d.due).toBe(2000);
  });
  it('sums collections by month', () => {
    const r = monthlyCollections([
      { paid_on: '2026-10-02', amount_inr: 3000 }, { paid_on: '2026-10-15', amount_inr: 500 },
      { paid_on: '2026-08-30', amount_inr: 1000 }, { paid_on: '2025-01-01', amount_inr: 9 }
    ], '2026-10-18', 6);
    expect(r.thisMonth).toBe(3500);
    expect(r.months.map((m) => m.label)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(r.months[3].total).toBe(1000);
  });
  it('prefers the money tag over training health', () => {
    expect(memberRowTag({ engagement: { status: 'thriving' } }, plans.d).label).toBe('Payment due');
    expect(memberRowTag({ engagement: { status: 'thriving' } }, undefined).label).toBe('Active');
  });
  it('formats rupees the Indian way', () => {
    expect(rupees(147000)).toBe('₹1,47,000');
  });
});
