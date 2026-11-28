import { describe, it, expect } from 'vitest';
import { MEMBER_FILTERS, PLAN_FILTERS, addDays, frozenEndDate, isLikelyNotToRenew, memberFreezes, memberPlans, memberRowTag, shortDay } from './gymView';
import { todaysMessages } from './gymToday';
import { freezeMessageText } from './gymMessages';

const TODAY = '2026-11-28';
// Rahul's plan already includes 15 frozen days (the database moved ends_on).
const biz = (freezes) => ({
  memberships: [{ id: 'm1', member_id: 'r', plan_name: 'Quarterly', starts_on: '2026-10-01', ends_on: '2027-01-14', price_inr: 8400 }],
  paidByMembership: [{ membership_id: 'm1', amount_inr: 8400 }],
  freezes
});
const running = { id: 'f1', member_id: 'r', membership_id: 'm1', starts_on: '2026-11-25', ends_on: '2026-12-09', reason: 'travel' };

describe('plan freeze', () => {
  it('adds days to a date and writes it short', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(frozenEndDate('2027-01-12', 15)).toBe('2027-01-27');
    expect(shortDay('2027-01-27')).toBe('27 Jan');
  });

  it('marks a running freeze, counts days left from today, and gives the day back', () => {
    const f = memberFreezes(biz([running]), TODAY).r;
    expect(f).toMatchObject({ id: 'f1', running: true, daysLeft: 12, backOn: '2026-12-10', reason: 'travel' });
  });

  it('keeps an upcoming freeze (not running yet) and drops one that has ended', () => {
    const up = memberFreezes(biz([{ ...running, starts_on: '2026-12-05', ends_on: '2026-12-11' }]), TODAY).r;
    expect(up).toMatchObject({ running: false, daysLeft: 7 });
    expect(memberFreezes(biz([{ ...running, ends_on: '2026-11-27' }]), TODAY)).toEqual({});
  });

  it('a running freeze makes the plan "frozen", with its own row tag; money owed still wins', () => {
    const plans = memberPlans(biz([running]), TODAY);
    expect(plans.r.state).toBe('frozen');
    expect(memberRowTag({ engagement: { status: 'quiet' } }, plans.r)).toEqual({ label: 'Frozen till 9 Dec', tone: 'blue', action: 'Message' });
    const owing = memberPlans({ ...biz([running]), paidByMembership: [] }, TODAY);
    expect(owing.r.state).toBe('due');
    expect(owing.r.freeze.running).toBe(true);
  });

  it('an upcoming freeze does not change the plan state', () => {
    const plans = memberPlans(biz([{ ...running, starts_on: '2026-12-05' }]), TODAY);
    expect(plans.r.state).toBe('active');
    expect(plans.r.freeze.running).toBe(false);
  });

  it('works with no freezes table yet (biz.freezes null)', () => {
    expect(memberPlans(biz(null), TODAY).r.freeze).toBeNull();
  });

  it('frozen members leave the stopped / slipping / not-renew lists and get a Frozen chip', () => {
    const plans = memberPlans(biz([running]), TODAY);
    const quiet = { id: 'r', engagement: { status: 'quiet' } };
    const slip = { id: 'r', engagement: { status: 'slipping' } };
    expect(MEMBER_FILTERS.find((f) => f.key === 'stopped').test(quiet, plans)).toBe(false);
    expect(MEMBER_FILTERS.find((f) => f.key === 'slipping').test(slip, plans)).toBe(false);
    expect(MEMBER_FILTERS.find((f) => f.key === 'stopped').test(quiet, {})).toBe(true);
    expect(PLAN_FILTERS.find((f) => f.key === 'frozen').test(quiet, plans)).toBe(true);
    expect(isLikelyNotToRenew(quiet, { ...plans.r, daysLeft: 5 })).toBe(false);
  });

  it('sends no "we miss you" while frozen', () => {
    const client = { id: 'r', name: 'Rahul S', phone: '9000000001', lastWorkout: '2026-11-18' };
    const frozen = memberPlans(biz([running]), TODAY);
    expect(todaysMessages({ clients: [client], plans: frozen, biz: biz([running]), today: TODAY, gymName: 'Iron Den' })).toEqual([]);
    const notFrozen = memberPlans(biz([]), TODAY);
    expect(todaysMessages({ clients: [client], plans: notFrozen, biz: biz([]), today: TODAY, gymName: 'Iron Den' }).map((m) => m.kind)).toEqual(['miss']);
  });

  it('the WhatsApp text confirms the dates instead of asking where they have been', () => {
    const plan = memberPlans(biz([running]), TODAY).r;
    const text = freezeMessageText({ name: 'Rahul' }, 'Iron Den', plan);
    expect(text).toContain('frozen till');
    expect(text).toContain('Quarterly');
    expect(text).not.toMatch(/haven.t seen/);
  });
});
