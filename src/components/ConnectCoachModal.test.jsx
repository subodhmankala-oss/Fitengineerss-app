// @vitest-environment jsdom
// One box for both kinds of code: a coach's invite code links the coach; a
// gym's GYM-XXXX code joins the gym and waits for the owner to assign a
// trainer.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: { connectClientToCoach: vi.fn() }
}));

import databaseService from '../services/databaseService';
import ConnectCoachModal from './ConnectCoachModal';

describe('ConnectCoachModal', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

  const submit = (value) => {
    fireEvent.change(screen.getByLabelText('Coach or Gym Code'), { target: { value } });
    fireEvent.click(screen.getByText('Connect'));
  };

  it('a gym code shows the gym welcome and reports the gym to the screen', async () => {
    databaseService.connectClientToCoach.mockResolvedValue({ success: true, gymName: 'Test Gym', hasTrainer: false });
    const onSuccess = vi.fn();
    render(<ConnectCoachModal onClose={() => {}} onSuccess={onSuccess} />);
    submit('GYM-QFAP');
    expect(await screen.findByText('You joined Test Gym!')).toBeTruthy();
    expect(screen.getByText(/Your gym will assign you a trainer soon/)).toBeTruthy();
    vi.advanceTimersByTime(3000);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(undefined, expect.objectContaining({ gymName: 'Test Gym', hasTrainer: false })));
  });

  it('a coach code keeps the usual "Connected!" message', async () => {
    databaseService.connectClientToCoach.mockResolvedValue({ success: true, coachId: 'coach-1' });
    const onSuccess = vi.fn();
    render(<ConnectCoachModal onClose={() => {}} onSuccess={onSuccess} />);
    submit('ABC123');
    expect(await screen.findByText('Connected!')).toBeTruthy();
    vi.advanceTimersByTime(1500);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('coach-1', expect.objectContaining({ coachId: 'coach-1' })));
  });

  it('shows the server error for a refused gym code', async () => {
    databaseService.connectClientToCoach.mockResolvedValue({ success: false, error: "You're already connected to a coach. Ask your gym to move you over." });
    render(<ConnectCoachModal onClose={() => {}} onSuccess={() => {}} />);
    submit('GYM-QFAP');
    expect(await screen.findByText(/already connected to a coach/)).toBeTruthy();
  });
});
