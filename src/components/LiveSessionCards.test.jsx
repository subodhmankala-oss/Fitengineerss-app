// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import LiveSessionCards from './LiveSessionCards';
import { MUSCLE_TARGETS } from '../utils/muscleAnalytics';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const bench = (ticks, weight = '40') => ({
  name: 'Bench Press',
  sets: ticks.map((t, i) => ({ weight, reps: '10', isCompleted: t, completedAt: t ? 1000 + i : null })),
});

const renderCards = (exercises, getPrevSet = () => null) =>
  render(<LiveSessionCards exercises={exercises} logDate="2026-10-31" savedLogs={[]} getPrevSet={getPrevSet} />);

describe('LiveSessionCards', () => {
  it('starts empty before any set is ticked', () => {
    renderCards([bench([false, false])]);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(screen.getByText('Tick a set to see it here')).toBeTruthy();
    expect(screen.getByText('0 kg')).toBeTruthy();
  });

  it('shows the muscles worked, sets left this week and kg lifted as sets are ticked', () => {
    const { rerender } = renderCards([bench([false, false])]);
    rerender(<LiveSessionCards exercises={[bench([true, true])]} logDate="2026-10-31" savedLogs={[]} getPrevSet={() => null} />);
    expect(screen.getByText('Chest, Triceps')).toBeTruthy();
    expect(screen.getByText('Chest this week')).toBeTruthy();
    expect(screen.getByText(`${MUSCLE_TARGETS.Chest.target - 2} more sets to go`)).toBeTruthy();
    expect(screen.getByText(/800 kg/)).toBeTruthy();
    expect(screen.getByText(/= a motorbike/)).toBeTruthy();
    expect(screen.getByText('100 kg more to lift a small car')).toBeTruthy();
  });

  it('celebrates a set that beats last time, then goes back', () => {
    vi.useFakeTimers();
    const prev = () => ({ weight: '40', reps: '10' });
    const { rerender } = renderCards([bench([false], '42.5')], prev);
    rerender(<LiveSessionCards exercises={[bench([true], '42.5')]} logDate="2026-10-31" savedLogs={[]} getPrevSet={prev} />);
    expect(screen.getByText('New best')).toBeTruthy();
    expect(screen.getByText('Bench Press: 42.5 kg × 10')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.queryByText('New best')).toBeNull();
    expect(screen.getByText('Today you lifted')).toBeTruthy();
  });

  it('does not celebrate sets that were already ticked when the logger opened', () => {
    renderCards([bench([true], '42.5')], () => ({ weight: '40', reps: '10' }));
    expect(screen.queryByText('New best')).toBeNull();
  });
});
