import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { FirstThirtyDaysCard, NotRenewCard } from './GymOwnerCards';

const plan = (daysLeft, extra = {}) => ({ planName: 'Monthly', daysLeft, endsOn: '2026-11-15', state: 'ends-soon', price: 3000, due: 0, ...extra });
const data = {
  gym: { name: 'Iron Den' },
  clients: [
    { id: 'a', name: 'Ravi Kumar', phone: '9000000001', engagement: { status: 'quiet' }, lastWorkout: '2026-10-28', journey: null },
    { id: 'b', name: 'Neha Rao', phone: null, engagement: { status: 'slipping' }, lastWorkout: null, journey: null },
    { id: 'd', name: 'Sam Lee', phone: '9000000004', engagement: { status: 'new' }, trainerName: null, selfGuided: false, journey: { joinedDaysAgo: 6, firstWorkoutDay: null, workoutsFirst14d: 0 } },
    { id: 'e', name: 'Tia Das', phone: '9000000005', engagement: { status: 'thriving' }, trainerName: 'Asha', journey: { joinedDaysAgo: 12, firstWorkoutDay: 0, workoutsFirst14d: 5 } }
  ]
};

beforeEach(() => { window.open = vi.fn(); });
afterEach(cleanup);

describe('NotRenewCard', () => {
  const plans = { a: plan(4), b: plan(-3, { state: 'expired' }), e: plan(2) };

  it('lists at-risk members with plan, days left and last workout date', () => {
    render(<NotRenewCard data={data} plans={plans} upiId="irondenfit@okhdfcbank" onOpenMembers={vi.fn()} />);
    expect(screen.getByText(/Monthly ends in 4 days · last workout 28 Oct/)).toBeTruthy();
    expect(screen.getByText(/Monthly ended 3 days ago · no workout logged/)).toBeTruthy();
    expect(screen.queryByText('Tia Das')).toBeNull(); // thriving: not at risk
  });

  it('one tap opens WhatsApp with the renewal message and the UPI link', () => {
    render(<NotRenewCard data={data} plans={plans} upiId="irondenfit@okhdfcbank" onOpenMembers={vi.fn()} />);
    const buttons = screen.getAllByRole('button', { name: 'Send renewal' });
    expect(buttons.map((b) => b.disabled)).toEqual([true, false]); // Neha (listed first: ended) has no phone
    fireEvent.click(buttons[1]);
    const sent = new URL(window.open.mock.calls[0][0]).searchParams;
    const url = `phone=${sent.get('phone')}
${sent.get('text')}`;
    expect(url).toContain('phone=919000000001');
    expect(url).toContain('Monthly at Iron Den ends in 4 days');
    expect(url).toContain('upi://pay?pa=irondenfit@okhdfcbank');
    expect(url).toContain('am=3000.00');
  });

  it('has an all-clear state', () => {
    render(<NotRenewCard data={{ ...data, clients: [] }} plans={{}} onOpenMembers={vi.fn()} />);
    expect(screen.getByText(/Nobody with a plan ending soon/)).toBeTruthy();
  });
});

describe('FirstThirtyDaysCard', () => {
  it('shows the stages and flags a member with no first workout after 3 days', () => {
    render(<FirstThirtyDaysCard data={data} onOpenMembers={vi.fn()} />);
    expect(screen.getByText(/2 joined · 1 started · 1 hooked/)).toBeTruthy();
    expect(screen.getByText('No workout yet')).toBeTruthy();
    expect(screen.getByText('✓ First workout, day 1')).toBeTruthy();
    expect(screen.getByText('✓ 4+ workouts (5)')).toBeTruthy();
  });

  it('Assign trainer opens that member on Members; Welcome message opens WhatsApp', () => {
    const open = vi.fn();
    render(<FirstThirtyDaysCard data={data} onOpenMembers={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign trainer' }));
    expect(open).toHaveBeenCalledWith('waiting', 'd');
    fireEvent.click(screen.getByRole('button', { name: 'Welcome message' }));
    expect(new URL(window.open.mock.calls[0][0]).searchParams.get('text')).toContain('welcome to Iron Den');
  });

  it('offers no actions to members who are doing fine, and has an empty state', () => {
    const only = { ...data, clients: [data.clients[3]] };
    const { unmount } = render(<FirstThirtyDaysCard data={only} onOpenMembers={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Welcome message' })).toBeNull();
    unmount();
    render(<FirstThirtyDaysCard data={{ ...data, clients: [] }} onOpenMembers={vi.fn()} />);
    expect(within(document.body).getByText('Nobody joined in the last 30 days.')).toBeTruthy();
  });
});
