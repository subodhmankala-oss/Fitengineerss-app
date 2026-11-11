import { describe, it, expect } from 'vitest';
import { planMessageText, renewalMessageText } from './gymMessages';

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
