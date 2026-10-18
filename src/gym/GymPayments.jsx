import { useMemo, useState } from 'react';
import GymPlanForm from './GymPlanForm';
import { initials, memberPlans, monthlyCollections, rupees } from './gymView';
import { messagePlan } from './gymMessages';
import { shortDate } from '../utils/ownerView';
import { toWhatsappNumber } from '../utils/whatsappNudge';

const STATE_LABEL = { due: 'Payment due', expired: 'Plan ended', 'ends-soon': 'Ends soon' };
const STATE_TONE = { due: 'amber', expired: 'red', 'ends-soon': 'amber' };

// Payments: this month's money, who needs attention (owes money / plan ending
// or ended), recent payments, and a place to start a plan for anyone.
export default function GymPayments({ data, biz, bizError, service, onChanged }) {
  const { clients, gym, insights } = data;
  const today = insights?.today;
  const [form, setForm] = useState(null); // { memberId, mode }
  const [pick, setPick] = useState('');

  const plans = useMemo(() => (biz && today ? memberPlans(biz, today) : {}), [biz, today]);
  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  if (bizError || !biz) {
    return (
      <div className="gx-stack">
        <h1 className="gx-h1">Payments</h1>
        <div className="gx-card gx-center">
          <p className="gx-title">Payments aren’t available yet</p>
          <p className="gx-sub">{bizError || 'Could not load plans and payments.'}</p>
        </div>
      </div>
    );
  }

  const money = monthlyCollections(biz.payments, today, 6);
  const attention = clients
    .filter((c) => ['due', 'expired', 'ends-soon'].includes(plans[c.id]?.state))
    .sort((a, b) => (plans[a.id].state === 'due' ? 0 : 1) - (plans[b.id].state === 'due' ? 0 : 1) || plans[a.id].daysLeft - plans[b.id].daysLeft);
  const dueTotal = attention.reduce((s, c) => s + plans[c.id].due, 0);
  const dueCount = attention.filter((c) => plans[c.id].state === 'due').length;
  const endingCount = attention.filter((c) => plans[c.id].state === 'ends-soon').length;
  const noPlan = clients.filter((c) => !plans[c.id]).length;
  const formMember = form ? byId[form.memberId] : null;
  const done = () => { setForm(null); setPick(''); onChanged(); };

  const detail = (p) => (p.state === 'due'
    ? `${rupees(p.due)} still due on ${p.planName}`
    : p.state === 'expired' ? `${p.planName} ended ${shortDate(p.endsOn)}` : `${p.planName} ends ${shortDate(p.endsOn)} · ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left`);

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Payments</h1><p className="gx-sub">Money received, who owes, and whose plan is ending</p></div>
      </div>

      <div className="gx-grid3">
        <div className="gx-tile gx-tile-dark"><span className="gx-tile-label">Collected this month</span><span className="gx-big">{rupees(money.thisMonth)}</span><span className="gx-tile-sub">payments you recorded since the 1st</span></div>
        <div className="gx-tile gx-tile-amber"><span className="gx-tile-label">Still to collect</span><span className="gx-big">{rupees(dueTotal)}</span><span className="gx-tile-sub">{dueCount} member{dueCount === 1 ? '' : 's'} owe money on a plan</span></div>
        <div className="gx-tile gx-tile-blue"><span className="gx-tile-label">Plans ending this week</span><span className="gx-big">{endingCount}</span><span className="gx-tile-sub">{noPlan} member{noPlan === 1 ? ' has' : 's have'} no plan recorded yet</span></div>
      </div>

      <section className="gx-card">
        <h2 className="gx-h2">Start a plan or record a payment</h2>
        <p className="gx-sub">Pick a member, choose their plan and what they paid. A plan bought while another is running starts when the old one ends.</p>
        <select className="gx-select wide" value={pick} onChange={(e) => { setPick(e.target.value); setForm(e.target.value ? { memberId: e.target.value, mode: 'start' } : null); }} aria-label="Member">
          <option value="">Choose a member…</option>
          {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {form && formMember && form.mode === 'start' && (
          <GymPlanForm key={`start-${form.memberId}`} mode="start" member={formMember} plans={biz.plans} current={plans[form.memberId]} service={service} onDone={done} onCancel={() => { setForm(null); setPick(''); }} />
        )}
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">Needs attention</h2>
        <p className="gx-sub">{attention.length ? 'Owing money first, then plans that have ended or end within 7 days.' : 'Nobody owes money and no plan is ending soon.'}</p>
        <div className="gx-list">
          {attention.map((c) => {
            const p = plans[c.id];
            const open = form?.memberId === c.id && form.mode !== 'start';
            return (
              <div key={c.id} className="gx-attn">
                <div className="gx-member">
                  <span className="gx-avatar sm">{initials(c.name)}</span>
                  <span className="gx-member-main"><span><span className="gx-name">{c.name}</span><span className="gx-sub">{detail(p)}</span></span></span>
                  <span className={`gx-tag ${STATE_TONE[p.state]}`}>{STATE_LABEL[p.state]}</span>
                  <button type="button" className="gx-btn gx-btn-soft" disabled={!toWhatsappNumber(c.phone)} title={toWhatsappNumber(c.phone) ? '' : 'No phone number saved for this member'} onClick={() => messagePlan(c, gym.name, p)}>Message</button>
                  <button type="button" className="gx-btn gx-btn-dark" onClick={() => setForm(open ? null : { memberId: c.id, mode: p.state === 'due' ? 'pay' : 'renew' })}>{p.state === 'due' ? 'Record payment' : 'Renew'}</button>
                </div>
                {open && (
                  <GymPlanForm key={`${form.mode}-${c.id}`} mode={form.mode === 'pay' ? 'pay' : 'start'} member={c} plans={biz.plans} current={p} service={service} onDone={done} onCancel={() => setForm(null)} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">Recent payments</h2>
        {biz.payments.length === 0 && <p className="gx-sub">No payments recorded yet.</p>}
        <div className="gx-list">
          {biz.payments.slice(0, 15).map((p) => (
            <div key={p.id} className="gx-pay">
              <span className="gx-name">{byId[p.member_id]?.name || 'Former member'}</span>
              <span className="gx-sub">{shortDate(p.paid_on)} · {p.method.toUpperCase()}</span>
              <b>{rupees(p.amount_inr)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
