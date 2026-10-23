// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CoachQuietClients from './CoachQuietClients';
import { getQuietClients, buildQuietMessage, summarizeRecentSessions } from '../utils/quietClients';
import { APP_LINK } from '../utils/whatsappNudge';

const recentRows = vi.hoisted(() => ({ rows: [] }));
vi.mock('../services/databaseService', () => ({
  default: { getRecentWorkoutRowsForClients: vi.fn(() => Promise.resolve(recentRows.rows)) }
}));

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000 - 60 * 1000).toISOString();
const clients = [
  { id: 'active', userName: 'Active Anu', phone: '+919000000001', last_login: daysAgo(0) },
  { id: 'two', userName: 'Two Days', phone: '+919000000002', last_login: daysAgo(2) },
  { id: 'five', userName: 'Five Days', phone: '+919000000005', last_login: daysAgo(5) },
  { id: 'twenty', userName: 'Twenty Days', phone: '+919000000020', last_login: daysAgo(20) },
  { id: 'never', userName: 'New Invite', phone: '9000000099', last_login: null },
  { id: 'paused', userName: 'Paused Pat', phone: '+919000000030', last_login: daysAgo(30), paused_at: daysAgo(10) }
];

describe('CoachQuietClients', () => {
  beforeEach(() => { recentRows.rows = []; localStorage.clear(); localStorage.setItem('userName', 'Adarsh'); localStorage.setItem('userBrand', 'AK Fitness'); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('picks 3+ days quiet and never-logged-in, skips paused, longest-quiet first', () => {
    expect(getQuietClients(clients).map(q => q.client.id)).toEqual(['twenty', 'five', 'never']);
  });

  it('writes a different message for never-opened vs gone-quiet, with link and sign-off', () => {
    const quietMsg = buildQuietMessage(clients[2], 5, 'Adarsh · AK Fitness');
    expect(quietMsg).toMatch(/^Hi Five!/);
    expect(quietMsg).toContain("Haven't seen you");
    expect(quietMsg).toContain(APP_LINK);
    expect(quietMsg.endsWith('— Adarsh · AK Fitness')).toBe(true);
    expect(buildQuietMessage(clients[4], null, '')).toContain('have you had a chance to open it yet');
  });

  it('counts sessions per client as date + plan', () => {
    const recap = summarizeRecentSessions([
      { user_id: 'a', log_date: '2026-10-16', plan_name: 'Legs' },
      { user_id: 'a', log_date: '2026-10-16', plan_name: 'Legs' },
      { user_id: 'a', log_date: '2026-10-10', plan_name: 'Push' },
      { user_id: 'b', log_date: '2026-10-12', plan_name: null }
    ]);
    expect(recap.a).toEqual({ sessions: 2, sets: 3, lastDate: '2026-10-16' });
    expect(recap.b).toEqual({ sessions: 1, sets: 1, lastDate: '2026-10-12' });
  });

  it('tells a coach-logged client what is waiting in the app instead of "haven\'t seen you"', () => {
    const msg = buildQuietMessage(clients[2], 5, 'Adarsh · AK Fitness', { sessions: 3, sets: 43, lastDate: '2026-10-16' });
    expect(msg).toMatch(/^Hi Five!/);
    expect(msg).toContain("we've done 3 sessions together in the last 30 days (43 sets)");
    expect(msg).toContain('16 Oct');
    expect(msg).toContain('Measurements');
    expect(msg).not.toContain("Haven't seen you");
    expect(msg).toContain(APP_LINK);
    expect(msg.endsWith('— Adarsh · AK Fitness')).toBe(true);
  });

  it('sends the session recap from the card once it loads', async () => {
    recentRows.rows = [{ user_id: 'twenty', log_date: '2026-10-16', plan_name: 'Legs' }];
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<CoachQuietClients clients={clients} />);
    expect(await screen.findByText(/1 session in 30 days/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('WhatsApp')[0]);
    expect(new URL(openSpy.mock.calls[0][0]).searchParams.get('text')).toContain("we've done 1 session together");
  });

  it('renders nothing when no one is quiet', () => {
    const { container } = render(<CoachQuietClients clients={[clients[0], clients[1]]} />);
    expect(container.innerHTML).toBe('');
  });

  it('opens WhatsApp to the client and ticks them as messaged', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<CoachQuietClients clients={clients} />);
    expect(screen.getByText('👀 3 clients have gone quiet')).toBeTruthy();
    fireEvent.click(screen.getAllByText('WhatsApp')[0]);
    const url = new URL(openSpy.mock.calls[0][0]);
    expect(url.searchParams.get('phone')).toBe('919000000020');
    expect(url.searchParams.get('text')).toContain('— Adarsh · AK Fitness');
    expect(screen.getByText(/20 days since last open · ✓ messaged/)).toBeTruthy();
  });

  it('drops the tick once the client has logged in again since', () => {
    localStorage.setItem('coachQuietClientsSent', JSON.stringify({ five: { at: daysAgo(10), lastLogin: daysAgo(12) } }));
    render(<CoachQuietClients clients={clients} />);
    expect(screen.queryByText(/✓ messaged/)).toBeNull();
  });

  it('collapses and expands from the header, and remembers the choice', () => {
    render(<CoachQuietClients clients={clients} />);
    expect(screen.getByText(/Inactive for 3\+ days/)).toBeTruthy();
    fireEvent.click(screen.getByText('👀 3 clients have gone quiet'));
    expect(screen.queryByText('Twenty Days')).toBeNull();
    expect(screen.getByText('👀 3 clients have gone quiet')).toBeTruthy();
    cleanup();
    render(<CoachQuietClients clients={clients} />);
    expect(screen.queryByText('Twenty Days')).toBeNull();
    fireEvent.click(screen.getByText('👀 3 clients have gone quiet'));
    expect(screen.getByText('Twenty Days')).toBeTruthy();
  });

  it('opens the client when their name is tapped', () => {
    const onOpen = vi.fn();
    render(<CoachQuietClients clients={clients} onOpenClient={onOpen} />);
    fireEvent.click(screen.getByText('New Invite'));
    expect(onOpen).toHaveBeenCalledWith(clients[4]);
  });
});
