// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GymFreezeForm from './GymFreezeForm';

afterEach(cleanup);

const member = { id: 'r', name: 'Rahul S' };
const plan = { planName: 'Quarterly', endsOn: '2027-01-12', daysLeft: 45 };

describe('Freeze plan form', () => {
  it('previews the new end date and saves days + reason', async () => {
    const service = { freezeGymMembership: vi.fn().mockResolvedValue({ success: true }) };
    const onDone = vi.fn();
    render(<GymFreezeForm member={member} plan={plan} today="2026-11-28" service={service} onDone={onDone} onCancel={() => {}} />);
    expect(screen.getByTestId('freeze-preview').textContent).toContain('27 Jan instead of 12 Jan (+15 days)');
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Illness' }));
    expect(screen.getByTestId('freeze-preview').textContent).toContain('11 Feb');
    fireEvent.click(screen.getByRole('button', { name: 'Freeze plan' }));
    await waitFor(() => expect(service.freezeGymMembership).toHaveBeenCalledWith({ memberId: 'r', days: 30, reason: 'illness', startsOn: null }));
    expect(onDone).toHaveBeenCalled();
  });

  it('rejects more than 90 days without calling the server', () => {
    const service = { freezeGymMembership: vi.fn() };
    render(<GymFreezeForm member={member} plan={plan} today="2026-11-28" service={service} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('21'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Freeze plan' }));
    expect(screen.getByRole('alert').textContent).toContain('1 to 90 days');
    expect(service.freezeGymMembership).not.toHaveBeenCalled();
  });
});
