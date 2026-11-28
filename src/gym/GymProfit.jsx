import { useMemo, useState } from 'react';
import { EXPENSE_CATEGORIES, expenseLabel, monthName, monthlyProfit, rupees } from './gymView';
import { shortDate } from '../utils/ownerView';

// Profit: money collected minus what the gym spent, by month. Expenses are
// entered here (monthly ones once); trainer PT payouts marked paid on the
// Trainers page count by themselves.
export default function GymProfit({ biz, today, service, onChanged }) {
  const profit = useMemo(() => monthlyProfit(biz, today, 6), [biz, today]);
  const [monthKey, setMonthKey] = useState(profit.thisMonth.key);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');
  const month = profit.months.find((m) => m.key === monthKey) || profit.thisMonth;
  const isNow = month.key === profit.thisMonth.key;
  const top = Math.max(1, ...profit.months.map((m) => Math.abs(m.profit)));
  const catTop = Math.max(1, ...month.byCategory.map((c) => c.total));
  const missing = biz?.expenses == null;

  const act = async (op, e) => {
    if (busyId) return;
    setBusyId(e.id); setMsg('');
    const r = await service.gymExpense({ op, expenseId: e.id });
    setBusyId(null);
    if (r.success) onChanged(); else setMsg(r.error || 'Could not save.');
  };

  return (
    <section className="gx-card" aria-labelledby="gx-profit-h">
      <div className="gx-head">
        <div>
          <h2 className="gx-h2" id="gx-profit-h">Profit</h2>
          <p className="gx-sub">Money collected minus what the gym spent. Trainer PT payouts you mark paid count by themselves.</p>
        </div>
        {!adding && !missing && <button type="button" className="gx-btn gx-btn-dark" onClick={() => setAdding(true)}>Add expense</button>}
      </div>

      <div className="gx-chips" role="group" aria-label="Month">
        {profit.months.map((m) => (
          <button key={m.key} type="button" className={`gx-chip${m.key === month.key ? ' on' : ''}`} aria-pressed={m.key === month.key} onClick={() => setMonthKey(m.key)}>{m.label}</button>
        ))}
      </div>

      <div className="gx-grid3">
        <div className="gx-tile gx-tile-dark"><span className="gx-tile-label">Collected</span><span className="gx-big">{rupees(month.collected)}</span><span className="gx-tile-sub">{monthName(month.key)}{isNow ? ' so far' : ''}</span></div>
        <div className="gx-tile gx-tile-amber"><span className="gx-tile-label">Spent</span><span className="gx-big">{rupees(month.spent)}</span><span className="gx-tile-sub">{month.byCategory.length ? `${month.byCategory.length} kind${month.byCategory.length === 1 ? '' : 's'} of cost` : 'No expenses added'}</span></div>
        <div className={`gx-tile ${month.profit >= 0 ? 'gx-tile-green' : 'gx-tile-red'}`} data-testid="profit-tile">
          <span className="gx-tile-label">{month.profit >= 0 ? 'Profit' : 'Loss'}</span>
          <span className="gx-big">{rupees(Math.abs(month.profit))}</span>
          <span className="gx-tile-sub">{month.collected > 0 ? `${Math.round((month.profit / month.collected) * 100)}% of what came in` : 'Nothing collected yet'}</span>
        </div>
      </div>

      {adding && <ExpenseForm today={today} service={service} onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />}
      {missing && <p className="gx-sub">Expenses aren’t switched on for your gym yet.</p>}

      {month.byCategory.length > 0 && (
        <div className="gx-list" aria-label="Where the money went">
          {month.byCategory.map((c) => (
            <div key={c.key} className="gx-cost">
              <span className="gx-name">{c.label}</span>
              <span className="gx-cost-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, (c.total / catTop) * 100)}%` }} /></span>
              <b>{rupees(c.total)}</b>
            </div>
          ))}
        </div>
      )}

      <p className="gx-label">Profit by month</p>
      <div className="gx-bars short" aria-label="Profit by month">
        {profit.months.map((m) => (
          <div key={m.key} className="gx-bar">
            <span className={`gx-bar-n${m.profit < 0 ? ' neg' : ''}`}>{m.collected || m.spent ? `${m.profit < 0 ? '−' : ''}${rupees(Math.abs(m.profit))}` : ''}</span>
            <i className={`${m.key === month.key ? 'now' : ''}${m.profit < 0 ? ' neg' : ''}`} style={{ height: `${Math.max(4, (Math.abs(m.profit) / top) * 100)}%` }} />
            <span className="gx-sub">{m.label}</span>
          </div>
        ))}
      </div>

      {month.items.length > 0 && (
        <>
          <p className="gx-label">Expenses in {monthName(month.key)}</p>
          <div className="gx-list">
            {month.items.map((e) => (
              <div key={e.id} className="gx-pay gx-pay-actions">
                <span>
                  <span className="gx-name">{expenseLabel(e.category)}{e.note ? ` · ${e.note}` : ''}</span>
                  <span className="gx-sub">{e.monthly ? `Every month since ${shortDate(e.spent_on)}${e.stopped_on ? `, stops after ${monthName(String(e.stopped_on).slice(0, 7))}` : ''}` : shortDate(e.spent_on)}</span>
                </span>
                <b>{rupees(e.amount_inr)}</b>
                <span className="gx-actions">
                  {e.monthly && !e.stopped_on && <button type="button" className="gx-btn gx-btn-soft" disabled={busyId === e.id} onClick={() => act('stop', e)}>Stop after this month</button>}
                  <button type="button" className="gx-btn gx-btn-soft" disabled={busyId === e.id} onClick={() => act('delete', e)} aria-label={`Remove ${expenseLabel(e.category)} ${rupees(e.amount_inr)}`}>Remove</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <p className="gx-err" role="alert">{msg}</p>}
    </section>
  );
}

function ExpenseForm({ today, service, onDone, onCancel }) {
  const [category, setCategory] = useState('rent');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(today);
  const [note, setNote] = useState('');
  const [monthly, setMonthly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (key) => {
    setCategory(key);
    // Rent, salaries and electricity usually come every month.
    setMonthly(['rent', 'salaries', 'electricity'].includes(key));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) { setError('Enter the amount in whole rupees.'); return; }
    if (!spentOn) { setError('Pick the date.'); return; }
    setBusy(true); setError('');
    const r = await service.gymExpense({ op: 'add', category, amountInr: n, spentOn, note: note.trim() || null, monthly });
    setBusy(false);
    if (r.success) onDone(); else setError(r.error || 'Could not save the expense.');
  };

  return (
    <form className="gx-form" onSubmit={submit}>
      <p className="gx-label">Add expense</p>
      <div className="gx-methods" role="group" aria-label="Spent on">
        {EXPENSE_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={`gx-chip${category === c.key ? ' on' : ''}`} aria-pressed={category === c.key} onClick={() => pick(c.key)}>{c.label}</button>
        ))}
      </div>
      <label className="gx-field">Amount (₹)
        <input className="gx-input" type="number" inputMode="numeric" min="1" value={amount} placeholder="80000" onChange={(e) => { setAmount(e.target.value); setError(''); }} />
      </label>
      <label className="gx-field">Date
        <input className="gx-input" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
      </label>
      <label className="gx-field">Note (optional)
        <input className="gx-input" type="text" maxLength={80} value={note} placeholder="New dumbbell rack" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="gx-switch-row">
        <button type="button" role="switch" aria-checked={monthly} aria-label="Repeats every month" className={`gx-switch${monthly ? ' on' : ''}`} onClick={() => setMonthly((m) => !m)}><i /></button>
        <span>Repeats every month <span className="gx-sub">— counted each month until you stop it</span></span>
      </div>
      {error && <p className="gx-err" role="alert">{error}</p>}
      <div className="gx-actions">
        <button type="submit" className="gx-btn gx-btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
        <button type="button" className="gx-btn gx-btn-soft" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
