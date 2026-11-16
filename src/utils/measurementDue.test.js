import { describe, it, expect } from 'vitest';
import { getMeasurementDueClients, measurementChanges, MEAS_INTERVAL_DAYS } from './measurementDue';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

describe('getMeasurementDueClients', () => {
  const clients = [
    { id: 'a', userName: 'Asha', joined_at: daysAgo(100) },   // measured 70d ago
    { id: 'b', userName: 'Bala', joined_at: daysAgo(100) },   // measured 3d ago
    { id: 'c', userName: 'Chitra', joined_at: daysAgo(20) },  // never, joined 20d ago
    { id: 'd', userName: 'Dev', joined_at: daysAgo(5) },      // never, brand new
    { id: 'e', userName: 'Esha', joined_at: daysAgo(90), paused_at: daysAgo(1) }
  ];
  const last = { a: daysAgo(70), b: daysAgo(3) };

  it('flags every day a client is overdue, not only on 15-day multiples', () => {
    const due = getMeasurementDueClients(clients, last, NOW);
    expect(due.map(d => d.clientId)).toEqual(['a', 'c']);
    expect(due[0]).toMatchObject({ daysSince: 70, lastMeasuredAt: last.a });
    expect(due[1]).toMatchObject({ daysSince: 20, lastMeasuredAt: null });
  });

  it('becomes due exactly at the interval', () => {
    const c = [{ id: 'x', joined_at: daysAgo(100) }];
    expect(getMeasurementDueClients(c, { x: daysAgo(MEAS_INTERVAL_DAYS - 1) }, NOW)).toHaveLength(0);
    expect(getMeasurementDueClients(c, { x: daysAgo(MEAS_INTERVAL_DAYS) }, NOW)).toHaveLength(1);
  });
});

describe('measurementChanges', () => {
  it('lists only fields filled in both entries that changed', () => {
    const newer = { weight: '72.4', waist: '84', chest: '100', neck: '' };
    const older = { weight: '73.6', waist: '84', chest: '98.5', neck: '38' };
    expect(measurementChanges(newer, older, ['weight', 'waist', 'chest', 'neck'])).toEqual([
      { key: 'weight', from: 73.6, to: 72.4, delta: -1.2 },
      { key: 'chest', from: 98.5, to: 100, delta: 1.5 }
    ]);
  });
});
