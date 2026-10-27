import { describe, it, expect } from 'vitest';
import { getEarlierDayDraft, formatDraftDate } from './earlierDayDraft';
import { computeElapsedSeconds } from './liveWorkoutTimer';

const T0 = Date.UTC(2026, 9, 26, 4, 7, 0); // 26 Oct 09:37 IST
const min = (n) => T0 + n * 60000;

const exercises = [
  { name: 'Bench Press', sets: [
    { reps: 10, weight: '40', isCompleted: true, completedAt: min(10) },
    { reps: 10, weight: '40', isCompleted: true, completedAt: min(15) },
    { reps: 10, weight: '40', isCompleted: false }
  ] },
  { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '35', isCompleted: true, completedAt: min(60) }] }
];

describe('getEarlierDayDraft', () => {
  it('is null for a draft from today', () => {
    expect(getEarlierDayDraft({ logDate: '2026-10-27', exercises, timerStartedAt: T0 }, '2026-10-27')).toBeNull();
  });

  it('is null when nothing was ticked', () => {
    const empty = [{ name: 'Bench Press', sets: [{ reps: 10, isCompleted: false }] }];
    expect(getEarlierDayDraft({ logDate: '2026-10-26', exercises: empty, timerStartedAt: T0 }, '2026-10-27')).toBeNull();
  });

  it('ends the clock at the last ticked set, however long ago that was', () => {
    const d = getEarlierDayDraft({ logDate: '2026-10-26', exercises, timerStartedAt: T0, pauseIntervals: [] }, '2026-10-27');
    expect(d.logDate).toBe('2026-10-26');
    expect(d.completedSetCount).toBe(3);
    const nextMorning = min(24 * 60);
    expect(computeElapsedSeconds(d.timerStartedAt, d.pauseIntervals, nextMorning)).toBe(60 * 60);
  });

  it('keeps real pauses before the last set and drops ones after it', () => {
    const pauseIntervals = [
      { pausedAt: min(20), resumedAt: min(30) },
      { pausedAt: min(70), resumedAt: null }
    ];
    const d = getEarlierDayDraft({ logDate: '2026-10-26', exercises, timerStartedAt: T0, pauseIntervals }, '2026-10-27');
    expect(computeElapsedSeconds(d.timerStartedAt, d.pauseIntervals, min(2000))).toBe(50 * 60);
  });

  it('caps a pause still open at the last set', () => {
    const pauseIntervals = [{ pausedAt: min(50), resumedAt: min(90) }];
    const d = getEarlierDayDraft({ logDate: '2026-10-26', exercises, timerStartedAt: T0, pauseIntervals }, '2026-10-27');
    expect(computeElapsedSeconds(d.timerStartedAt, d.pauseIntervals, min(2000))).toBe(50 * 60);
  });

  it('starts at the first ticked set when the clock never started', () => {
    const d = getEarlierDayDraft({ logDate: '2026-10-26', exercises, timerStartedAt: null }, '2026-10-27');
    expect(d.timerStartedAt).toBe(min(10));
    expect(computeElapsedSeconds(d.timerStartedAt, d.pauseIntervals, min(2000))).toBe(50 * 60);
  });

  it('has no clock at all when sets carry no tick times', () => {
    const old = [{ name: 'Bench Press', sets: [{ reps: 10, isCompleted: true }] }];
    const d = getEarlierDayDraft({ logDate: '2026-10-26', exercises: old, timerStartedAt: null }, '2026-10-27');
    expect(d.timerStartedAt).toBeNull();
    expect(d.pauseIntervals).toEqual([]);
  });
});

describe('formatDraftDate', () => {
  it('formats a local date string', () => {
    expect(formatDraftDate('2026-10-26')).toBe('Mon, 26 Oct');
  });
});
