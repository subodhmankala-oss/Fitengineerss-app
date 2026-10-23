import { useState } from 'react';
import { rupees } from './gymView';

const METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']];

// Start (or renew) a plan for a member, or record a payment against one they
// still owe. `mode`: 'start' | 'pay'. Saved through the verified-owner API.
export default function GymPlanForm({ mode, member, plans, current, service, onDone, onCancel }) {
  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const plan = plans.find((p) => p.id === planId);
  const max = mode === 'pay' ? current.due : plan?.price_inr || 0;
  const [paid, setPaid] = useState(mode === 'pay' ? String(current.due) : String(plan?.price_inr ?? ''));
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickPlan = (id) => {
    setPlanId(id);
    const next = plans.find((p) => p.id === id);
    if (next) setPaid(String(next.price_inr));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const amount = Number(paid || 0);
    if (!Number.isInteger(amount) || amount < (mode === 'pay' ? 1 : 0) || amount > max) {
      setError(mode === 'pay' ? `Enter an amount from ₹1 to ${rupees(max)}.` : `Enter an amount from ₹0 to ${rupees(max)}.`);
      return;
    }
    setBusy(true); setError('');
    const r = mode === 'pay'
      ? await service.payGymMembership({ membershipId: current.membershipId, amountInr: amount, method })
      : await service.startGymMembership({ memberId: member.id, planId, paidInr: amount, method });
    setBusy(false);
    if (r.success) onDone(); else setError(r.error);
  };

  return (
    <form className="gx-form" onSubmit={submit}>
      <p className="gx-label">{mode === 'pay' ? `Payment for ${current.planName}` : 'Start a plan'} · {member.name}</p>
      {mode === 'start' && (
        <label className="gx-field">Plan
          <select className="gx-select" value={planId} onChange={(e) => pickPlan(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.price_inr)}</option>)}
          </select>
        </label>
      )}
      <label className="gx-field">{mode === 'pay' ? 'Amount received (₹)' : 'Paid now (₹) — 0 if not paid yet'}
        <input className="gx-input" type="number" inputMode="numeric" min="0" max={max} value={paid} onChange={(e) => setPaid(e.target.value)} />
      </label>
      {mode === 'pay' && <p className="gx-sub">Still due: {rupees(current.due)}</p>}
      <div className="gx-methods" role="group" aria-label="Payment method">
        {METHODS.map(([k, label]) => (
          <button key={k} type="button" className={`gx-chip${method === k ? ' on' : ''}`} aria-pressed={method === k} onClick={() => setMethod(k)}>{label}</button>
        ))}
      </div>
      {error && <p className="gx-err" role="alert">{error}</p>}
      <div className="gx-actions">
        <button type="submit" className="gx-btn gx-btn-dark" disabled={busy || (mode === 'start' && !plan)}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="gx-btn gx-btn-soft" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
