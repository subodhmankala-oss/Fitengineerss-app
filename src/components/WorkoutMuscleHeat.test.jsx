import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WorkoutMuscleHeat from './WorkoutMuscleHeat';
import { heatColor } from '../utils/workoutHeat';
import { tickedSetRows } from '../utils/liveSessionStore';
import { getWeekMuscleView } from '../utils/weekMuscleView';
import { getHeatMapTier } from '../utils/muscleAnalytics';

const DAY = '2026-11-15';
const bench = (sets) => ({ name: 'Bench Press', sets });

describe('WorkoutMuscleHeat', () => {
  afterEach(cleanup);

  it('names the muscles hit by ticked sets only', () => {
    const rows = tickedSetRows([bench([
      { weight: '60', reps: '8', isCompleted: true },
      { weight: '60', reps: '8', isCompleted: false },
    ])], DAY);
    render(<WorkoutMuscleHeat rows={rows} logDate={DAY} />);
    const btn = screen.getByRole('button', { name: /Muscles worked this workout/ });
    expect(btn.getAttribute('aria-label')).toMatch(/Chest/);
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it("opens This week's muscles, and warm-ups do not count", () => {
    const rows = tickedSetRows([bench([
      { weight: '40', reps: '10', isCompleted: true, isWarmup: true },
      { weight: '60', reps: '8', isCompleted: true },
      { weight: '60', reps: '8', isCompleted: true },
    ])], DAY);
    render(<WorkoutMuscleHeat rows={rows} logDate={DAY} />);
    fireEvent.click(screen.getByRole('button', { name: /Muscles worked this workout/ }));
    const sheet = screen.getByRole('dialog', { name: "This week's muscles" });
    expect(sheet.textContent).toContain('2 sets today');
    expect(sheet.textContent).toMatch(/Chest[\s\S]*\+2 today/);
  });

  it('shows an empty hint before any set is ticked', () => {
    render(<WorkoutMuscleHeat rows={[]} logDate={DAY} />);
    fireEvent.click(screen.getByRole('button', { name: /none yet/ }));
    expect(screen.getByText(/Tick a set/)).toBeTruthy();
  });

  it('heat gets hotter with more sets', () => {
    expect(heatColor(0)).toBeNull();
    expect(heatColor(0.5)).toBe('#fdba74');
    expect(heatColor(1)).toBe('#f97316');
    expect(heatColor(3)).toBe('#dc2626');
    expect(heatColor(6)).toBe('#991b1b');
  });

  it('paints the bar figures in the same weekly colours the sheet uses', () => {
    const rows = tickedSetRows([bench([
      { weight: '60', reps: '8', isCompleted: true },
      { weight: '60', reps: '8', isCompleted: true },
    ])], DAY);
    const { container } = render(<WorkoutMuscleHeat rows={rows} logDate={DAY} level="intermediate" />);
    const painted = container.innerHTML.toLowerCase();
    // 2 chest sets of ~16 is "Low" (blue), not today's peach/orange scale.
    const stat = getWeekMuscleView([], rows, DAY, 'intermediate').byAll.Chest;
    expect(getHeatMapTier(stat).key).toBe('low');
    expect(painted).toContain(getHeatMapTier(stat).color);
    expect(painted).not.toContain(heatColor(2).toLowerCase());
  });
});
