import { describe, it, expect } from 'vitest';
import { todaysMessages, sentKey } from './gymToday';
import { memberPlans } from './gymView';
import { planMessageText, missMessageText, receiptMessageText } from './gymMessages';

const TODAY = '2026-11-10';
const c = (id, extra = {}) => ({ id, name: id.toUpperCase(), phone: '9000000000', lastWorkout: TODAY, ...extra });
const ms = (id, member, ends, price = 1000) => ({ id, member_id: member, plan_name: 'Monthly', ends_on: ends, price_inr: price });
const paidFull = (...ids) => ids.map((membership_id) => ({ membership_id, amount_inr: 100000 }));
const gen = (clients, biz) => {
  const full = { payments: [], memberships: [], paidByMembership: [], settings: null, messageLog: [], ...biz };
  return todaysMessages({ clients, plans: memberPlans(full, TODAY), biz: full, today: TODAY, gymName: 'Iron Den' });
};

describe('todaysMessages', () => {
  it('lists renewal reminders only for plans ending within 3 days', () => {
    const out = gen([c('a'), c('b'), c('d')], {
      memberships: [ms('m1', 'a', '2026-11-12'), ms('m2', 'b', '2026-11-20'), ms('m3', 'd', '2026-11-10')],
      paidByMembership: paidFull('m1', 'm2', 'm3')
    });
    expect(out.filter((m) => m.kind === 'renewal').map((m) => [m.client.id, m.ref])).toEqual([['a', '2026-11-12'], ['d', '2026-11-10']]);
  });

  it('does not send a renewal reminder to someone who still owes money (they get the payment reminder)', () => {
    const out = gen([c('a')], { memberships: [ms('m1', 'a', '2026-11-12')] });
    expect(out.filter((m) => m.kind === 'renewal')).toHaveLength(0);
  });

  it('sends "we miss you" for a last workout 7 to 45 days ago, with the days away in the text', () => {
    const out = gen([c('a', { lastWorkout: '2026-11-03' }), c('b', { lastWorkout: '2026-11-04' }), c('d', { lastWorkout: '2026-09-01' }), c('e', { lastWorkout: null })], {});
    expect(out.map((m) => [m.client.id, m.kind, m.ref])).toEqual([['a', 'miss', '2026-11-03']]);
    expect(out[0].text).toBe(missMessageText('Iron Den', 7));
  });

  it('thanks a payment made today or yesterday, not older ones', () => {
    const out = gen([c('a'), c('b')], {
      memberships: [ms('m1', 'a', '2027-01-01'), ms('m2', 'b', '2027-01-01')],
      payments: [{ id: 'p1', member_id: 'a', membership_id: 'm1', amount_inr: 1500, paid_on: '2026-11-09' }, { id: 'p2', member_id: 'b', membership_id: 'm2', amount_inr: 900, paid_on: '2026-11-07' }]
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'receipt', ref: 'p1', hasPhone: true, text: receiptMessageText('Iron Den', 1500, 'Monthly') });
  });

  it('respects the switches in Settings (a missing row means on)', () => {
    const clients = [c('a', { lastWorkout: '2026-10-20' })];
    expect(gen(clients, {})).toHaveLength(1);
    expect(gen(clients, { settings: { wa_miss: false } })).toHaveLength(0);
    expect(gen(clients, { settings: { wa_miss: true } })).toHaveLength(1);
  });

  it('hides what was already sent or skipped, but shows the next occasion', () => {
    const clients = [c('a', { lastWorkout: '2026-10-20' })];
    const log = [{ member_id: 'a', kind: 'miss', ref: '2026-10-20', action: 'sent' }];
    expect(gen(clients, { messageLog: log })).toHaveLength(0);
    expect(gen([c('a', { lastWorkout: '2026-10-25' })], { messageLog: log })).toHaveLength(1);
    expect(sentKey('a', 'miss', '2026-10-20')).toBe('a|miss|2026-10-20');
  });

  it('flags members with no phone and returns nothing before payments are loaded', () => {
    expect(gen([c('a', { phone: null, lastWorkout: '2026-10-20' })], {})[0].hasPhone).toBe(false);
    expect(todaysMessages({ clients: [c('a')], plans: {}, biz: null, today: TODAY, gymName: 'x' })).toEqual([]);
  });

  it('puts receipts first, then renewals, then "we miss you"', () => {
    const out = gen([c('a', { lastWorkout: '2026-10-20' }), c('b'), c('d')], {
      memberships: [ms('m1', 'b', '2026-11-11'), ms('m2', 'd', '2027-01-01')],
      paidByMembership: paidFull('m1', 'm2'),
      payments: [{ id: 'p1', member_id: 'd', membership_id: 'm2', amount_inr: 500, paid_on: TODAY }]
    });
    expect(out.map((m) => m.kind)).toEqual(['receipt', 'renewal', 'miss']);
    expect(out[1].text).toBe(planMessageText(c('b'), 'Iron Den', memberPlans({ memberships: [ms('m1', 'b', '2026-11-11')], paidByMembership: paidFull('m1') }, TODAY).b));
  });
});
