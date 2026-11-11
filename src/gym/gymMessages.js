import { buildNudgeMessage, openWhatsapp, toWhatsappNumber } from '../utils/whatsappNudge';
import { shortDate } from '../utils/ownerView';
import { rupees } from './gymView';
import { upiLink } from './gymUpi';

// WhatsApp text for a member's plan state (ends soon / payment due / ended).
// For a payment due, pass the gym's upiId and the message carries the UPI ID
// and a pay link for exactly the amount owed. WhatsApp does not make upi://
// links tappable on every phone, so the plain UPI ID is always spelled out too.
export function planMessageText(client, gymName, plan, upiId) {
  const gym = gymName || 'the gym';
  if (plan.state === 'due') {
    const base = `Hi {name}, a quick reminder: ${rupees(plan.due)} is still pending for your ${plan.planName} at ${gym}.`;
    const link = upiLink({ upiId, payeeName: gymName, amount: plan.due, note: `${plan.planName} - ${client?.name || ''}`.trim() });
    return link ? `${base}\n\nPay by UPI to ${String(upiId).trim()}\nOr tap to pay: ${link}\n\nThank you!` : `${base} Thank you!`;
  }
  if (plan.state === 'expired') return `Hi {name}, your ${plan.planName} at ${gym} ended on ${shortDate(plan.endsOn)}. Want to renew and get back on the floor?`;
  return `Hi {name}, your ${plan.planName} at ${gym} ends on ${shortDate(plan.endsOn)}. Renew now and keep your streak going!`;
}

export function messagePlan(client, gymName, plan, upiId) {
  openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(planMessageText(client, gymName, plan, upiId), { userName: client.name }));
}

// "We miss you": a member who has not trained for a while.
export function missMessageText(gymName, daysAway) {
  return `Hi {name}, we haven’t seen you at ${gymName || 'the gym'} for ${daysAway} days. Everything okay? Your next workout is ready whenever you are.`;
}

// Receipt right after a payment.
export function receiptMessageText(gymName, amount, planName) {
  return `Thanks {name}! We received ${rupees(amount)} for your ${planName || 'plan'} at ${gymName || 'the gym'}.`;
}

// Opens WhatsApp with already-built message text (the {name} placeholder and
// the app link are filled in the same way as every other gym message).
export function sendWhatsapp(client, text) {
  openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(text, { userName: client.name }));
}
