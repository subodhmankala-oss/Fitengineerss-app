// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import CoachGymSection from './CoachGymSection';

const IN_GYM = { success: true, gym: { name: 'Test Gym', status: 'active', code: 'GYM-QFAP', isOwner: false }, clientsOutsideGym: 0 };
const NO_GYM = { success: true, gym: null, clientsOutsideGym: 3 };

const makeService = (first = NO_GYM, after = IN_GYM) => {
  let joined = false;
  return {
    getCoachGym: vi.fn(async () => (joined ? after : first)),
    coachJoinGym: vi.fn(async () => { joined = true; return { success: true, gym_name: 'Test Gym', clients_moved: 0 }; }),
    coachLeaveGym: vi.fn(async () => ({ success: true, gym_name: 'Test Gym', clients_left: 2 }))
  };
};

describe('CoachGymSection', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('joins with a code, keeping existing clients private by default', async () => {
    const service = makeService();
    const onChange = vi.fn();
    render(<CoachGymSection service={service} onMembershipChange={onChange} />);

    const input = await screen.findByLabelText('Gym code');
    fireEvent.change(input, { target: { value: 'gym-qfap' } });
    expect(input.value).toBe('GYM-QFAP');
    expect(screen.getByRole('checkbox').checked).toBe(false);
    expect(screen.getByText(/Also add my 3 current clients/)).toBeTruthy();

    fireEvent.click(screen.getByText('Join gym'));
    await waitFor(() => expect(service.coachJoinGym).toHaveBeenCalledWith('GYM-QFAP', false));
    expect(await screen.findByText('✓ You joined Test Gym.')).toBeTruthy();
    expect(screen.getByText('🏢 Test Gym')).toBeTruthy();
    expect(onChange).toHaveBeenCalled();
  });

  it('brings existing clients only when ticked', async () => {
    const service = makeService();
    service.coachJoinGym.mockResolvedValueOnce({ success: true, gym_name: 'Test Gym', clients_moved: 3 });
    render(<CoachGymSection service={service} />);
    fireEvent.change(await screen.findByLabelText('Gym code'), { target: { value: 'GYM-QFAP' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Join gym'));
    await waitFor(() => expect(service.coachJoinGym).toHaveBeenCalledWith('GYM-QFAP', true));
    expect(await screen.findByText(/3 of your clients moved in with you/)).toBeTruthy();
  });

  it('shows a wrong-code error and stays on the form', async () => {
    const service = makeService();
    service.coachJoinGym.mockResolvedValueOnce({ success: false, error: 'No gym found with that code. Check it with your gym owner.' });
    render(<CoachGymSection service={service} />);
    fireEvent.change(await screen.findByLabelText('Gym code'), { target: { value: 'GYM-ZZZZ' } });
    fireEvent.click(screen.getByText('Join gym'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No gym found/);
    expect(screen.getByLabelText('Gym code')).toBeTruthy();
  });

  it('a member sees the gym and can leave after confirming', async () => {
    const service = makeService(IN_GYM, NO_GYM);
    service.getCoachGym.mockResolvedValueOnce(IN_GYM).mockResolvedValue(NO_GYM);
    render(<CoachGymSection service={service} />);
    expect(await screen.findByText('🏢 Test Gym')).toBeTruthy();
    expect(screen.getByText('GYM-QFAP')).toBeTruthy();
    expect(screen.getByText(/never your private notes or photos/)).toBeTruthy();

    fireEvent.click(screen.getByText('Leave this gym'));
    expect(service.coachLeaveGym).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Leave gym'));
    await waitFor(() => expect(service.coachLeaveGym).toHaveBeenCalled());
    expect(await screen.findByText('✓ You left Test Gym.')).toBeTruthy();
    expect(screen.getByLabelText('Gym code')).toBeTruthy();
  });

  it('a member can add clients who are not in the gym yet', async () => {
    const withOutside = { ...IN_GYM, clientsOutsideGym: 2 };
    const service = makeService(withOutside, IN_GYM);
    service.coachJoinGym.mockResolvedValueOnce({ success: true, gym_name: 'Test Gym', clients_moved: 2 });
    render(<CoachGymSection service={service} />);
    fireEvent.click(await screen.findByText('Add them'));
    await waitFor(() => expect(service.coachJoinGym).toHaveBeenCalledWith('GYM-QFAP', true));
    expect(await screen.findByText('✓ 2 clients added to Test Gym.')).toBeTruthy();
  });

  it('an owner cannot leave their own gym', async () => {
    const service = makeService({ ...IN_GYM, gym: { ...IN_GYM.gym, isOwner: true } });
    render(<CoachGymSection service={service} />);
    expect(await screen.findByText(/You own this gym/)).toBeTruthy();
    expect(screen.queryByText('Leave this gym')).toBeNull();
  });
});
