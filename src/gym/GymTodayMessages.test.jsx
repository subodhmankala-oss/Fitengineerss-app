import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import GymTodayMessages from './GymTodayMessages';
import GymUpiPanel from './GymUpiPanel';

const data = {
  gym: { name: 'Iron Den' },
  insights: { today: '2026-11-10' },
  clients: [
    { id: 'a', name: 'Ravi Kumar', phone: '9000000001', lastWorkout: '2026-10-25' },
    { id: 'b', name: 'Neha Rao', phone: null, lastWorkout: '2026-10-20' }
  ]
};
const biz = { payments: [], memberships: [], paidByMembership: [], settings: null, messageLog: [] };

describe('GymTodayMessages', () => {
  afterEach(cleanup);
  let service;
  let onChanged;
  beforeEach(() => {
    service = { markGymMessageSent: vi.fn(async () => ({ success: true })) };
    onChanged = vi.fn();
    delete window.location;
    window.location = { href: '' };
    window.open = vi.fn();
  });

  it('lists who to message and, on Send, opens WhatsApp and records it as sent', async () => {
    render(<GymTodayMessages data={data} biz={biz} service={service} onChanged={onChanged} />);
    expect(screen.getByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getAllByText('We miss you')).toHaveLength(2);
    // Neha (listed first, A to Z) has no phone: her Send button is disabled.
    const sends = screen.getAllByRole('button', { name: 'Send' });
    expect(sends.map((b) => b.disabled)).toEqual([true, false]);

    fireEvent.click(sends[1]);
    await waitFor(() => expect(service.markGymMessageSent).toHaveBeenCalledWith({ memberId: 'a', kind: 'miss', ref: '2026-10-25', action: 'sent' }));
    expect(window.open.mock.calls[0][0]).toContain('web.whatsapp.com/send');
    expect(window.open.mock.calls[0][0]).toContain('phone=919000000001');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByText('Ravi Kumar')).toBeNull();
  });

  it('Skip records it as skipped without opening WhatsApp', async () => {
    render(<GymTodayMessages data={data} biz={biz} service={service} onChanged={onChanged} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip' })[1]);
    await waitFor(() => expect(service.markGymMessageSent).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'a', action: 'skipped' })));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('shows an empty state, and nothing at all when every switch is off', () => {
    const { container, rerender } = render(<GymTodayMessages data={{ ...data, clients: [] }} biz={biz} service={service} onChanged={onChanged} />);
    expect(screen.getByText(/Nothing to send today/)).toBeTruthy();
    rerender(<GymTodayMessages data={data} biz={{ ...biz, settings: { wa_renewal: false, wa_miss: false, wa_receipt: false } }} service={service} onChanged={onChanged} />);
    expect(container.textContent).toBe('');
  });
});

describe('GymUpiPanel', () => {
  afterEach(cleanup);
  const member = { name: 'Ravi Kumar' };
  const plan = { due: 2500, planName: 'Quarterly' };
  it('shows a QR and copy button for the amount due', async () => {
    render(<GymUpiPanel upiId="irondenfit@okhdfcbank" gymName="Iron Den" member={member} plan={plan} />);
    expect(screen.getByText('Collect ₹2,500 on UPI')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:image\/png/));
    expect(screen.getByRole('button', { name: 'Copy pay link' })).toBeTruthy();
  });
  it('asks for the UPI ID in Settings when there is none', () => {
    render(<GymUpiPanel upiId="" gymName="Iron Den" member={member} plan={plan} />);
    expect(screen.getByText(/Add your UPI ID in Settings/)).toBeTruthy();
  });
});
