import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkoutStreakCard from './WorkoutStreakCard';
import { getLocalDateString, shiftLocalDateString } from '../utils/dateUtils';

const today = getLocalDateString();
const logs = [{ log_date: shiftLocalDateString(today, -1) }, { log_date: today }];

describe('WorkoutStreakCard', () => {
  it('renders nothing before the first workout', () => {
    const { container } = render(<WorkoutStreakCard logs={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('coach line is one slim summary with 7 day dots', () => {
    const { container } = render(<WorkoutStreakCard logs={logs} />);
    expect(container.querySelector('.streak-line').textContent).toMatch(/2 in a row · best 2 · trained today · next by \w{3}/);
    expect(container.querySelectorAll('.streak-line-dot')).toHaveLength(7);
    expect(container.querySelectorAll('.streak-line-dot.is-trained')).toHaveLength(2);
    expect(container.querySelector('.streak-pop, .streak-detail')).toBeNull();
  });

  it('badge opens the detail popover on tap', () => {
    render(<WorkoutStreakCard logs={logs} variant="badge" />);
    fireEvent.click(screen.getByRole('button', { name: /2 workouts in a row/ }));
    expect(screen.getByRole('dialog', { name: 'Workout streak' }).textContent).toMatch(/Train again by/);
  });
});
