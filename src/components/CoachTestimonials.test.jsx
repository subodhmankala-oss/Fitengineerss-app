import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({ default: { testimonials: vi.fn() } }));
vi.mock('../utils/whatsappNudge', () => ({
  toWhatsappNumber: (p) => `91${p}`,
  openWhatsapp: vi.fn(),
}));

import databaseService from '../services/databaseService';
import { openWhatsapp } from '../utils/whatsappNudge';
import CoachTestimonials from './CoachTestimonials';
import CoachTestimonialsManager from './CoachTestimonialsManager';

const priya = { id: 't1', quote: 'Never thought I would enjoy leg day.', result: 'Lost 8 kg', clientName: 'Priya S.', monthsTrained: 4 };

describe('CoachTestimonials (client)', () => {
  beforeEach(() => databaseService.testimonials.mockReset());
  afterEach(cleanup);

  it("shows the coach's approved testimonials as verified", async () => {
    databaseService.testimonials.mockResolvedValueOnce({ role: 'client', shown: [priya], mine: null });
    render(<CoachTestimonials />);
    expect(await screen.findByText(/Never thought I would enjoy leg day/)).toBeTruthy();
    expect(screen.getByText('Verified client')).toBeTruthy();
    expect(screen.getByText('Training 4 months')).toBeTruthy();
    expect(screen.getByText('Lost 8 kg')).toBeTruthy();
    expect(screen.getByText('Write a testimonial')).toBeTruthy();
  });

  it('writes one and shows it waiting for approval', async () => {
    databaseService.testimonials
      .mockResolvedValueOnce({ role: 'client', shown: [], mine: null })
      .mockResolvedValueOnce({ role: 'client', shown: [], mine: { id: 'm', quote: 'Great plans.', result: '', status: 'pending', clientName: 'Me' } });
    render(<CoachTestimonials />);
    fireEvent.click(await screen.findByText('Write a testimonial'));
    fireEvent.click(screen.getByText('Send to coach'));
    expect(screen.getByText('Write a few words first.')).toBeTruthy();
    expect(databaseService.testimonials).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText(/How has training/), { target: { value: 'Great plans.' } });
    fireEvent.click(screen.getByText('Send to coach'));
    await waitFor(() => expect(databaseService.testimonials).toHaveBeenLastCalledWith('save', { quote: 'Great plans.', result: '' }));
    expect(await screen.findByText('Waiting for your coach to approve')).toBeTruthy();
  });

  it('opens the form straight away from the WhatsApp link, pre-filled when editing', async () => {
    databaseService.testimonials.mockResolvedValueOnce({ role: 'client', shown: [], mine: { id: 'm', quote: 'Old words', result: '', status: 'shown', clientName: 'Me' } });
    render(<CoachTestimonials startWriting />);
    expect((await screen.findByPlaceholderText(/How has training/)).value).toBe('Old words');
    expect(screen.getByText('Save changes')).toBeTruthy();
  });

  it("copies the client's words and opens the coach's Google page, whatever the status", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    databaseService.testimonials.mockResolvedValueOnce({
      role: 'client', shown: [], googleReviewUrl: 'https://g.page/r/abc/review',
      mine: { id: 'm', quote: 'Great plans.', result: 'Lost 8 kg', status: 'pending', clientName: 'Me' },
    });
    render(<CoachTestimonials />);
    fireEvent.click(await screen.findByText('Also post on Google'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://g.page/r/abc/review', '_blank', 'noopener,noreferrer'));
    expect(writeText).toHaveBeenCalledWith('Great plans.\n\nLost 8 kg');
    expect(await screen.findByText(/Your words are copied/)).toBeTruthy();
    open.mockRestore();
  });

  it('has no Google button when the coach has no link, and reports writing to the modal', async () => {
    const onWritingChange = vi.fn();
    databaseService.testimonials.mockResolvedValueOnce({ role: 'client', shown: [], mine: null, googleReviewUrl: '' });
    render(<CoachTestimonials onWritingChange={onWritingChange} />);
    fireEvent.click(await screen.findByText('Write a testimonial'));
    expect(onWritingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onWritingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Also post on Google')).toBeNull();
  });

  it('renders nothing for someone without a coach', async () => {
    databaseService.testimonials.mockResolvedValueOnce({ role: 'none', shown: [], mine: null });
    const { container } = render(<CoachTestimonials />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('CoachTestimonialsManager (coach)', () => {
  beforeEach(() => databaseService.testimonials.mockReset());
  afterEach(cleanup);

  it('can show or hide, never edit, and asks clients on WhatsApp', async () => {
    databaseService.testimonials
      .mockResolvedValueOnce({
        role: 'coach',
        testimonials: [{ ...priya, clientName: 'Priya Sharma', status: 'pending' }],
        askable: [{ userId: 'u2', name: 'Arjun Mehta', phone: '9812345670' }, { userId: 'u3', name: 'No Phone', phone: '' }],
      })
      .mockResolvedValueOnce({ role: 'coach', testimonials: [{ ...priya, clientName: 'Priya Sharma', status: 'shown' }], askable: [] });
    render(<CoachTestimonialsManager />);

    expect(await screen.findByText('New')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('No phone number')).toBeTruthy();

    fireEvent.click(screen.getByText('Ask on WhatsApp'));
    expect(openWhatsapp).toHaveBeenCalledWith('919812345670', expect.stringMatching(/^Hi Arjun! .*\?openTestimonial=1$/));

    fireEvent.click(screen.getByText('Show on profile'));
    await waitFor(() => expect(databaseService.testimonials).toHaveBeenLastCalledWith('status', { id: 't1', status: 'shown' }));
    expect(await screen.findByText('Shown')).toBeTruthy();
  });
});
