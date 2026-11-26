import { describe, it, expect } from 'vitest';
import { highFiveMessageText, planMessageText, renewalMessageText } from './gymMessages';

const due = { state: 'due', due: 2500, planName: 'Quarterly' };
const client = { name: 'Ravi Kumar' };

describe('planMessageText: payment due with UPI', () => {
  it('without a UPI ID keeps the plain reminder', () => {
    expect(planMessageText(client, 'Iron Den', due)).toBe('Hi {name}, a quick reminder: ₹2,500 is still pending for your Quarterly at Iron Den. Thank you!');
    expect(planMessageText(client, 'Iron Den', due, 'not valid')).toBe(planMessageText(client, 'Iron Den', due));
  });

  it('with a UPI ID adds the ID and a pay link for exactly the amount owed', () => {
    const text = planMessageText(client, 'Iron Den', due, 'irondenfit@okhdfcbank');
    expect(text).toContain('₹2,500 is still pending');
    expect(text).toContain('Pay by UPI to irondenfit@okhdfcbank');
    expect(text).toContain('upi://pay?pa=irondenfit@okhdfcbank&pn=Iron%20Den&am=2500.00&cu=INR&tn=Quarterly%20-%20Ravi%20Kumar');
  });

  it('never adds a pay link to renewal or ended-plan messages', () => {
    expect(planMessageText(client, 'Iron Den', { state: 'ends-soon', planName: 'Monthly', endsOn: '2026-11-12' }, 'irondenfit@okhdfcbank')).not.toContain('upi://');
    expect(planMessageText(client, 'Iron Den', { state: 'expired', planName: 'Monthly', endsOn: '2026-11-01' }, 'irondenfit@okhdfcbank')).not.toContain('upi://');
  });
});

describe('renewalMessageText', () => {
  const ending = { state: 'ends-soon', planName: 'Monthly', daysLeft: 4, endsOn: '2026-11-15', price: 3000, due: 0 };
  it('says when the plan ends and carries the renewal price as a UPI link', () => {
    const text = renewalMessageText(client, 'Iron Den', ending, 'irondenfit@okhdfcbank');
    expect(text).toContain('Monthly at Iron Den ends in 4 days');
    expect(text).toContain('Renew for ₹3,000: pay by UPI to irondenfit@okhdfcbank');
    expect(text).toContain('upi://pay?pa=irondenfit@okhdfcbank&pn=Iron%20Den&am=3000.00&cu=INR&tn=Monthly%20renewal%20-%20Ravi%20Kumar');
  });
  it('covers ends today and already ended, and drops the link without a UPI ID', () => {
    expect(renewalMessageText(client, 'Iron Den', { ...ending, daysLeft: 0 }, '')).toBe('Hi {name}, your Monthly at Iron Den ends today. We would love to keep you training with us! Want to renew?');
    expect(renewalMessageText(client, 'Iron Den', { ...ending, state: 'expired', daysLeft: -3 }, '')).toContain('ended on 15 Nov');
  });
  it('sends the payment-due message to someone who still owes money', () => {
    const owing = { ...ending, state: 'due', due: 1200 };
    expect(renewalMessageText(client, 'Iron Den', owing, 'irondenfit@okhdfcbank')).toBe(planMessageText(client, 'Iron Den', owing, 'irondenfit@okhdfcbank'));
  });
});

describe('highFiveMessageText', () => {
  const active = { name: 'Venkata Rao', workouts7d: 4, workouts28d: 10, engagement: { status: 'thriving', recent14: 7, prior28: 6 }, trainerName: 'Rahul Sharma' };
  it('praises the week, notes the climb, names the trainer — never "haven\'t seen you"', () => {
    const t = highFiveMessageText(active, 'Fitengineers');
    expect(t).toBe("Hi {name}! 🙌 High-five from everyone at Fitengineers!\n\n4 workouts this week. That's proper consistency and it's going to show. You're training more than you were last month too!\n\nKeep it up, you and Rahul are on a roll 💪");
    expect(t).not.toMatch(/seen you/i);
  });
  it('falls back to 2 weeks, then the month, without a trainer', () => {
    expect(highFiveMessageText({ workouts7d: 1, workouts28d: 5, engagement: { recent14: 3, prior28: 8 } }, 'Iron Den'))
      .toBe("Hi {name}! 🙌 High-five from everyone at Iron Den!\n\n3 workouts in the last 2 weeks. You keep turning up, and that's what gets results.\n\nKeep it up, see you at your next session 💪");
    expect(highFiveMessageText({ workouts7d: 1, workouts28d: 1, engagement: { recent14: 1, prior28: 0 } }, 'Iron Den')).toContain('1 workout this month.');
  });
});
