// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExerciseGuideModal from './ExerciseGuideModal';
import Avatar from './Avatar';
import { normalizeExerciseForGuide } from '../utils/videoUtils';

afterEach(cleanup);

// These components used to reset state from an effect when their input
// changed (react-hooks/set-state-in-effect), which only took hold after a
// render with the stale state. They now derive or key that state instead;
// these pin down that the reset still happens.
describe('state resets without effects', () => {
  it('ExerciseGuideModal opens each exercise on the Summary tab', () => {
    const squat = normalizeExerciseForGuide({ name: 'Squat' });
    const curl = normalizeExerciseForGuide({ name: 'Barbell Curl' });
    const { rerender } = render(<ExerciseGuideModal exercise={squat} onClose={() => {}} />);

    fireEvent.click(screen.getByText('How to'));
    expect(screen.getByText('How to').className).toContain('guide-tab-btn--active');

    rerender(<ExerciseGuideModal exercise={curl} onClose={() => {}} />);
    expect(screen.getByText('Summary').className).toContain('guide-tab-btn--active');
    expect(screen.getByText('How to').className).not.toContain('guide-tab-btn--active');
  });

  it('Avatar retries a new photo after the previous one failed to load', () => {
    const { container, rerender } = render(<Avatar name="Asha Rao" avatarUrl="https://example.com/a.png" />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull(); // initials fallback

    rerender(<Avatar name="Asha Rao" avatarUrl="https://example.com/b.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/b.png');
  });
});
