import { useState } from 'react';
import { GYM_COLOURS, rupees } from './gymView';

const MESSAGES = [
  { key: 'renewal', label: 'Renewal reminder', when: '3 days before a plan ends', preview: 'Hi Rahul! Your Quarterly plan ends on 15 Oct. Renew now and keep that streak going!' },
  { key: 'miss', label: '“We miss you”', when: 'After 7 days with no visit', preview: 'Hi Rahul, we haven’t seen you in a week. Everything okay? Your next workout is ready.' },
  { key: 'receipt', label: 'Payment receipt', when: 'Right after each payment', preview: 'Thanks Rahul! We received ₹8,400 for your Quarterly plan.' },
  { key: 'birthday', label: 'Birthday wishes', when: 'On the member’s birthday', preview: 'Happy birthday Rahul! Have a great day from all of us.' }
];

// Settings: gym colour, which WhatsApp messages are switched on, and plans &
// prices. The message switches are saved now; the automatic sending itself is
// a later stage (said on the screen, so nothing looks like it is already live).
export default function GymSettings({ biz, bizError, gymName, service, onSaved }) {
  const s = biz?.settings;
  const [color, setColor] = useState(s?.brand_color || 'blue');
  const [flags, setFlags] = useState({ renewal: s?.wa_renewal ?? true, miss: s?.wa_miss ?? true, receipt: s?.wa_receipt ?? true, birthday: s?.wa_birthday ?? false });
  const [plans, setPlans] = useState(() => (biz?.plans || []).map((p) => ({ id: p.id, name: p.name, months: p.months, sessions: p.sessions, priceInr: p.price_inr })));
  const [limits, setLimits] = useState({ joinGoal: s?.join_goal ?? 20, capacity: s?.capacity ?? 60, sharePct: s?.trainer_share_pct ?? 70 });
  const [preview, setPreview] = useState('renewal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: true, text: '' });

  if (bizError || !biz) {
    return (
      <div className="gx-stack">
        <h1 className="gx-h1">Settings</h1>
        <div className="gx-card gx-center"><p className="gx-title">Settings aren’t available yet</p><p className="gx-sub">{bizError || 'Could not load your settings.'}</p></div>
      </div>
    );
  }

  const setPlan = (i, patch) => setPlans((all) => all.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const step = (i, d) => setPlan(i, { priceInr: Math.max(0, Number(plans[i].priceInr || 0) + d) });
  const addPlan = () => setPlans((all) => [...all, { id: null, name: 'New plan', months: 1, sessions: null, priceInr: 1000 }]);
  const removePlan = (i) => setPlans((all) => all.filter((_, j) => j !== i));

  const save = async () => {
    if (busy) return;
    setBusy(true); setMsg({ ok: true, text: '' });
    const [a, b] = await Promise.all([
      service.saveGymSettings({ color, ...flags, joinGoal: Number(limits.joinGoal), capacity: Number(limits.capacity), sharePct: Number(limits.sharePct) }),
      service.saveGymPlans(plans.map((p) => ({ ...p, priceInr: Number(p.priceInr), months: Number(p.months) })))
    ]);
    setBusy(false);
    if (a.success && b.success) { setMsg({ ok: true, text: 'Saved.' }); onSaved(); } else setMsg({ ok: false, text: a.error || b.error });
  };

  const shown = MESSAGES.find((m) => m.key === preview);

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Settings</h1><p className="gx-sub">Make the app feel like your gym</p></div>
        <button type="button" className="gx-btn gx-btn-dark" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
      {msg.text && <p className={msg.ok ? 'gx-note green' : 'gx-err'} role="status">{msg.text}</p>}

      <section className="gx-card gx-row-card">
        <div><h2 className="gx-h2">Your gym colour</h2><p className="gx-sub">Used on buttons and the menu. Try one!</p></div>
        <div className="gx-swatches" role="radiogroup" aria-label="Gym colour">
          {Object.entries(GYM_COLOURS).map(([k, hex]) => (
            <button key={k} type="button" role="radio" aria-checked={color === k} aria-label={k} className={`gx-swatch${color === k ? ' on' : ''}`} style={{ background: hex }} onClick={() => setColor(k)} />
          ))}
        </div>
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">Targets &amp; payouts</h2>
        <p className="gx-sub">These drive the Leads goal, the “live in the gym” bar, and trainer payday.</p>
        <div className="gx-form-row">
          <label className="gx-field">New members goal per month<input className="gx-input" type="number" min="1" value={limits.joinGoal} onChange={(e) => setLimits({ ...limits, joinGoal: e.target.value })} /></label>
          <label className="gx-field">People the gym holds at once<input className="gx-input" type="number" min="1" value={limits.capacity} onChange={(e) => setLimits({ ...limits, capacity: e.target.value })} /></label>
          <label className="gx-field">Trainer keeps (% of PT fees)<input className="gx-input" type="number" min="0" max="100" value={limits.sharePct} onChange={(e) => setLimits({ ...limits, sharePct: e.target.value })} /></label>
        </div>
      </section>

      <div className="gx-grid-members">
        <section className="gx-card">
          <h2 className="gx-h2">WhatsApp messages</h2>
          <p className="gx-sub">Tap a message to preview it · flip the switch to turn it on or off. Your choices are saved; automatic sending is coming in a later stage.</p>
          <div className="gx-list">
            {MESSAGES.map((m) => (
              <div key={m.key} className={`gx-msg${preview === m.key ? ' on' : ''}`}>
                <button type="button" className="gx-msg-main" onClick={() => setPreview(m.key)}>
                  <span className="gx-name">{m.label}</span><span className="gx-sub">{m.when}</span>
                </button>
                <button type="button" role="switch" aria-checked={flags[m.key]} aria-label={`${m.label} on or off`} className={`gx-switch${flags[m.key] ? ' on' : ''}`} onClick={() => setFlags((f) => ({ ...f, [m.key]: !f[m.key] }))}><i /></button>
              </div>
            ))}
          </div>
        </section>
        <aside className="gx-panel">
          <div className="gx-who"><span className="gx-avatar gold">{(gymName || 'G').slice(0, 2).toUpperCase()}</span><div><div className="gx-name light">{gymName}</div><div className="gx-sub light-sub">WhatsApp preview</div></div></div>
          <div className="gx-bubble">{shown.preview}</div>
          <p className="gx-sub light-sub">{flags[shown.key] ? 'On' : 'Off'}</p>
        </aside>
      </div>

      <section className="gx-card">
        <h2 className="gx-h2">Plans &amp; prices</h2>
        <p className="gx-sub">What you sell. Changing a price only affects plans sold from now on.</p>
        <div className="gx-grid4">
          {plans.map((p, i) => (
            <div key={p.id || `new-${i}`} className={`gx-planbox t${i % 4}`}>
              <input className="gx-input plain" aria-label="Plan name" value={p.name} maxLength={60} onChange={(e) => setPlan(i, { name: e.target.value })} />
              <div className="gx-stepper">
                <button type="button" aria-label="Lower price by ₹100" onClick={() => step(i, -100)}>−</button>
                <input className="gx-input price" aria-label="Price in rupees" type="number" min="0" value={p.priceInr} onChange={(e) => setPlan(i, { priceInr: e.target.value })} />
                <button type="button" aria-label="Raise price by ₹100" onClick={() => step(i, 100)}>+</button>
              </div>
              <div className="gx-sub">{rupees(p.priceInr)} · lasts
                {' '}<input className="gx-input tiny" aria-label="Months it lasts" type="number" min="1" max="36" value={p.months} onChange={(e) => setPlan(i, { months: e.target.value })} /> month{Number(p.months) === 1 ? '' : 's'}
                {p.sessions ? ` · ${p.sessions} sessions` : ''}
              </div>
              <button type="button" className="gx-link" onClick={() => removePlan(i)}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className="gx-btn gx-btn-soft" onClick={addPlan} disabled={plans.length >= 20}>+ Add a plan</button>
      </section>
    </div>
  );
}
