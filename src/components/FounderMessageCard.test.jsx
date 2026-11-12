// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getMyFounderMessages: vi.fn(),
  dismissFounderMessage: vi.fn(),
  replyToFounderMessage: vi.fn()
}));
const notify = vi.hoisted(() => ({ notifyEvent: vi.fn() }));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));
vi.mock('../utils/pushNotify', () => notify);

import FounderMessageCard from './FounderMessageCard';
import { isFounderMessageFresh } from '../utils/founderMessage';

const welcome = {
  id: 'm1', clientId: 'client-1', kind: 'welcome',
  message: 'Hi Rahul! I’m Subodh, founder of Fitengineers.',
  senderName: 'Subodh Mankala', senderAvatarUrl: 'https://lh3.googleusercontent.com/a/photo',
  clientReply: null, clientReplyAt: null
};
const personal = { ...welcome, id: 'm2', kind: 'message', message: 'How is week one going?' };

describe('FounderMessageCard', () => {
  beforeEach(() => {
    db.getMyFounderMessages.mockResolvedValue([personal, welcome]);
    db.replyToFounderMessage.mockResolvedValue({ success: true });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows the founder photo, name, role and message', async () => {
    render(<FounderMessageCard />);
    expect(await screen.findByText('Hi Rahul! I’m Subodh, founder of Fitengineers.')).toBeTruthy();
    expect(screen.getAllByText('Founder, Fitengineers')).toHaveLength(2);
    const img = screen.getAllByAltText('Subodh Mankala')[0];
    expect(img.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('compact (sign-up wizard) shows only the newest message', async () => {
    render(<FounderMessageCard compact />);
    expect(await screen.findByText('How is week one going?')).toBeTruthy();
    expect(screen.queryByText('Hi Rahul! I’m Subodh, founder of Fitengineers.')).toBeNull();
  });

  it('falls back to initials when there is no photo', async () => {
    db.getMyFounderMessages.mockResolvedValue([{ ...welcome, senderAvatarUrl: null }]);
    render(<FounderMessageCard />);
    expect(await screen.findByText('SM')).toBeTruthy();
  });

  it('replying saves it, notifies the founder and locks the reply box', async () => {
    db.getMyFounderMessages.mockResolvedValue([welcome]);
    render(<FounderMessageCard />);
    const input = await screen.findByLabelText('Reply to Subodh Mankala');
    fireEvent.change(input, { target: { value: 'I can’t find my plan' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByText(/You replied: “I can’t find my plan”/)).toBeTruthy());
    expect(db.replyToFounderMessage).toHaveBeenCalledWith('m1', 'I can’t find my plan');
    expect(notify.notifyEvent).toHaveBeenCalledWith('founder_reply', { clientUserId: 'client-1', message: 'I can’t find my plan' });
    expect(screen.queryByLabelText('Reply to Subodh Mankala')).toBeNull();
  });

  it('✕ dismisses it', async () => {
    db.getMyFounderMessages.mockResolvedValue([welcome]);
    render(<FounderMessageCard />);
    fireEvent.click(await screen.findByLabelText('Dismiss message'));
    expect(screen.queryByText('Hi Rahul! I’m Subodh, founder of Fitengineers.')).toBeNull();
    expect(db.dismissFounderMessage).toHaveBeenCalledWith('m1');
  });

  it('hides a message once it is a week old', async () => {
    const day = 24 * 60 * 60 * 1000;
    db.getMyFounderMessages.mockResolvedValue([
      { ...personal, createdAt: new Date(Date.now() - 2 * day).toISOString() },
      { ...welcome, createdAt: new Date(Date.now() - 8 * day).toISOString() }
    ]);
    render(<FounderMessageCard />);
    expect(await screen.findByText('How is week one going?')).toBeTruthy();
    expect(screen.queryByText('Hi Rahul! I’m Subodh, founder of Fitengineers.')).toBeNull();
  });

  it('isFounderMessageFresh: under 7 days shows, 7+ days hides', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(isFounderMessageFresh({ createdAt: '2026-11-06T10:00:01Z' }, now)).toBe(true);
    expect(isFounderMessageFresh({ createdAt: '2026-11-05T10:00:00Z' }, now)).toBe(false);
  });

  it('renders nothing when there are no messages', async () => {
    db.getMyFounderMessages.mockResolvedValue([]);
    const { container } = render(<FounderMessageCard />);
    await waitFor(() => expect(db.getMyFounderMessages).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
