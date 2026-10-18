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

  it('badge opens the detail popover on tap', () => {
    render(<WorkoutStreakCard logs={logs} />);
    fireEvent.click(screen.getByRole('button', { name: /2 workouts in a row/ }));
    expect(screen.getByRole('dialog', { name: 'Workout streak' }).textContent).toMatch(/Train again by/);
  });
});
