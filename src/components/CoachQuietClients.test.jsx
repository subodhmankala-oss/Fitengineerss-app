// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CoachQuietClients from './CoachQuietClients';
import { getQuietClients, buildQuietMessage } from '../utils/quietClients';
import { APP_LINK } from '../utils/whatsappNudge';

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
  beforeEach(() => { localStorage.clear(); localStorage.setItem('userName', 'Adarsh'); localStorage.setItem('userBrand', 'AK Fitness'); });
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

  it('opens the client when their name is tapped', () => {
    const onOpen = vi.fn();
    render(<CoachQuietClients clients={clients} onOpenClient={onOpen} />);
    fireEvent.click(screen.getByText('New Invite'));
    expect(onOpen).toHaveBeenCalledWith(clients[4]);
  });
});
