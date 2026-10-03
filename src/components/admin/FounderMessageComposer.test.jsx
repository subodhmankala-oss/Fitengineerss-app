// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({ sendFounderMessage: vi.fn() }));
const notify = vi.hoisted(() => ({ notifyEvent: vi.fn() }));
vi.mock('../../services/databaseService', () => ({ __esModule: true, default: db }));
vi.mock('../../utils/pushNotify', () => notify);

import FounderMessageComposer from './FounderMessageComposer';

describe('FounderMessageComposer', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('starts with a greeting using their first name', () => {
    render(<FounderMessageComposer client={{ id: 'c1', name: 'Rahul Naik' }} onClose={() => {}} />);
    expect(screen.getByLabelText('Message').value).toBe('Hi Rahul! ');
  });

  it('sends the message and pushes it to the client', async () => {
    db.sendFounderMessage.mockResolvedValue({ success: true });
    render(<FounderMessageComposer client={{ id: 'c1', name: 'Rahul Naik' }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi Rahul! Need help with step 2?' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText('Sent ✓')).toBeTruthy());
    expect(db.sendFounderMessage).toHaveBeenCalledWith('c1', 'Hi Rahul! Need help with step 2?');
    expect(notify.notifyEvent).toHaveBeenCalledWith('founder_message', { clientUserId: 'c1', message: 'Hi Rahul! Need help with step 2?' });
  });

  it('shows the error and does not push when saving fails', async () => {
    db.sendFounderMessage.mockResolvedValue({ success: false, error: 'not allowed' });
    render(<FounderMessageComposer client={{ id: 'c1', name: 'Rahul' }} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('not allowed')).toBeTruthy();
    expect(notify.notifyEvent).not.toHaveBeenCalled();
  });
});
