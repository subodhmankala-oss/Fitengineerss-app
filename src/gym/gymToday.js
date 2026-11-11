// "Today's messages to send": the daily list behind the WhatsApp switches in
// Settings. There is no WhatsApp Business API behind this app, so nothing is
// sent by itself: each rule below produces one item the owner sends with a
// tap (wa.me), then marks done so it does not come back.
import { missMessageText, planMessageText, receiptMessageText } from './gymMessages';

export const TODAY_KINDS = {
  receipt: { label: 'Payment receipt', tone: 'green' },
  renewal: { label: 'Renewal reminder', tone: 'amber' },
  miss: { label: 'We miss you', tone: 'red' }
};

// Rules (same wording as the Settings screen):
//   renewal  plan ends within 3 days (not already owing money)
//   miss     last workout 7 to 45 days ago (older than that is a different job)
//   receipt  a payment recorded today or yesterday
export const RENEWAL_DAYS = 3;
export const MISS_FROM_DAYS = 7;
export const MISS_TO_DAYS = 45;
const RECEIPT_DAYS = 1;

const dayNum = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000);

// Items already sent or skipped, as the lookup keys used below.
export const sentKey = (memberId, kind, ref) => `${memberId}|${kind}|${ref}`;

export function todaysMessages({ clients, plans, biz, today, gymName }) {
  if (!biz || !today) return [];
  const s = biz.settings || {};
  const on = { renewal: s.wa_renewal ?? true, miss: s.wa_miss ?? true, receipt: s.wa_receipt ?? true };
  const done = new Set((biz.messageLog || []).map((l) => sentKey(l.member_id, l.kind, l.ref)));
  const byId = Object.fromEntries((clients || []).map((c) => [c.id, c]));
  const out = [];
  const add = (client, kind, ref, text) => {
    if (done.has(sentKey(client.id, kind, ref))) return;
    out.push({ key: sentKey(client.id, kind, ref), client, kind, ref, text, hasPhone: !!String(client.phone || '').replace(/\D/g, '') });
  };

  if (on.receipt) {
    const planOf = Object.fromEntries((biz.memberships || []).map((m) => [m.id, m.plan_name]));
    (biz.payments || []).forEach((p) => {
      const c = byId[p.member_id];
      if (c && dayNum(today) - dayNum(p.paid_on) <= RECEIPT_DAYS) add(c, 'receipt', String(p.id).slice(0, 64), receiptMessageText(gymName, p.amount_inr, planOf[p.membership_id]));
    });
  }
  (clients || []).forEach((c) => {
    const plan = plans?.[c.id];
    if (on.renewal && plan && plan.state === 'ends-soon' && plan.daysLeft >= 0 && plan.daysLeft <= RENEWAL_DAYS) {
      add(c, 'renewal', String(plan.endsOn).slice(0, 10), planMessageText(c, gymName, plan));
    }
    if (on.miss && c.lastWorkout) {
      const away = dayNum(today) - dayNum(c.lastWorkout);
      if (away >= MISS_FROM_DAYS && away <= MISS_TO_DAYS) add(c, 'miss', String(c.lastWorkout).slice(0, 10), missMessageText(gymName, away));
    }
  });

  const order = Object.keys(TODAY_KINDS);
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.client.name.localeCompare(b.client.name));
}
