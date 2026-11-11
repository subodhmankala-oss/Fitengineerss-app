import { describe, it, expect } from 'vitest';
import { LEAD_STAGES, LEAD_LOST_REASONS, followUpsDue, leadStats, liveMonthBoard, LIVE_METRICS } from './gymView';

describe('leads: lost and follow-ups', () => {
  const leads = [
    { id: 'a', name: 'Asha', stage: 'new', follow_up_on: '2026-11-10' },
    { id: 'b', name: 'Bala', stage: 'trial_done', follow_up_on: '2026-11-08' },
    { id: 'c', name: 'Chitra', stage: 'new', follow_up_on: '2026-11-12' },
    { id: 'd', name: 'Dev', stage: 'joined', follow_up_on: '2026-11-01', joined_at: '2026-11-02T05:00:00Z' },
    { id: 'e', name: 'Esha', stage: 'lost', lost_reason: 'no_response', lost_at: '2026-11-04T05:00:00Z', follow_up_on: '2026-11-10' },
    { id: 'f', name: 'Farid', stage: 'lost', lost_reason: 'too_expensive', lost_at: '2026-10-28T05:00:00Z', follow_up_on: null }
  ];

  it('has a Lost stage and four reasons', () => {
    expect(LEAD_STAGES.map((s) => s.key)).toEqual(['new', 'trial_booked', 'trial_done', 'joined', 'lost']);
    expect(LEAD_LOST_REASONS.map((r) => r.key)).toEqual(['too_expensive', 'joined_elsewhere', 'no_response', 'other']);
  });

  it('lists follow-ups due today or overdue, oldest first, never joined people', () => {
    expect(followUpsDue(leads, '2026-11-10').map((l) => l.id)).toEqual(['b', 'a', 'e']);
    expect(followUpsDue(leads, '2026-11-07')).toEqual([]);
  });

  it('counts joins, lost leads this month and follow-ups due', () => {
    expect(leadStats(leads, 20, '2026-11-10')).toEqual({ joined: 1, lost: 1, followUps: 3, goal: 20, toGo: 19, daysLeft: 20 });
  });
});

describe('live board: most consistent and most improved', () => {
  const live = {
    members: [
      { id: 'a', name: 'Asha R.', sex: 'female', monthDays: 8, improvement: 0 },
      { id: 'b', name: 'Bala K.', sex: 'male', monthDays: 12, improvement: 3 },
      { id: 'c', name: 'Chitra M.', sex: null, monthDays: 0, improvement: 0 },
      { id: 'd', name: 'Dev P.', sex: 'male', monthDays: 8, improvement: 5 }
    ]
  };

  it('ranks by days trained this month, ties by name', () => {
    expect(liveMonthBoard(live, 'consistent').map((r) => [r.id, r.value])).toEqual([['b', 12], ['a', 8], ['d', 8], ['c', 0]]);
  });

  it('ranks by improvement and respects the male / female tabs', () => {
    expect(liveMonthBoard(live, 'improved').map((r) => [r.id, r.value])).toEqual([['d', 5], ['b', 3], ['a', 0], ['c', 0]]);
    expect(liveMonthBoard(live, 'improved', 'male').map((r) => r.id)).toEqual(['d', 'b']);
  });

  it('exposes only name, photo, email slot and the number', () => {
    expect(Object.keys(liveMonthBoard(live, 'consistent')[0]).sort()).toEqual(['avatarUrl', 'email', 'id', 'name', 'sessions', 'value', 'withTrainer', 'working', 'workingSets']);
    expect(LIVE_METRICS.map((m) => m.key)).toEqual(['kcal', 'consistent', 'improved']);
  });
});
