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
