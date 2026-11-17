import { describe, it, expect } from 'vitest';
import {
  activeBreak, isBreakDay, breakDaysBetween, recentlyEndedBreak, cleanBreakInput, coachBreakTitle, normalizeBreak,
  easyRestartProgram,
} from './clientBreaks';
import { clientGlance } from './clientWeekGlance';

// Away Wed 18 – Sun 22 Nov, back Mon 23 Nov.
const trip = { id: 'b1', reason: 'holiday', note: 'Goa', startDate: '2026-11-18', backDate: '2026-11-23' };

describe('clientBreaks', () => {
  it('covers start .. back - 1', () => {
    expect(isBreakDay([trip], '2026-11-18')).toBe(true);
    expect(isBreakDay([trip], '2026-11-22')).toBe(true);
    expect(isBreakDay([trip], '2026-11-23')).toBe(false);
    expect(activeBreak([trip], '2026-11-20')).toBe(trip);
    expect(activeBreak([trip], '2026-11-23')).toBeNull();
  });

  it('counts break days after a date', () => {
    expect(breakDaysBetween([trip], '2026-11-15', '2026-11-30')).toBe(5);
    expect(breakDaysBetween([trip], '2026-11-20', '2026-11-21')).toBe(1);
    expect(breakDaysBetween([], '2026-11-15', '2026-11-30')).toBe(0);
  });

  it('shows welcome back for 3 days or until a workout', () => {
    expect(recentlyEndedBreak([trip], '2026-11-23')).toBe(trip);
    expect(recentlyEndedBreak([trip], '2026-11-25')).toBe(trip);
    expect(recentlyEndedBreak([trip], '2026-11-26')).toBeNull();
    expect(recentlyEndedBreak([trip], '2026-11-24', '2026-11-23')).toBeNull();
    expect(recentlyEndedBreak([trip], '2026-11-24', '2026-11-10')).toBe(trip);
  });

  it('requires a note for every reason, including other', () => {
    const base = { reason: 'other', startDate: '2026-11-18', backDate: '2026-11-23' };
    expect(cleanBreakInput({ ...base, note: '' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput({ ...base, note: '  hi ' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput({ ...base, note: 'Exams this week' }, '2026-11-18')).toEqual({ ok: true, value: { ...base, note: 'Exams this week' } });
  });

  it('rejects bad reasons and dates', () => {
    const ok = { reason: 'holiday', note: 'Trip', startDate: '2026-11-18', backDate: '2026-11-23' };
    expect(cleanBreakInput({ ...ok, reason: 'nap' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput({ ...ok, backDate: '2026-11-18' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput({ ...ok, startDate: '2026-11-10' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput({ ...ok, backDate: '2027-03-01' }, '2026-11-18').ok).toBe(false);
    expect(cleanBreakInput(ok, '2026-11-17').ok).toBe(true); // a day of time-zone slack
  });

  it('writes the coach title', () => {
    expect(coachBreakTitle('Asha Rao', trip)).toBe('Asha Rao is on holiday, back Mon 23 Nov (5 days)');
    expect(coachBreakTitle('Asha Rao', { ...trip, reason: 'other' })).toContain('is taking a break');
  });

  it('easy restart caps every exercise at 2 sets', () => {
    const p = easyRestartProgram({ name: 'Upper', exercises: [
      { name: 'Bench', sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }] },
      { name: 'Row', sets: 4 },
      { name: 'Curl', sets: [{ reps: 12 }] },
    ] });
    expect(p.exercises.map(e => (Array.isArray(e.sets) ? e.sets.length : e.sets))).toEqual([2, 2, 1]);
    expect(p.name).toBe('Upper');
  });

  it('normalizes server rows', () => {
    expect(normalizeBreak({ id: 'x', client_user_id: 'u', reason: 'weird', note: 'n', start_date: '2026-11-18', back_date: '2026-11-19' }))
      .toMatchObject({ reason: 'other', clientUserId: 'u', startDate: '2026-11-18', backDate: '2026-11-19' });
  });
});

describe('client list glance with a break', () => {
  const client = { id: 'c1', joined_at: '2026-01-01' };
  const now = new Date('2026-11-20T09:00:00').getTime();

  it('an away client is never "needs you" and shows the back date', () => {
    const g = clientGlance(client, new Set(['2026-11-10']), '2026-11-20', now, [trip]);
    expect(g.needsYou).toBe(false);
    expect(g.away).toBe(trip);
    expect(g.label).toBe('Back 23 Nov');
    // Mon 16 – Sun 22: Wed–Sun are break days.
    expect(g.offDays).toEqual([false, false, true, true, true, true, true]);
  });

  it('break days do not count as idle after they are back', () => {
    // Last workout Mon 16; 8 days to Tue 24, 5 of them on the break.
    const g = clientGlance(client, new Set(['2026-11-16']), '2026-11-24', now, [trip]);
    expect(g.needsYou).toBe(false);
    const noBreak = clientGlance(client, new Set(['2026-11-16']), '2026-11-24', now, []);
    expect(noBreak.needsYou).toBe(true);
  });
});
