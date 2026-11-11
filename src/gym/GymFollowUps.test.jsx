// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GymFollowUps from './GymFollowUps';
import GymLeads from './GymLeads';

afterEach(cleanup);

const data = { gym: { name: 'Iron House' }, insights: { today: '2026-11-10' } };
const leads = [
  { id: 'l1', name: 'Asha Rao', source: 'instagram', stage: 'new', phone: '9000000001', follow_up_on: '2026-11-10', note: 'evenings' },
  { id: 'l2', name: 'Bala K', source: 'walk-in', stage: 'lost', lost_reason: 'too_expensive', phone: null, follow_up_on: '2026-11-08' },
  { id: 'l3', name: 'Chitra M', source: 'google', stage: 'new', phone: null, follow_up_on: '2026-11-20' }
];

describe('Follow up today', () => {
  it('lists only follow-ups that are due and marks one done', async () => {
    const service = { gymLead: vi.fn().mockResolvedValue({ success: true }) };
    const onChanged = vi.fn();
    render(<GymFollowUps data={data} biz={{ leads }} service={service} onChanged={onChanged} />);
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('Bala K')).toBeTruthy();
    expect(screen.queryByText('Chitra M')).toBeNull();
    expect(screen.getByText(/Lost · Too expensive/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[1]);
    await waitFor(() => expect(service.gymLead).toHaveBeenCalledWith({ op: 'follow_up', leadId: 'l1', followUpOn: null }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('says so when nothing is due, and hides before leads are set up', () => {
    const { container, rerender } = render(<GymFollowUps data={data} biz={{ leads: [leads[2]] }} service={{}} />);
    expect(screen.getByText('No follow-ups due today.')).toBeTruthy();
    rerender(<GymFollowUps data={data} biz={{ leads: null }} service={{}} />);
    expect(container.textContent).toBe('');
  });
});

describe('Leads: lost + follow-up', () => {
  const biz = { leads, settings: { join_goal: 20 } };

  it('marks a lead lost only after a reason is picked', async () => {
    const service = { gymLead: vi.fn().mockResolvedValue({ success: true }) };
    render(<GymLeads data={data} biz={biz} service={service} onChanged={() => {}} />);
    expect(screen.getByRole('region', { name: 'Lost' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Lost' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Mark lost' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Pick why/);
    expect(service.gymLead).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Why they did not join'), { target: { value: 'joined_elsewhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark lost' }));
    await waitFor(() => expect(service.gymLead).toHaveBeenCalledWith({ op: 'move', leadId: 'l1', stage: 'lost', reason: 'joined_elsewhere' }));
  });

  it('sets a follow-up day and reopens a lost lead', async () => {
    const service = { gymLead: vi.fn().mockResolvedValue({ success: true }) };
    render(<GymLeads data={data} biz={biz} service={service} onChanged={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Follow up' })[0]);
    fireEvent.change(screen.getByLabelText('Follow up on'), { target: { value: '2026-11-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(service.gymLead).toHaveBeenCalledWith({ op: 'follow_up', leadId: 'l1', followUpOn: '2026-11-15' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(service.gymLead).toHaveBeenCalledWith({ op: 'move', leadId: 'l2', stage: 'new' }));
  });
});
