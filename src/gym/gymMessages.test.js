import { describe, it, expect } from 'vitest';
import { planMessageText } from './gymMessages';

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
