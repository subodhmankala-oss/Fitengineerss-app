// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { getLocalDateString } from '../../utils/dateUtils';

vi.mock('../../services/databaseService', () => ({
  default: { getExerciseLibrary: () => Promise.resolve([]) },
}));
import WeeklyMuscleAnalytics from './WeeklyMuscleAnalytics';

// Every day of the current month up to today gets 3 bench sets, so a week
// in reads Chest high and a month in reads Chest as a weekly average.
const today = new Date();
const days = [];
for (let d = 1; d <= today.getDate(); d++) days.push(getLocalDateString(new Date(today.getFullYear(), today.getMonth(), d)));
const logs = days.flatMap(date => [0, 1, 2].map(i => ({
  log_date: date, exercise_name: 'Bench Press', weight_kg: 40, reps: 10, set_type: null, created_at: `${date}T10:0${i}:00.000Z`,
})));
const weekDays = Array.from({ length: 7 }, (_, i) => getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i)));

const monthName = (offset) => new Date(today.getFullYear(), today.getMonth() + offset, 1)
  .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const Harness = () => {
  const [monthOffset, setMonthOffset] = useState(0);
  return (
    <WeeklyMuscleAnalytics
      logs={logs}
      weekDays={weekDays}
      weekRangeLabel="This week"
      weeklyStats={{ totalVolume: 1, totalSets: 2, workoutsCount: 3, totalCalories: 4 }}
      weekOffset={0}
      setWeekOffset={() => {}}
      weekNavBtnStyle={{}}
      monthOffset={monthOffset}
      setMonthOffset={setMonthOffset}
      monthlyStats={{ totalVolume: 10, totalSets: 20, workoutsCount: 30, totalCalories: 40 }}
    />
  );
};

describe('WeeklyMuscleAnalytics — Week/Month toggle', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* no storage */ } });
  afterEach(cleanup);

  it('starts on the week and switches the cards to a per-week average for the month', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Week' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText(/Target Sets/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Month' }));
    expect(screen.getByRole('tab', { name: 'Month' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(monthName(0))).toBeTruthy();
    expect(screen.getAllByText(/Sets a Week \(avg\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/kg volume this month/).length).toBeGreaterThan(0);

    // Chest: 3 sets a day → 21 a week, whatever the month length so far
    // (fewer than 7 days counts as one week, so it can only be lower).
    const weeks = Math.max(1, days.length / 7);
    const avg = Math.round((days.length * 3 / weeks) * 10) / 10;
    expect(screen.getByText(`${avg} / 16 Sets a Week (avg)`)).toBeTruthy();

    // Can step back a month, not forward past this one.
    expect(screen.getByTitle('Already on the current month').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('Previous month'));
    expect(screen.getByText(monthName(-1))).toBeTruthy();
  });

  it('remembers the chosen period', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month' }));
    cleanup();
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Month' }).getAttribute('aria-selected')).toBe('true');
  });

  it('hides the toggle when the parent gives no month data', () => {
    render(
      <WeeklyMuscleAnalytics logs={logs} weekDays={weekDays} weekRangeLabel="This week"
        weeklyStats={{ totalVolume: 1, totalSets: 2, workoutsCount: 3, totalCalories: 4 }}
        weekOffset={0} setWeekOffset={() => {}} weekNavBtnStyle={{}} />
    );
    expect(screen.queryByRole('tab', { name: 'Month' })).toBeNull();
  });

  it('opens the neglected list from the "N neglected" link and comes back', () => {
    render(<Harness />);
    const link = screen.getByRole('button', { name: /\d+ neglected/ });
    fireEvent.click(link);
    expect(screen.getByText('Neglected Muscles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Balance/ }));
    expect(screen.getByText('Muscle Balance')).toBeTruthy();
  });
});
