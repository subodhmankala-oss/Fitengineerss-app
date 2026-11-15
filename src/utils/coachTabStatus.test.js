import { describe, it, expect } from 'vitest';
import { tabStatuses, daysAgoLabel } from '../utils/coachTabStatus';

describe('tabStatuses', () => {
  it('shows empty-state lines', () => {
    expect(tabStatuses({ today: '2026-11-15' })).toEqual({
      plans: 'No plan yet', livelog: 'Start session', workout: 'No workouts', measurements: 'Not logged',
    });
  });

  it('shows live numbers', () => {
    const s = tabStatuses({
      coachPlanCount: 3, liveStatus: 'running', liveElapsedSeconds: 1458,
      lastWorkoutDate: '2026-11-13', latestWeight: '72.4', previousWeight: '73.6', today: '2026-11-15',
    });
    expect(s).toEqual({ plans: '3 plans', livelog: '24:18', workout: '2d ago', measurements: '72.4 kg −1.2' });
  });

  it('labels paused and planned sessions', () => {
    expect(tabStatuses({ liveStatus: 'paused', liveElapsedSeconds: 65 }).livelog).toBe('Paused 01:05');
    expect(tabStatuses({ liveExerciseCount: 1 }).livelog).toBe('1 exercise');
    expect(tabStatuses({ liveStatus: 'running', liveElapsedSeconds: 3725 }).livelog).toBe('01:02:05');
  });
});

describe('daysAgoLabel', () => {
  it('buckets days', () => {
    expect(daysAgoLabel('2026-11-15', '2026-11-15')).toBe('Today');
    expect(daysAgoLabel('2026-11-14', '2026-11-15')).toBe('Yesterday');
    expect(daysAgoLabel('2026-11-01', '2026-11-15')).toBe('2w ago');
  });
});
