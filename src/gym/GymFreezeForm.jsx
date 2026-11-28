import { useState } from 'react';
import { FREEZE_DAYS, FREEZE_MAX_DAYS, FREEZE_REASONS, frozenEndDate, shortDay } from './gymView';

// Freeze a member's running plan: how many days, why, and from when. The plan
// end date moves forward by the frozen days (sql/gym_plan_freeze.sql).
export default function GymFreezeForm({ member, plan, today, service, onDone, onCancel }) {
  const [days, setDays] = useState(15);
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('travel');
  const [startsOn, setStartsOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const n = custom !== '' ? Number(custom) : days;
  const valid = Number.isInteger(n) && n >= 1 && n <= FREEZE_MAX_DAYS;
  const lastStart = plan.endsOn;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!valid) { setError(`Freeze for 1 to ${FREEZE_MAX_DAYS} days.`); return; }
    if (!startsOn || startsOn < today || startsOn > lastStart) { setError(`Pick a start day from today to ${shortDay(lastStart)}.`); return; }
    setBusy(true); setError('');
    const r = await service.freezeGymMembership({ memberId: member.id, days: n, reason, startsOn: startsOn === today ? null : startsOn });
    setBusy(false);
    if (r.success) onDone(); else setError(r.error || 'Could not freeze the plan.');
  };

  return (
    <form className="gx-form" onSubmit={submit}>
      <p className="gx-label">Freeze {plan.planName} · {member.name}</p>
      <div className="gx-methods" role="group" aria-label="Days to freeze">
        {FREEZE_DAYS.map((d) => (
          <button key={d} type="button" className={`gx-chip${custom === '' && days === d ? ' on' : ''}`} aria-pressed={custom === '' && days === d} onClick={() => { setDays(d); setCustom(''); setError(''); }}>{d} days</button>
        ))}
      </div>
      <label className="gx-field">Or number of days (up to {FREEZE_MAX_DAYS})
        <input className="gx-input" type="number" inputMode="numeric" min="1" value={custom} placeholder="21" onChange={(e) => { setCustom(e.target.value); setError(''); }} />
      </label>
      <div className="gx-methods" role="group" aria-label="Reason">
        {FREEZE_REASONS.map((r) => (
          <button key={r.key} type="button" className={`gx-chip${reason === r.key ? ' on' : ''}`} aria-pressed={reason === r.key} onClick={() => setReason(r.key)}>{r.label}</button>
        ))}
      </div>
      <label className="gx-field">Starts
        <input className="gx-input" type="date" min={today} max={lastStart} value={startsOn} onChange={(e) => { setStartsOn(e.target.value); setError(''); }} />
      </label>
      {valid && (
        <p className="gx-sub" data-testid="freeze-preview">
          Plan now ends {shortDay(frozenEndDate(plan.endsOn, n))} instead of {shortDay(plan.endsOn)} (+{n} day{n === 1 ? '' : 's'}).
        </p>
      )}
      {error && <p className="gx-err" role="alert">{error}</p>}
      <div className="gx-actions">
        <button type="submit" className="gx-btn gx-btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Freeze plan'}</button>
        <button type="button" className="gx-btn gx-btn-soft" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
