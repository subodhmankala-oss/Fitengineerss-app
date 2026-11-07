// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import GymLive from './GymLive';

const live = {
  success: true, gym: { id: 'g1' }, today: '2026-10-23', weekStart: '2026-10-20',
  members: [{ id: 'a', name: 'Asha Rao', sex: 'female' }, { id: 'b', name: 'Bala K', sex: 'male' }, { id: 'c', name: 'Chitra M', sex: null }],
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
    expect(screen.getByText('kcal burned today')).toBeTruthy();
    expect(screen.getByText('members trained')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(names()).toEqual(['Asha Rao', 'Bala K', 'Chitra M']);
    expect(within(list).getAllByText('420').length).toBe(1);
  });

  it('says so when nobody has trained yet', async () => {
    const service = { getGymLive: vi.fn().mockResolvedValue({ ...live, sessions: [] }) };
    render(<GymLive service={service} />);
    expect(await screen.findByText(/Nobody has finished a workout today yet/)).toBeTruthy();
  });

  it('has All / Male / Female tabs that re-rank the board', async () => {
    const service = { getGymLive: vi.fn().mockResolvedValue(live) };
    render(<GymLive service={service} />);
    const list = await screen.findByRole('list');
    const names = () => within(list).getAllByRole('listitem').map((li) => li.querySelector('.gx-live-name').textContent);
    expect(screen.getByRole('tab', { name: /All/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: /Female/ }));
    expect(names()).toEqual(['Asha Rao']);
    expect(screen.getByText(/1 member hasn’t said male or female yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Male/ }));
    expect(names()).toEqual(['Bala K']);
    fireEvent.click(screen.getByRole('tab', { name: /All/ }));
    expect(names()).toHaveLength(3);
  });

  it('shows who is mid-workout and their calories so far', async () => {
    const withProgress = { ...live, inProgress: [{ memberId: 'c', kcal: 90, sets: 4, lastTickAt: '2026-10-23T08:00:00Z', withTrainer: false }] };
    const service = { getGymLive: vi.fn().mockResolvedValue(withProgress) };
    render(<GymLive service={service} />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText(/Working out · 4 sets done/)).toBeTruthy();
    expect(within(list).getAllByRole('listitem')[2].querySelector('.gx-live-name').textContent).toBe('Chitra M');
  });

  it('gives the owner a link to share, and hides it on the shared page', async () => {
    const service = { getGymLive: vi.fn().mockResolvedValue({ ...live, boardToken: 'abc' }) };
    const { unmount } = render(<GymLive service={service} />);
    const box = await screen.findByLabelText('Link to the live board');
    expect(box.value).toContain('/gym/board/abc');
    unmount();
    render(<GymLive service={service} publicView />);
    await screen.findByRole('list');
    expect(screen.queryByLabelText('Link to the live board')).toBeNull();
  });

  it('refreshes fast while someone is training, and reads saved workouts the moment they finish', async () => {
    const open = { ...live, inProgress: [{ memberId: 'c', kcal: 90, sets: 4, lastTickAt: null, withTrainer: false }] };
    const calls = [];
    const service = {
      getGymLive: vi.fn(async ({ light }) => {
        calls.push(light ? 'light' : 'full');
        if (!light) return calls.filter((c) => c === 'light').length >= 2 ? { ...live, inProgress: [] } : open;
        return calls.filter((c) => c === 'light').length < 2 ? { success: true, inProgress: open.inProgress } : { success: true, inProgress: [] };
      })
    };
    render(<GymLive service={service} activeMs={5} idleMs={5000} fullMs={100000} />);
    await waitFor(() => expect(calls.filter((c) => c === 'full').length).toBe(2));
    expect(calls.slice(0, 4)).toEqual(['full', 'light', 'light', 'full']);
  });
});
