// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AdminWhatsappNudge from './AdminWhatsappNudge';
import { isFounderAudience, buildNudgeMessage, toWhatsappNumber, APP_LINK } from '../../utils/whatsappNudge';

const coaches = [
  { id: 'coach-me', name: 'Subodh', email: 'SubodhMankala@gmail.com' },
  { id: 'coach-ravi', name: 'Ravi', email: 'ravi@fitengineers.com' }
];
const clients = [
  { id: 'self', userName: 'Asha Rao', phone: '98765 43210', coach_id: null },
  { id: 'mine', userName: 'Kiran', phone: '+91 91234 56789', coach_id: 'coach-me' },
  { id: 'ravis', userName: 'Other', phone: '9000000000', coach_id: 'coach-ravi' },
  { id: 'unknown', userName: 'Ghost', phone: '9000000001', coach_id: 'coach-gone' },
  { id: 'nophone', userName: 'No Phone', phone: '', coach_id: null }
];

describe('AdminWhatsappNudge', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('targets Self-Guided and the founder\'s own clients only', () => {
    expect(clients.filter(c => isFounderAudience(c, coaches)).map(c => c.id)).toEqual(['self', 'mine', 'nophone']);
  });

  it('fills the first name and ends with the app link', () => {
    expect(buildNudgeMessage('Hi {name}, come back!', clients[0])).toBe(`Hi Asha, come back!\n\n${APP_LINK}`);
    expect(buildNudgeMessage('Hi {name}', { userName: '' })).toBe(`Hi there\n\n${APP_LINK}`);
  });

  it('normalises Indian numbers', () => {
    expect(toWhatsappNumber('98765 43210')).toBe('919876543210');
    expect(toWhatsappNumber('+91 91234 56789')).toBe('919123456789');
  });

  it('opens WhatsApp for one client and ticks them as sent', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AdminWhatsappNudge clients={clients} coachesList={coaches} tileLabel="6+ days inactive" />);
    fireEvent.click(screen.getByText(/WhatsApp these as Fitengineers team/));
    expect(screen.getByText(/1 skipped \(no phone number\)/)).toBeTruthy();
    expect(screen.queryByText('Other')).toBeNull();
    fireEvent.click(screen.getAllByText('Send')[0]);
    const url = new URL(openSpy.mock.calls[0][0]);
    expect(url.searchParams.get('phone')).toBe('919876543210');
    expect(url.searchParams.get('text')).toContain(APP_LINK);
    expect(screen.getByText('1 of 2 sent')).toBeTruthy();
  });
});
