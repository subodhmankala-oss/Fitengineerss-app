import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoachFirstClientCard from './CoachFirstClientCard';
import { buildInviteShareText } from '../utils/inviteShare';

const base = { phoneDone: true, inviteCode: '', codeCreated: false, generating: false, onCreateCode: () => {}, coachName: 'Asha', origin: 'https://app.test' };

describe('CoachFirstClientCard', () => {
  it('offers to create the code when none exists, and calls the handler', () => {
    const onCreateCode = vi.fn();
    render(<CoachFirstClientCard {...base} onCreateCode={onCreateCode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create my invite code' }));
    expect(onCreateCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Share on WhatsApp')).toBeNull();
  });

  it('shows the code and a WhatsApp link once created', () => {
    render(<CoachFirstClientCard {...base} inviteCode="ABC123" codeCreated />);
    expect(screen.getByText('ABC123')).toBeTruthy();
    const link = screen.getByText('Share on WhatsApp');
    expect(link.getAttribute('href')).toContain('wa.me');
    expect(decodeURIComponent(link.getAttribute('href'))).toContain('invitation code: ABC123');
  });

  it('builds the same share text the Invite Clients card uses', () => {
    expect(buildInviteShareText(' Asha ', 'https://x', 'Q1')).toBe(
      "Hi! I'm Asha from Fitengineers. Join my coaching program here: https://x — use invitation code: Q1"
    );
  });
});
