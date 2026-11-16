// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import WeekMuscleSheet from './WeekMuscleSheet';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';

// "This week's muscles" (opened from the timer bar's body figures): one card
// per muscle this workout worked, with the same numbers as the home
// Muscle Balance cards, plus what today added.
const DATE = '2026-11-18'; // a Wednesday; week = 16th–22nd
const bench = (date, kg = 60) => ({ exercise_name: 'Barbell Bench Press', log_date: date, weight_kg: kg, reps: 8, set_type: 'normal' });

describe('WeekMuscleSheet', () => {
  afterEach(cleanup);

  const show = (savedLogs, liveRows, onClose = () => {}) => {
    render(<WeekMuscleSheet open onClose={onClose} savedLogs={savedLogs} liveRows={liveRows} logDate={DATE} level="intermediate" />);
    return screen.getByRole('dialog', { name: "This week's muscles" });
  };

  it("shows each worked muscle exactly as its home card does, plus today's sets", () => {
    const saved = [bench('2026-11-16'), bench('2026-11-16'), bench('2026-11-09')]; // last week's set doesn't count
    const live = [bench(DATE), bench(DATE), bench(DATE, 0)]; // empty kg doesn't count
    const sheet = show(saved, live);
    expect(sheet.textContent).toContain('live · 2 sets today');

    const home = getWeeklyMuscleStats([...saved, ...live], '2026-11-16', '2026-11-22', { level: 'intermediate' })
      .find(s => s.muscle === 'Chest');
    const card = [...sheet.querySelectorAll('.wms-card')].find(c => c.querySelector('strong').textContent === 'Chest');
    expect(card.textContent).toContain(home.status.label);
    expect(card.textContent).toContain(`${home.sets} / ${home.target} target sets`);
    expect(card.textContent).toContain(`${home.completionPercent}%`);
    expect(card.textContent).toContain('↑2 today');
    // The chest part today's sets went to, on its own small line.
    expect(card.querySelector('.wms-part')).not.toBeNull();
  });

  it('lists only muscles this workout worked', () => {
    const sheet = show([{ ...bench('2026-11-16'), exercise_name: 'Barbell Squat' }], [bench(DATE)]);
    const names = [...sheet.querySelectorAll('.wms-card strong')].map(n => n.textContent);
    expect(names).toContain('Chest');
    expect(names).not.toContain('Quads');
  });

  it('shows a hint before any set is ticked, and closes from the handle', () => {
    let closed = false;
    const sheet = show([], [], () => { closed = true; });
    expect(sheet.textContent).toMatch(/Tick a set/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
