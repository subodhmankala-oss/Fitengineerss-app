import { useState } from 'react';
import { LEAD_SOURCES, LEAD_STAGES, istDate, istTime, leadStats } from './gymView';
import { openWhatsapp, toWhatsappNumber } from '../utils/whatsappNudge';
import { shortDate } from '../utils/ownerView';

const sourceLabel = (k) => LEAD_SOURCES.find((s) => s.key === k)?.label || k;
const NEXT = { new: 'trial_booked', trial_booked: 'trial_done', trial_done: 'joined' };
const PREV = { trial_booked: 'new', trial_done: 'trial_booked', joined: 'trial_done' };
const NEXT_LABEL = { new: 'Book trial →', trial_booked: 'Came for trial →', trial_done: 'Joined! →' };

// "Trial today 6:30 PM", "Trial tomorrow 7 AM", or "Trial 22 Oct 6:30 PM".
function trialText(iso, today) {
  const day = istDate(iso);
  const [h, m] = istTime(iso).split(':').map(Number);
  const t = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return `Trial ${diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : shortDate(day)} ${t}`;
}

// Leads: new enquiries moving through trial to joined, with the monthly joins
// goal on top. Moves happen with the arrow buttons (no drag and drop).
export default function GymLeads({ data, biz, bizError, service, onChanged }) {
  const today = data.insights?.today;
  const [source, setSource] = useState('all');
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState(null); // lead id picking a trial time
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ name: '', phone: '', source: 'walk-in', note: '' });
  const [trialAt, setTrialAt] = useState('');

  if (bizError || !biz || !biz.leads) {
    return (
      <div className="gx-stack">
        <h1 className="gx-h1">Leads</h1>
        <div className="gx-card gx-center"><p className="gx-title">Leads aren’t available yet</p><p className="gx-sub">{bizError || 'This part of the database has not been set up yet.'}</p></div>
      </div>
    );
  }

  const stats = leadStats(biz.leads, biz.settings?.join_goal ?? 20, today);
  const shown = biz.leads.filter((l) => source === 'all' || l.source === source);
  const pct = Math.min(100, Math.round((stats.joined / stats.goal) * 100));

  const run = async (body) => {
    if (busy) return false;
    setBusy(true); setError('');
    const r = await service.gymLead(body);
    setBusy(false);
    if (!r.success) { setError(r.error); return false; }
    onChanged();
    return true;
  };

  const add = async (e) => {
    e.preventDefault();
    if (await run({ op: 'add', ...draft, trialAt: null })) { setAdding(false); setDraft({ name: '', phone: '', source: 'walk-in', note: '' }); }
  };

  const advance = (lead) => {
    if (lead.stage === 'new') { setBooking(lead.id); setTrialAt(''); return; }
    run({ op: 'move', leadId: lead.id, stage: NEXT[lead.stage] });
  };

  const bookTrial = async (lead) => {
    if (!trialAt) { setError('Pick a date and time for the trial.'); return; }
    if (await run({ op: 'move', leadId: lead.id, stage: 'trial_booked', trialAt: new Date(trialAt).toISOString() })) setBooking(null);
  };

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Leads</h1><p className="gx-sub">Move people along with the arrow buttons</p></div>
        <button type="button" className="gx-btn gx-btn-blue" onClick={() => setAdding((a) => !a)}>+ Add enquiry</button>
      </div>

      <section className="gx-card gx-dark gx-goal">
        <div><span className="gx-tile-label light-sub">New members this month</span><div className="gx-big gx-light">{stats.joined} <small>/ {stats.goal} goal</small></div></div>
        <div className="gx-goal-bar" role="img" aria-label={`${stats.joined} of ${stats.goal} joined`}>
          <span><i style={{ width: `${pct}%` }} /></span>
          <p className="gx-sub light-sub">{stats.toGo} more to hit the goal · {stats.daysLeft} day{stats.daysLeft === 1 ? '' : 's'} left</p>
        </div>
      </section>

      {adding && (
        <form className="gx-card gx-form" onSubmit={add}>
          <p className="gx-label">New enquiry</p>
          <div className="gx-form-row">
            <label className="gx-field">Name<input className="gx-input" required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="gx-field">Phone<input className="gx-input" type="tel" maxLength={20} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
            <label className="gx-field">Came from
              <select className="gx-select" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
                {LEAD_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label className="gx-field">What they want<input className="gx-input" maxLength={200} value={draft.note} placeholder="e.g. Wants fat loss, evenings" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          <div className="gx-actions"><button type="submit" className="gx-btn gx-btn-dark" disabled={busy}>Save enquiry</button><button type="button" className="gx-btn gx-btn-soft" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}
      {error && <p className="gx-err" role="alert">{error}</p>}

      <div className="gx-chips" role="group" aria-label="Filter by source">
        {[{ key: 'all', label: 'All sources' }, ...LEAD_SOURCES].map((s) => (
          <button key={s.key} type="button" className={`gx-chip${source === s.key ? ' on' : ''}`} aria-pressed={source === s.key} onClick={() => setSource(s.key)}>
            {s.label} · {s.key === 'all' ? biz.leads.length : biz.leads.filter((l) => l.source === s.key).length}
          </button>
        ))}
      </div>

      <div className="gx-kanban">
        {LEAD_STAGES.map((st) => {
          const col = shown.filter((l) => l.stage === st.key);
          return (
            <section key={st.key} className={`gx-col ${st.tone}`} aria-label={st.label}>
              <h2 className="gx-col-title">{st.label} <span>{col.length}</span></h2>
              {col.length === 0 && <p className="gx-sub">Nobody here</p>}
              {col.map((l) => (
                <article key={l.id} className="gx-lead">
                  <div className="gx-lead-top"><b>{l.name}</b><span className="gx-src">{sourceLabel(l.source)}</span></div>
                  {l.trial_at && l.stage === 'trial_booked' && <p className="gx-sub">{trialText(l.trial_at, today)}</p>}
                  {l.note && <p className="gx-sub">{l.note}</p>}
                  {booking === l.id ? (
                    <div className="gx-form-inline">
                      <input className="gx-input" type="datetime-local" aria-label="Trial date and time" value={trialAt} onChange={(e) => setTrialAt(e.target.value)} />
                      <div className="gx-actions"><button type="button" className="gx-btn gx-btn-dark" disabled={busy} onClick={() => bookTrial(l)}>Book</button><button type="button" className="gx-btn gx-btn-soft" onClick={() => setBooking(null)}>Cancel</button></div>
                    </div>
                  ) : (
                    <div className="gx-lead-actions">
                      {PREV[l.stage] && <button type="button" className="gx-btn gx-btn-soft gx-btn-icon" aria-label="Move back a step" disabled={busy} onClick={() => run({ op: 'move', leadId: l.id, stage: PREV[l.stage] })}>←</button>}
                      {NEXT[l.stage]
                        ? <button type="button" className={`gx-btn ${l.stage === 'trial_done' ? 'gx-btn-green' : 'gx-btn-dark'} gx-grow`} disabled={busy} onClick={() => advance(l)}>{NEXT_LABEL[l.stage]}</button>
                        : <span className="gx-tag green gx-grow">Welcome aboard!</span>}
                      {toWhatsappNumber(l.phone) && <button type="button" className="gx-btn gx-btn-soft gx-btn-icon" aria-label={`WhatsApp ${l.name}`} onClick={() => openWhatsapp(toWhatsappNumber(l.phone), `Hi ${l.name.split(' ')[0]}, thanks for your interest in ${data.gym.name}!`)}>WA</button>}
                      <button type="button" className="gx-link" onClick={() => run({ op: 'delete', leadId: l.id })}>Remove</button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
