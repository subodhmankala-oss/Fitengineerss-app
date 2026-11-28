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

// High-five for an active member: names what they actually did (this week,
// last 2 weeks or this month), notes when they're training more than before,
// and gives their trainer a mention. Never "haven't seen you".
export function highFiveMessageText(client, gymName) {
  const gym = gymName || 'the gym';
  const week = client?.workouts7d || 0;
  const twoWeeks = client?.engagement?.recent14 || 0;
  const month = client?.workouts28d || 0;
  const before = client?.engagement?.prior28 || 0;
  const plural = (n) => `${n} workout${n === 1 ? '' : 's'}`;
  let win;
  if (week >= 3) win = `${plural(week)} this week. That's proper consistency and it's going to show.`;
  else if (twoWeeks >= 3) win = `${plural(twoWeeks)} in the last 2 weeks. You keep turning up, and that's what gets results.`;
  else if (month >= 1) win = `${plural(month)} this month. Every session is adding up.`;
  else win = 'Thanks for putting in the work with us.';
  // Training faster than their usual pace (the 4 weeks before, halved to 2 weeks).
  const climbing = before > 0 && twoWeeks >= 3 && twoWeeks > before / 2 ? ' You\'re training more than you were last month too!' : '';
  const trainer = String(client?.trainerName || '').trim().split(/\s+/)[0];
  const sign = trainer ? `Keep it up, you and ${trainer} are on a roll 💪` : 'Keep it up, see you at your next session 💪';
  return `Hi {name}! 🙌 High-five from everyone at ${gym}!\n\n${win}${climbing}\n\n${sign}`;
}

// Welcome for a new member (joined recently, no workout yet). Says who gets
// them started: their trainer by name, "we're picking your trainer" while
// they wait for one, or the app itself when they train on their own.
export function welcomeMessageText(client, gymName) {
  const gym = gymName || 'the gym';
  const trainer = String(client?.trainerName || '').trim().split(/\s+/)[0];
  const next = trainer
    ? `${trainer} will be your trainer. Your first workout is already waiting in the app, so open it before your first session and you're all set.`
    : client?.selfGuided
      ? 'Your first workout is ready in the app. Open it when you get to the gym and it takes you through every set.'
      : 'We\'re picking the right trainer for you now. In the meantime, open the app and set up your profile so you\'re ready to go.';
  return `Hi {name}, welcome to ${gym}! 🎉 We're really glad you joined.\n\n${next}\n\nAny questions, just reply here. See you on the floor 💪`;
}

// Receipt right after a payment.
// A member on a plan freeze: confirm the dates, no "we haven't seen you".
export function freezeMessageText(client, gymName, plan) {
  const gym = gymName || 'the gym';
  const f = plan?.freeze;
  if (!f) return `Hi {name}, your plan at ${gym} is on hold. See you soon!`;
  return `Hi {name}, your ${plan.planName} at ${gym} is frozen till ${shortDate(f.endsOn)}, so you don't lose any days. It now ends on ${shortDate(plan.endsOn)}. See you back on ${shortDate(f.backOn)}!`;
}

export function receiptMessageText(gymName, amount, planName) {
  return `Thanks {name}! We received ${rupees(amount)} for your ${planName || 'plan'} at ${gymName || 'the gym'}.`;
}

// Opens WhatsApp with already-built message text (the {name} placeholder and
// the app link are filled in the same way as every other gym message).
export function sendWhatsapp(client, text) {
  openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(text, { userName: client.name }));
}

// First-weeks nudges for a new member who has not trained yet, or only a little.
export function newMemberMessageText(gymName, stage) {
  const gym = gymName || 'the gym';
  return stage === 'waiting'
    ? `Hi {name}, welcome to ${gym}! Ready for your first workout? Open the app and your trainer will get you started.`
    : `Hi {name}, great start at ${gym}! Keep the momentum going, see you at your next session.`;
}

export function messageNewMember(client, gymName, stage) {
  openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(newMemberMessageText(gymName, stage), { userName: client.name }));
}

// Renewal message for a plan that is ending or ended. With the gym's UPI ID it
// carries the renewal price as a pay link (the plain ID is spelled out too).
// A member who still owes money gets the payment-due message instead.
export function renewalMessageText(client, gymName, plan, upiId) {
  if (plan.state === 'due') return planMessageText(client, gymName, plan, upiId);
  const gym = gymName || 'the gym';
  const when = plan.daysLeft < 0 ? `ended on ${shortDate(plan.endsOn)}` : plan.daysLeft === 0 ? 'ends today' : `ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'}`;
  const base = `Hi {name}, your ${plan.planName} at ${gym} ${when}. We would love to keep you training with us!`;
  const link = upiLink({ upiId, payeeName: gymName, amount: plan.price, note: `${plan.planName} renewal - ${client?.name || ''}`.trim() });
  return link ? `${base}\n\nRenew for ${rupees(plan.price)}: pay by UPI to ${String(upiId).trim()}\nOr tap to pay: ${link}` : `${base} Want to renew?`;
}
