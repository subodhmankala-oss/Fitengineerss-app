import { describe, it, expect } from 'vitest';
import { visitGrid, dayStreak, memberTag, rankTrainers, initials, liveBoard, liveSexCounts } from './gymView';

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

import { leadStats, insideNow, checkinsToday, busyLabel, payday, istDate } from './gymView';

describe('gymView leads, check-ins, payday', () => {
  it('counts joins this month against the goal', () => {
    const leads = [
      { stage: 'joined', joined_at: '2026-10-03T05:00:00Z' }, { stage: 'joined', joined_at: '2026-09-30T05:00:00Z' },
      { stage: 'new', joined_at: null }
    ];
    expect(leadStats(leads, 20, '2026-10-18')).toEqual({ joined: 1, goal: 20, toGo: 19, daysLeft: 13 });
  });
  it('uses India time for the date', () => {
    expect(istDate('2026-10-17T19:00:00Z')).toBe('2026-10-18');
  });
  it('counts only recent open check-ins as inside', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const rows = [
      { in_at: '2026-10-18T11:00:00Z', out_at: null }, { in_at: '2026-10-18T10:00:00Z', out_at: '2026-10-18T11:00:00Z' },
      { in_at: '2026-10-18T02:00:00Z', out_at: null }
    ];
    expect(insideNow(rows, now)).toHaveLength(1);
    expect(checkinsToday(rows, '2026-10-18')).toBe(3);
  });
  it('labels how busy the gym is', () => {
    expect(busyLabel(10, 60)).toBe('Plenty of room');
    expect(busyLabel(43, 60)).toBe('Getting busy');
    expect(busyLabel(60, 60)).toBe('Full');
  });
  it('splits PT fees by the trainer who coaches the member', () => {
    const biz = {
      memberships: [{ id: 'pt1', is_pt: true }, { id: 'mo1', is_pt: false }],
      payments: [
        { membership_id: 'pt1', member_id: 'a', amount_inr: 9000, paid_on: '2026-10-05' },
        { membership_id: 'pt1', member_id: 'a', amount_inr: 1000, paid_on: '2026-09-05' },
        { membership_id: 'mo1', member_id: 'a', amount_inr: 3000, paid_on: '2026-10-05' }
      ],
      payouts: [{ trainer_id: 't1', month: '2026-10-01', amount_inr: 6300 }]
    };
    const r = payday(biz, [{ id: 'a', coachId: 't1' }], [{ id: 't1', name: 'Priya' }, { id: 't2', name: 'Rohit' }], '2026-10', 70);
    expect(r[0]).toMatchObject({ fees: 9000, payout: 6300, paid: true });
    expect(r[1]).toMatchObject({ fees: 0, payout: 0, paid: false });
  });
});

import { trainerDays } from './gymView';

describe('trainerDays', () => {
  const biz = {
    trainerDays: [
      { trainer_id: 't1', day: '2026-10-18', status: 'in' }, { trainer_id: 't1', day: '2026-10-17', status: 'in' },
      { trainer_id: 't1', day: '2026-10-16', status: 'off' }, { trainer_id: 't2', day: '2026-10-18', status: 'off' }
    ],
    highFives: [{ trainer_id: 't1', day: '2026-10-18' }, { trainer_id: 't2', day: '2026-10-18' }]
  };
  it('summarises one trainer', () => {
    expect(trainerDays(biz, 't1', '2026-10-18')).toEqual({ today: 'in', daysIn: 2, daysOff: 1, highFives: 1 });
    expect(trainerDays(biz, 't2', '2026-10-18').today).toBe('off');
  });
  it('is empty when nothing is recorded', () => {
    expect(trainerDays({}, 't1', '2026-10-18')).toEqual({ today: null, daysIn: 0, daysOff: 0, highFives: 0 });
  });
  it('ranks the live board by calories, today or this week', () => {
    const live = {
      today: '2026-10-23',
      members: [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bala' }, { id: 'c', name: 'Chitra' }],
      sessions: [
        { memberId: 'a', date: '2026-10-23', kcal: 120.4, at: '2026-10-23T05:00:00Z' },
        { memberId: 'b', date: '2026-10-23', kcal: 200, at: '2026-10-23T06:00:00Z' },
        { memberId: 'a', date: '2026-10-21', kcal: 300, at: '2026-10-21T06:00:00Z' }
      ]
    };
    expect(liveBoard(live, 'today').map((r) => [r.id, r.kcal])).toEqual([['b', 200], ['a', 120], ['c', 0]]);
    expect(liveBoard(live, 'week').map((r) => [r.id, r.kcal, r.sessions])).toEqual([['a', 420, 2], ['b', 200, 1], ['c', 0, 0]]);
  });
  it('breaks a calorie tie by who got there first', () => {
    const live = {
      today: 'd', members: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }],
      sessions: [{ memberId: 'x', date: 'd', kcal: 100, at: '2' }, { memberId: 'y', date: 'd', kcal: 100, at: '1' }]
    };
    expect(liveBoard(live, 'today').map((r) => r.id)).toEqual(['y', 'x']);
  });
});

describe('live board by sex', () => {
  const live = {
    today: 'd',
    members: [{ id: 'a', name: 'A', sex: 'female' }, { id: 'b', name: 'B', sex: 'male' }, { id: 'c', name: 'C', sex: null }],
    sessions: [
      { memberId: 'a', date: 'd', kcal: 100, at: '1' }, { memberId: 'b', date: 'd', kcal: 300, at: '2' }, { memberId: 'c', date: 'd', kcal: 200, at: '3' }
    ]
  };
  it('ranks only the chosen group', () => {
    expect(liveBoard(live, 'today', 'female').map((r) => r.id)).toEqual(['a']);
    expect(liveBoard(live, 'today', 'male').map((r) => r.id)).toEqual(['b']);
    expect(liveBoard(live, 'today', 'all').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('counts each group and those who have not said', () => {
    expect(liveSexCounts(live)).toEqual({ all: 3, male: 1, female: 1, unset: 1 });
  });
});
