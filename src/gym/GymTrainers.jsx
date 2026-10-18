import { useState } from 'react';
import { initials, rankTrainers } from './gymView';
import { WeeklyBars } from '../components/OwnerCharts';

// Trainers: a podium of who keeps members training, and one trainer's detail.
// Payday (fees and payouts) arrives with the Payments stage.
export default function GymTrainers({ data, onOpenMembers }) {
  const trainers = data.trainers;
  const ranked = rankTrainers(trainers);
  const [selId, setSelId] = useState(ranked[0]?.id || trainers[0]?.id || null);
  const sel = trainers.find((t) => t.id === selId);
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const height = { 1: 190, 2: 150, 3: 120 };

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Trainers</h1><p className="gx-sub">Who keeps members training · tap a trainer to see their week</p></div>
      </div>
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
    </div>
  );
}
