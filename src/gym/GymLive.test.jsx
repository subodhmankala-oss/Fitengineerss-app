// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import GymLive from './GymLive';

const live = {
  success: true, gym: { id: 'g1' }, today: '2026-10-23', weekStart: '2026-10-20',
  members: [{ id: 'a', name: 'Asha Rao' }, { id: 'b', name: 'Bala K' }, { id: 'c', name: 'Chitra M' }],
  sessions: [
    { memberId: 'a', date: '2026-10-23', kcal: 120, at: '2026-10-23T05:00:00Z' },
    { memberId: 'b', date: '2026-10-23', kcal: 200, at: '2026-10-23T06:00:00Z' },
    { memberId: 'a', date: '2026-10-21', kcal: 300, at: '2026-10-21T06:00:00Z' }
  ]
};

afterEach(cleanup);

describe('GymLive', () => {
  it('ranks members by calories and switches to this week', async () => {
    const service = { getGymLive: vi.fn().mockResolvedValue(live) };
    render(<GymLive service={service} />);
    const list = await screen.findByRole('list');
    const names = () => within(list).getAllByRole('listitem').map((li) => li.querySelector('.gx-live-name').textContent);
    expect(names()).toEqual(['Bala K', 'Asha Rao', 'Chitra M']);
    expect(screen.getByText(/burned today by 2 members/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(names()).toEqual(['Asha Rao', 'Bala K', 'Chitra M']);
    expect(within(list).getAllByText('420').length).toBe(1);
  });

  it('says so when nobody has trained yet', async () => {
    const service = { getGymLive: vi.fn().mockResolvedValue({ ...live, sessions: [] }) };
    render(<GymLive service={service} />);
    expect(await screen.findByText(/Nobody has finished a workout today yet/)).toBeTruthy();
  });
});
