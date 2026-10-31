// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LiveCoachCard from './LiveCoachCard';
import { MUSCLE_TARGETS } from '../utils/muscleAnalytics';

afterEach(cleanup);

const bench = (sets) => ({
  name: 'Bench Press',
  sets: sets.map(([reps, done], i) => ({ weight: '40', reps: String(reps), isCompleted: done, completedAt: done ? 1000 + i : null })),
});

const card = (exercises, getPrevSet = () => null) =>
  <LiveCoachCard exercises={exercises} logDate="2026-10-31" savedLogs={[]} getPrevSet={getPrevSet} />;

describe('LiveCoachCard', () => {
  it('invites the first tick', () => {
    render(card([bench([[10, false]])]));
    expect(screen.getByText("Tick your first set. I'll tell you how your body is doing as you go.")).toBeTruthy();
  });

  it('talks after each tick: week count, then tired reps', () => {
    const target = MUSCLE_TARGETS.Chest.target;
    const { rerender } = render(card([bench([[10, false], [7, false]])]));
    rerender(card([bench([[10, true], [7, false]])]));
    expect(screen.getByText(`Chest: 1 of ${target} sets this week. ${target - 1} more to go.`)).toBeTruthy();
    expect(screen.getByText(`1 / ${target}`)).toBeTruthy();
    expect(screen.getByText('Chest this week')).toBeTruthy();

    rerender(card([bench([[10, true], [7, true]])]));
    expect(screen.getByText('Tired muscle')).toBeTruthy();
    expect(screen.getByText('Reps fell from 10 to 7. Your chest is tired. Stop Bench Press here, or drop to 35 kg for one more set.')).toBeTruthy();
  });

  it('goes back to the week count when a set is unticked', () => {
    const target = MUSCLE_TARGETS.Chest.target;
    const { rerender } = render(card([bench([[10, true], [7, false]])]));
    rerender(card([bench([[10, true], [7, true]])]));
    rerender(card([bench([[10, true], [7, false]])]));
    expect(screen.getByText(`Chest: 1 of ${target} sets this week. ${target - 1} more to go.`)).toBeTruthy();
  });

  it('opens a restored workout quietly on the week count', () => {
    render(card([bench([[10, true], [7, true]])]));
    expect(screen.queryByText('Tired muscle')).toBeNull();
    expect(screen.getByText('This week')).toBeTruthy();
  });
});
