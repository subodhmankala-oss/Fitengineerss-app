import { useState } from 'react';
import { initials, payday, rankTrainers, rupees, trainerDays } from './gymView';
import { WeeklyBars } from '../components/OwnerCharts';
import GymInvite from './GymInvite';

// Trainers: a podium of who keeps members training, and one trainer's detail.
// Payday: each trainer's share of the PT fees their members paid this month.
export default function GymTrainers({ data, biz, service, onChanged, onOpenMembers }) {
  const trainers = data.trainers;
  const ranked = rankTrainers(trainers);
  const [selId, setSelId] = useState(ranked[0]?.id || trainers[0]?.id || null);
  const sel = trainers.find((t) => t.id === selId);
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const height = { 1: 190, 2: 150, 3: 120 };
  const month = (data.insights?.today || '').slice(0, 7);
  const monthName = month ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' }) : '';
  const share = biz?.settings?.trainer_share_pct ?? 70;
  const rows = biz && biz.payouts && month ? payday(biz, data.clients, trainers.filter((t) => t.clientCount > 0 || t.isOwner === false), month, share) : null;
  const totalDue = rows ? rows.reduce((s, r) => s + r.payout, 0) : 0;
  const totalPaid = rows ? rows.filter((r) => r.paid).reduce((s, r) => s + (r.paidAmount ?? r.payout), 0) : 0;
  const today = data.insights?.today;
  const roster = trainers.filter((t) => t.clientCount > 0 || !t.isOwner);
  const hasDays = !!biz && !!biz.trainerDays;
  const [dayBusy, setDayBusy] = useState(null);
  const markDay = async (trainerId, status) => {
    setDayBusy(trainerId); setPayError('');
    const res = await service.gymOwnerMarkDay(trainerId, today, status);
    setDayBusy(null);
    if (res.success) onChanged(); else setPayError(res.error);
  };
  const [payBusy, setPayBusy] = useState(null);
  const [payError, setPayError] = useState('');
  const togglePaid = async (r) => {
    setPayBusy(r.trainerId); setPayError('');
    const res = await service.gymPayout({ trainerId: r.trainerId, month: `${month}-01`, amountInr: r.payout, paid: !r.paid });
    setPayBusy(null);
    if (res.success) onChanged(); else setPayError(res.error);
  };

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Trainers</h1><p className="gx-sub">Who keeps members training · tap a trainer to see their week</p></div>
      </div>
      <GymInvite gym={data.gym} />
      {hasDays && roster.length > 0 && (
        <section className="gx-card">
          <h2 className="gx-h2">Today</h2>
          <p className="gx-sub">A trainer counts as in once they open the coach app. You can change anyone’s day.</p>
          <div className="gx-list">
            {roster.map((t) => {
              const d = trainerDays(biz, t.id, today);
              return (
                <div key={t.id} className="gx-today-row">
                  <span className={`gx-dot ${d.today === 'in' ? 'in' : d.today === 'off' ? 'off' : ''}`} aria-hidden="true" />
                  <span className="gx-name">{t.name}</span>
                  <span className="gx-sub">{d.today === 'in' ? 'In today' : d.today === 'off' ? 'Day off' : 'Not in yet'}</span>
                  <span className="gx-actions">
                    {d.today !== 'in' && <button type="button" className="gx-btn gx-btn-soft" disabled={dayBusy === t.id} onClick={() => markDay(t.id, 'in')}>Mark in</button>}
                    {d.today !== 'off' && <button type="button" className="gx-btn gx-btn-soft" disabled={dayBusy === t.id} onClick={() => markDay(t.id, 'off')}>Day off</button>}
                    {d.today && <button type="button" className="gx-link" disabled={dayBusy === t.id} onClick={() => markDay(t.id, null)}>Clear</button>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div className="gx-grid-trainers">
        <section className="gx-card gx-dark">
          <h2 className="gx-h2 gx-light">Keeping members training</h2>
          {podium.length === 0 && <p className="gx-sub gx-light-sub">Trainers appear once they have members.</p>}
          <div className="gx-podium">
            {podium.map((t) => {
              const rank = ranked.indexOf(t) + 1;
              return (
                <button key={t.id} type="button" className="gx-pod" onClick={() => setSelId(t.id)}>
                  <span className={`gx-avatar sm${rank === 1 ? ' gold' : ''}`}>{initials(t.name)}</span>
                  <span className="gx-pod-name">{t.name}</span>
                  <span className={`gx-pod-bar r${rank}`} style={{ height: height[rank] || 100 }}>
                    <b>{rank}</b><i>{t.stats.activePct}%</i>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {sel && (
          <section className="gx-card">
            <div className="gx-who">
              <span className="gx-avatar gold">{initials(sel.name)}</span>
              <div><div className="gx-name big">{sel.name}</div><div className="gx-sub">{sel.isOwner ? 'Gym owner' : 'Trainer'}</div></div>
            </div>
            <div className="gx-stats">
              <div className="gx-stat blue"><b>{sel.clientCount}</b><span>Members</span></div>
              <div className="gx-stat amber"><b>{sel.stats.workouts7d}</b><span>Workouts this week</span></div>
              <div className="gx-stat green"><b>{sel.stats.activePct == null ? '–' : `${sel.stats.activePct}%`}</b><span>Still training</span></div>
            </div>
            <p className="gx-label">Workouts by their members, last 8 weeks</p>
            <WeeklyBars values={sel.stats.weekly} labels={sel.stats.weekly.map((_, i) => `W${i + 1}`)} height={96} labelEvery={1} title={`${sel.name} workouts per week`} />
            <p className={`gx-note ${sel.stats.atRisk ? 'amber' : 'green'}`}>
              {sel.stats.atRisk
                ? `${sel.stats.atRisk} of their members ${sel.stats.atRisk === 1 ? 'is' : 'are'} slipping or gone quiet.`
                : 'Doing great — no members slipping.'}
            </p>
            {sel.clientCount > 0 && <button type="button" className="gx-btn gx-btn-dark" onClick={() => onOpenMembers('all')}>See members</button>}
          </section>
        )}
      </div>

      {rows && (
        <section className="gx-card">
          <div className="gx-row">
            <div><h2 className="gx-h2">Payday · {monthName}</h2><p className="gx-sub">Trainers keep {share}% of the personal-training fees their members paid this month</p></div>
            <div className="gx-sub"><b>{rupees(totalPaid)}</b> of {rupees(totalDue)} paid</div>
          </div>
          {payError && <p className="gx-err" role="alert">{payError}</p>}
          <div className="gx-grid3">
            {rows.map((r) => (
              <div key={r.trainerId} className={`gx-payday${r.paid ? ' paid' : ''}`}>
                <div className="gx-row"><b>{r.name}</b><span className="gx-sub">Fees {rupees(r.fees)}</span></div>
                {hasDays && (() => { const d = trainerDays(biz, r.trainerId, today); return <p className="gx-sub">{d.daysIn} day{d.daysIn === 1 ? '' : 's'} in this month · {d.highFives} high-five{d.highFives === 1 ? '' : 's'}</p>; })()}
                <div className="gx-big sm">{rupees(r.payout)}</div>
                <button type="button" className={`gx-btn ${r.paid ? 'gx-btn-green' : 'gx-btn-dark'} gx-btn-full`} disabled={payBusy === r.trainerId || (!r.paid && r.payout === 0)} onClick={() => togglePaid(r)}>
                  {r.paid ? 'Paid — tap to undo' : r.payout === 0 ? 'No PT fees this month' : 'Mark as paid'}
                </button>
              </div>
            ))}
          </div>
          {rows.length === 0 && <p className="gx-sub">Trainers appear once they have members.</p>}
        </section>
      )}
    </div>
  );
}
