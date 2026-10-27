import { describe, it, expect } from 'vitest';
import { findWrongClientSignal, describeWrongClientSignal, CLIENT_SESSION_ACTIVE_MS } from './liveLogClientCheck';

const today = '2026-10-26';
const now = Date.parse('2026-10-26T04:14:00Z');

describe('findWrongClientSignal', () => {
  it('warns when the client has their own session open today and touched it recently', () => {
    const signal = findWrongClientSignal({
      clientSession: { planName: 'UB Oct w2', logDate: today, updatedAt: '2026-10-26T04:11:00Z' },
      logs: [], today, now
    });
    expect(signal.kind).toBe('logging');
    expect(signal.planName).toBe('UB Oct w2');
  });

  it('ignores an abandoned session left open for hours', () => {
    const stale = new Date(now - CLIENT_SESSION_ACTIVE_MS - 60000).toISOString();
    expect(findWrongClientSignal({
      clientSession: { planName: 'UB', logDate: today, updatedAt: stale }, logs: [], today, now
    })).toBeNull();
  });

  it("ignores a session left open from another day", () => {
    expect(findWrongClientSignal({
      clientSession: { planName: 'UB', logDate: '2026-10-25', updatedAt: '2026-10-26T04:10:00Z' }, logs: [], today, now
    })).toBeNull();
  });

  it('warns when the client already saved a workout from their phone today', () => {
    const signal = findWrongClientSignal({
      clientSession: null,
      logs: [
        { log_date: today, plan_name: 'UB Oct w2', session_id: 'session-1', created_at: '2026-10-26T03:00:00Z' },
        { log_date: '2026-10-24', plan_name: 'Cardio day', session_id: 'session-0', created_at: '2026-10-24T04:00:00Z' }
      ],
      today, now
    });
    expect(signal).toMatchObject({ kind: 'logged', planName: 'UB Oct w2', key: 'logged|session-1' });
  });

  it("doesn't count sessions the coach logged in Live Log", () => {
    expect(findWrongClientSignal({
      clientSession: null,
      logs: [{ log_date: today, plan_name: 'UB Oct w4', session_id: 'coach-live-1', created_at: '2026-10-26T03:00:00Z' }],
      today, now
    })).toBeNull();
  });

  it('prefers the live session over an earlier saved one', () => {
    const signal = findWrongClientSignal({
      clientSession: { planName: 'Legs', logDate: today, updatedAt: '2026-10-26T04:13:00Z' },
      logs: [{ log_date: today, plan_name: 'UB', session_id: 'session-1', created_at: '2026-10-26T01:00:00Z' }],
      today, now
    });
    expect(signal.kind).toBe('logging');
  });

  it('returns null with nothing to go on', () => {
    expect(findWrongClientSignal({ clientSession: null, logs: [], today, now })).toBeNull();
  });
});

describe('describeWrongClientSignal', () => {
  it('names the client, plan and how recent', () => {
    const text = describeWrongClientSignal({ kind: 'logging', planName: 'UB Oct w2', at: now - 3 * 60000 }, 'Kiran', now);
    expect(text).toBe('Kiran is logging "UB Oct w2" on their own phone right now, active 3 min ago.');
  });

  it('describes an already-saved workout', () => {
    const text = describeWrongClientSignal({ kind: 'logged', planName: '', at: null }, 'Kiran', now);
    expect(text).toBe('Kiran already logged a workout on their own phone today.');
  });
});
