import { buildNudgeMessage, openWhatsapp, toWhatsappNumber } from '../utils/whatsappNudge';
import { shortDate } from '../utils/ownerView';
import { rupees } from './gymView';

// WhatsApp text for a member's plan state (ends soon / payment due / ended).
export function planMessageText(client, gymName, plan) {
  const gym = gymName || 'the gym';
  if (plan.state === 'due') return `Hi {name}, a quick reminder: ${rupees(plan.due)} is still pending for your ${plan.planName} at ${gym}. Thank you!`;
  if (plan.state === 'expired') return `Hi {name}, your ${plan.planName} at ${gym} ended on ${shortDate(plan.endsOn)}. Want to renew and get back on the floor?`;
  return `Hi {name}, your ${plan.planName} at ${gym} ends on ${shortDate(plan.endsOn)}. Renew now and keep your streak going!`;
}

export function messagePlan(client, gymName, plan) {
  openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(planMessageText(client, gymName, plan), { userName: client.name }));
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
