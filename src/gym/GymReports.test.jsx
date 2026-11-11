import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GymReports from './GymReports';

const eng = (status) => ({ status, recent14: 0, prior28: 0 });
const base = { workouts7d: 0, workouts28d: 0, weeks: new Array(8).fill(0) };
const data = {
  gym: { name: 'Iron House' },
  trainers: [{ id: 't1', name: 'Asha', clientCount: 2, stats: { activePct: 50, perClientWeek: 1.5, atRisk: 1 } }],
  clients: [
    { ...base, id: 'a', name: 'Ravi', phone: '9000000001', engagement: eng('quiet'), journey: null },
    { ...base, id: 'b', name: 'Neha', phone: '9000000002', workouts28d: 3, engagement: eng('new'), journey: { joinedDaysAgo: 4, firstWorkoutDay: null, workoutsFirst14d: 0 } }
  ],
  insights: { today: '2026-11-10', weekly: new Array(8).fill({ workouts: 0, members: 0 }), peak: { grid: Array.from({ length: 7 }, () => new Array(24).fill(0)), total: 0 }, health: {} }
};
const biz = {
  payments: [], paidByMembership: [{ membership_id: 'm1', amount_inr: 1000 }, { membership_id: 'm2', amount_inr: 1000 }],
  memberships: [{ id: 'm1', member_id: 'a', plan_name: 'Monthly', ends_on: '2026-11-12', price_inr: 1000 }, { id: 'm2', member_id: 'b', plan_name: 'Monthly', ends_on: '2027-01-01', price_inr: 1000 }]
};

describe('GymReports', () => {
  it('shows renewal risk and the new-member journey', () => {
    render(<GymReports data={data} biz={biz} />);
    expect(screen.getByText('Ravi')).toBeTruthy();
    expect(screen.getByText('Likely to leave')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText(/Day 5 · no workout yet/)).toBeTruthy();
  });

  it('still renders before plans and payments are loaded', () => {
    render(<GymReports data={data} biz={null} />);
    expect(screen.getByText('Add plans in Payments to see renewals.')).toBeTruthy();
  });
});
