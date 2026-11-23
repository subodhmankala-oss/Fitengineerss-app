// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import WeekMuscleSheet from './WeekMuscleSheet';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';
import { regionBand } from '../utils/muscleRegions';

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
    expect(sheet.textContent).toContain('2 sets today');
    expect(sheet.textContent).toContain('960 kg volume');

    const home = getWeeklyMuscleStats([...saved, ...live], '2026-11-16', '2026-11-22', { level: 'intermediate' })
      .find(s => s.muscle === 'Chest');
    const card = [...sheet.querySelectorAll('.wms-card')].find(c => c.querySelector('strong').textContent === 'Chest');
    expect(card.textContent).toContain(home.status.label);
    expect(card.textContent).toContain(`${home.sets} / ${home.target} sets`);
    expect(card.textContent).toContain(`${home.min - home.sets} more to Optimal`);
    expect(card.textContent).toContain(`${home.completionPercent}%`);
    expect(card.textContent).toContain('+2 today');
    // The chest part today's sets went to, on its own small line.
    expect(card.querySelector('.wms-chip')).not.toBeNull();
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

  describe('next-part row', () => {
    const midMin = regionBand('Chest', 'intermediate').min;
    const times = (n, row) => Array.from({ length: n }, () => row);
    const showActs = (savedLogs, liveRows, extra = {}) => {
      const acts = { onAddExercise: vi.fn(), onSaveForLater: vi.fn(), workoutNames: ['Barbell Bench Press'], laterNames: [], ...extra };
      render(<WeekMuscleSheet open onClose={() => {}} savedLogs={savedLogs} liveRows={liveRows} logDate={DATE} level="intermediate" {...acts} />);
      const sheet = screen.getByRole('dialog', { name: "This week's muscles" });
      const card = [...sheet.querySelectorAll('.wms-card')].find(c => c.querySelector('strong').textContent === 'Chest');
      return { sheet, card, acts };
    };

    it('shows the untouched parts before today finishes one (Mid Chest 1/4 → Upper, Lower)', () => {
      const { card } = showActs([], [bench(DATE)]);
      const chips = [...card.querySelectorAll('.wms-nchip')].map(b => b.textContent.trim());
      expect(chips.some(t => t.includes('Upper Chest'))).toBe(true);
      expect(chips.some(t => t.includes('Lower Chest'))).toBe(true);
      expect(chips.some(t => t.includes('Mid Chest'))).toBe(false); // worked today: shown above, not suggested
    });

    it('is hidden once every part is done or touched today', () => {
      const incline = { ...bench(DATE), exercise_name: 'Incline Dumbbell Press' };
      const dip = { ...bench(DATE), exercise_name: 'Chest Dip' };
      const { card } = showActs([], [bench(DATE), incline, dip]);
      expect(card.querySelector('.wms-next')).toBeNull();
    });

    it('offers the other chest parts to add now while chest is under Optimal', () => {
      const { card, acts } = showActs([], times(midMin, bench(DATE)));
      const chips = [...card.querySelectorAll('.wms-nchip.is-now')].map(b => b.textContent.trim());
      expect(chips.some(t => t.endsWith('Upper Chest 0/' + midMin))).toBe(true);
      expect(chips.some(t => t.includes('Lower Chest'))).toBe(true);
      expect(card.textContent).toContain('Finish the rest of your chest');

      fireEvent.click([...card.querySelectorAll('.wms-nchip')].find(b => b.textContent.includes('Upper Chest')));
      const pick = screen.getByRole('dialog', { name: 'Upper Chest' });
      fireEvent.click(pick.querySelector('.wms-pick-add'));
      expect(acts.onAddExercise).toHaveBeenCalledTimes(1);
      expect(acts.onAddExercise.mock.calls[0][0]).toMatch(/incline|low.to.high|landmine/i);
      expect(screen.queryByRole('dialog', { name: 'Upper Chest' })).toBeNull();
    });

    it('saves for the next chest day once chest is already in Optimal', () => {
      const saved = times(14, bench('2026-11-16'));
      const { card, acts } = showActs(saved, [bench(DATE)]);
      expect(card.textContent).toContain('Next chest day');
      expect(card.querySelector('.wms-nchip.is-now')).toBeNull();
      fireEvent.click([...card.querySelectorAll('.wms-nchip.is-later')].find(b => b.textContent.includes('Upper Chest')));
      const pick = screen.getByRole('dialog', { name: 'Upper Chest' });
      expect(pick.querySelector('.wms-pick-add')).toBeNull();
      fireEvent.click(pick.querySelector('.wms-pick-later'));
      expect(acts.onSaveForLater).toHaveBeenCalledWith(expect.any(String), 'Upper Chest');
    });

    it('shows an added or saved exercise instead of the chip', () => {
      const { card } = showActs([], times(midMin, bench(DATE)), {
        workoutNames: ['Barbell Bench Press', 'Incline Dumbbell Press'],
        laterNames: [],
      });
      const set = [...card.querySelectorAll('.wms-nchip.is-set')].map(c => c.textContent.trim());
      expect(set.some(t => t.endsWith('Incline Dumbbell Press added'))).toBe(true);
    });

    it('turns a part 1-2 sets short into a +N sets button for the exercise that trained it', () => {
      const onAddSets = vi.fn();
      const { card } = showActs([], times(midMin - 1, bench(DATE)), { onAddSets });
      const btn = card.querySelector('.wms-chip--topup');
      expect(btn.textContent).toContain(`Mid Chest ${midMin - 1}/${midMin}`);
      expect(btn.textContent.trim().endsWith('+')).toBe(true);
      expect(btn.getAttribute('aria-label')).toContain('add 1 set of Barbell Bench Press');
      fireEvent.click(btn);
      expect(onAddSets).toHaveBeenCalledWith('Barbell Bench Press', 1);
    });

    it('no +N sets once the muscle has had enough', () => {
      const saved = times(14, { ...bench('2026-11-16'), exercise_name: 'Incline Dumbbell Press' });
      const { card } = showActs(saved, [bench(DATE)], { onAddSets: vi.fn() });
      expect(card.querySelector('.wms-chip--topup')).toBeNull();
    });

    it('undoes an added or saved exercise from the chip', () => {
      const onUnsave = vi.fn();
      const onRemoveExercise = vi.fn();
      const { card } = showActs([], times(midMin, bench(DATE)), {
        workoutNames: ['Barbell Bench Press', 'Incline Dumbbell Press'],
        laterNames: ['Assisted Dip'],
        onUnsave, onRemoveExercise,
      });
      fireEvent.click(card.querySelector('[aria-label="Undo Incline Dumbbell Press"]'));
      expect(onRemoveExercise).toHaveBeenCalledWith('Incline Dumbbell Press');
      fireEvent.click(card.querySelector('[aria-label="Undo Assisted Dip"]'));
      expect(onUnsave).toHaveBeenCalledWith('Assisted Dip');
    });

    it('works for leg muscles too: Vastus done on Quads offers Rectus Femoris', () => {
      const n = regionBand('Quads', 'intermediate').min;
      const squat = { ...bench(DATE), exercise_name: 'Barbell Squat' };
      const { sheet } = showActs([], times(n, squat), { workoutNames: ['Barbell Squat'] });
      const quads = [...sheet.querySelectorAll('.wms-card')].find(c => c.querySelector('strong').textContent === 'Quads');
      expect(quads.textContent).toContain('Vastus Muscles');
      const chips = [...quads.querySelectorAll('.wms-nchip')].map(b => b.textContent.trim());
      expect(chips.some(t => t.startsWith('Rectus Femoris') || t.includes('Rectus Femoris'))).toBe(true);
      expect(quads.textContent).toContain('Finish the rest of your quads');
    });

    it('is not shown without logger actions (read-only)', () => {
      const sheet = show([], times(midMin, bench(DATE)));
      expect(sheet.querySelector('.wms-next')).toBeNull();
    });
  });
  describe('live line and the other muscles', () => {
    const squat = date => ({ ...bench(date), exercise_name: 'Barbell Squat' });

    it("names the muscles being trained now", () => {
      const sheet = show([], [bench(DATE)]);
      const line = sheet.querySelector('.wms-now');
      expect(line.textContent).toContain('Training now');
      expect(line.textContent).toContain('Chest');
      cleanup();
      expect(show([], []).querySelector('.wms-now')).toBeNull();
    });

    it('stacks every muscle this workout skipped, worst first, and fans out on tap', async () => {
      cleanup();
      const sheet = show([squat('2026-11-16'), squat('2026-11-16')], [bench(DATE)]);
      const names = () => [...sheet.querySelectorAll('.wms-ocard strong')].map(n => n.textContent);
      expect(names()).toHaveLength(3); // collapsed: only the top three render
      expect(names()).not.toContain('Chest');
      fireEvent.click(screen.getByRole('button', { name: /Show \d+ more muscles/ }));
      const all = names();
      expect(all.length).toBeGreaterThan(3);
      expect(all).toContain('Quads');
      expect(all.indexOf('Quads')).toBe(all.length - 1); // the only one trained this week sits last
      const quads = [...sheet.querySelectorAll('.wms-ocard')].find(c => c.querySelector('strong').textContent === 'Quads');
      expect(quads.textContent).toContain('Last trained Monday');
      fireEvent.click(quads.querySelector('.wms-ocard-head'));
      expect(quads.querySelector('.wms-odetail')).not.toBeNull();
      expect(quads.querySelector('.wms-chip')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Stack them/ }));
      await waitFor(() => expect(names()).toHaveLength(3)); // after the fold animation
    });
  });
});
