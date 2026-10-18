import { useEffect, useMemo, useState } from 'react';
import { MEMBER_FILTERS, dayStreak, initials, memberTag, visitGrid } from './gymView';
import { agoLabel, messageMember } from '../utils/ownerView';
import { toWhatsappNumber } from '../utils/whatsappNudge';

// Members: filter chips, one row per member with a one-tap action, and a
// detail panel with their last 14 days. Plan / payment tags (Ends soon,
// Payment due) arrive with the Payments stage.
export default function GymMembers({ data, service, initialFilter = 'all', onChanged }) {
  const { clients, trainers, gym, insights } = data;
  const [filter, setFilter] = useState(initialFilter);
  const [selId, setSelId] = useState(null);
  const list = useMemo(() => {
    const f = MEMBER_FILTERS.find((x) => x.key === filter) || MEMBER_FILTERS[0];
    return clients.filter(f.test).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, filter]);
  const sel = list.find((c) => c.id === selId) || list[0] || null;

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Members</h1><p className="gx-sub">{clients.length} in your gym · tap anyone to see their streak</p></div>
      </div>
      <div className="gx-chips" role="group" aria-label="Filter members">
        {MEMBER_FILTERS.map((f) => (
          <button key={f.key} type="button" className={`gx-chip${filter === f.key ? ' on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            <i style={{ background: f.dot }} aria-hidden="true" />{f.label} · {clients.filter(f.test).length}
          </button>
        ))}
      </div>
      <div className="gx-grid-members">
        <div className="gx-list">
          {list.length === 0 && <div className="gx-card gx-sub">No members here.</div>}
          {list.map((c) => {
            const tag = memberTag(c);
            const canMessage = !!toWhatsappNumber(c.phone);
            return (
              <div key={c.id} className={`gx-member${sel?.id === c.id ? ' on' : ''}`}>
                <button type="button" className="gx-member-main" onClick={() => setSelId(c.id)}>
                  <span className="gx-avatar sm">{initials(c.name)}</span>
                  <span>
                    <span className="gx-name">{c.name}</span>
                    <span className="gx-sub">{c.trainerName ? `Trainer ${c.trainerName}` : c.selfGuided ? 'Trains on their own' : 'Waiting for a trainer'} · last workout {agoLabel(c.lastWorkout).toLowerCase()}</span>
                  </span>
                </button>
                <span className={`gx-tag ${tag.tone}`}>{tag.label}</span>
                <button
                  type="button" className={`gx-btn ${tag.tone === 'green' ? 'gx-btn-soft' : 'gx-btn-dark'}`}
                  disabled={!canMessage} title={canMessage ? '' : 'No phone number saved for this member'}
                  onClick={() => messageMember(c, gym.name)}
                >{tag.action}</button>
              </div>
            );
          })}
        </div>
        {sel && <MemberPanel key={sel.id} client={sel} trainers={trainers} today={insights?.today} service={service} onChanged={onChanged} />}
      </div>
    </div>
  );
}

function MemberPanel({ client, trainers, today, service, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let off = false;
    service.getOwnerMember(client.id).then((r) => { if (!off && r.success) setDetail(r); });
    return () => { off = true; };
  }, [service, client.id]);

  const dates = (detail?.sessions || []).map((s) => s.date);
  const grid = today ? visitGrid(dates, today, 14) : [];
  const streak = today ? dayStreak(dates, today) : 0;
  const visits = grid.filter(Boolean).length;
  const trainerOptions = trainers.filter((t) => t.id !== client.coachId);

  const save = async () => {
    if (!choice || busy) return;
    setBusy(true); setMsg('');
    const r = choice === '__self__' ? await service.ownerUnassignClient(client.id, true)
      : choice === '__none__' ? await service.ownerUnassignClient(client.id, false)
      : await service.ownerAssignClient(client.id, choice);
    setBusy(false);
    if (r.success) { setMsg('Saved.'); setChoice(''); onChanged(); } else setMsg(r.error || 'Could not save.');
  };

  return (
    <aside className="gx-panel">
      <div className="gx-who">
        <span className="gx-avatar gold">{initials(client.name)}</span>
        <div><div className="gx-name big light">{client.name}</div><div className="gx-sub light-sub">{client.email}</div></div>
      </div>
      <div className="gx-stats dark">
        <div><b>{detail ? visits : '–'}</b><span>Workouts (14d)</span></div>
        <div><b>{detail ? streak : '–'}</b><span>Day streak</span></div>
        <div><b>{client.trainerName || '—'}</b><span>Trainer</span></div>
      </div>
      <p className="gx-label gold">Last 14 days</p>
      <div className="gx-days" aria-label={`${visits} workouts in the last 14 days`}>
        {(grid.length ? grid : new Array(14).fill(false)).map((on, i) => <span key={i} className={on ? 'on' : ''} />)}
      </div>
      <p className="gx-panel-note">{memberTag(client).label}. {client.engagement ? `${client.engagement.recent14} workouts in the last 2 weeks.` : ''}</p>
      <p className="gx-label gold">Trainer</p>
      <select className="gx-select" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Change trainer">
        <option value="">Change trainer…</option>
        {trainerOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        {client.trainerName && <option value="__none__">No trainer — waiting list</option>}
        {!client.selfGuided && <option value="__self__">Trains on their own</option>}
      </select>
      <button type="button" className="gx-btn gx-btn-light" disabled={!choice || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      {msg && <p className="gx-panel-note" role="status">{msg}</p>}
    </aside>
  );
}
