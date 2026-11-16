// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { SetRingHeaderMuscle } from './SetMuscleRing';

// Tapping the muscle drawing over the set table's ring column opens
// "This week's muscles": the saved week plus the sets ticked so far.
const DATE = '2026-11-18'; // a Wednesday
const set = (date, kg = 20, reps = 10) => ({ exercise_name: 'Barbell Bench Press', log_date: date, weight_kg: kg, reps, set_type: 'normal' });

describe('SetRingHeaderMuscle → WeekMuscleSheet', () => {
  afterEach(cleanup);

  const open = (props) => {
    render(<SetRingHeaderMuscle exerciseName="Barbell Bench Press" rings={{}} exIdx={0} logDate={DATE} level="intermediate" {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /open this week's muscles/i }));
    return screen.getByRole('dialog', { name: "This week's muscles" });
  };

  it('counts the saved week plus the live sets, and shows what today added', () => {
    const saved = [set('2026-11-16'), set('2026-11-16'), set('2026-11-09')]; // last week's set doesn't count
    const live = [set(DATE), set(DATE), set(DATE, 0)]; // empty kg doesn't count
    const dialog = open({ savedLogs: saved, liveRows: live });
    expect(dialog.textContent).toContain('live · 2 sets today');
    const main = dialog.querySelector('.wms-main');
    expect(main.textContent).toMatch(/this exercise/);
    expect(main.querySelector('.wms-main-num').textContent).toMatch(/^4\/\d+ ↑2$/);
    expect(dialog.querySelectorAll('.wms-body')).toHaveLength(2);
  });

  it('closes from the handle', () => {
    open({ savedLogs: [], liveRows: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a plain drawing when the logger passes no date', () => {
    render(<SetRingHeaderMuscle exerciseName="Barbell Bench Press" rings={{}} exIdx={0} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
