import { useMemo } from 'react';
import { PeakGrid, WeeklyBars } from '../components/OwnerCharts';
import { weekLabels, weekRanges } from '../utils/ownerView';
import { memberPlans, monthlyCollections, newMemberJourney, rankTrainers, renewalRisk, rupees } from './gymView';
import { messageNewMember, messagePlan } from './gymMessages';

const JOURNEY_LABEL = {
  waiting: { text: 'Not started', tone: 'amber' },
  started: { text: 'Getting going', tone: 'amber' },
  hooked: { text: 'Hooked', tone: 'green' }
};

const planWhen = (p) => (p.daysLeft < 0 ? `ended ${-p.daysLeft} day${p.daysLeft === -1 ? '' : 's'} ago` : p.daysLeft === 0 ? 'ends today' : `ends in ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`);

// Reports: how the gym is doing over time, built only from what is already
// loaded: training activity (no private notes, photos or measurements) and
// the plans & payments the owner recorded.
export default function GymReports({ data, biz }) {
  const { clients, trainers, insights, gym } = data;
  const today = insights?.today;
  const weekly = insights?.weekly || [];
  const plans = useMemo(() => (biz && today ? memberPlans(biz, today) : {}), [biz, today]);
  const risk = useMemo(() => renewalRisk(clients, plans), [clients, plans]);
  const journey = useMemo(() => newMemberJourney(clients), [clients]);
  const money = biz && today ? monthlyCollections(biz.payments, today, 6) : null;
  const maxMonth = money ? Math.max(1, ...money.months.map((m) => m.total)) : 1;
  const ranked = rankTrainers(trainers);
  const high = risk.filter((r) => r.level === 'high').length;
  const waiting = journey.filter((j) => j.stage === 'waiting').length;
  const activeNow = clients.filter((c) => c.workouts28d > 0).length;
  const retention = clients.length ? Math.round((100 * activeNow) / clients.length) : null;

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div><h1 className="gx-h1">Reports</h1><p className="gx-sub">How {gym.name} is doing, from members’ logged workouts and the payments you recorded.</p></div>
      </div>

      <div className="gx-grid3">
        <div className="gx-tile gx-tile-dark"><span className="gx-tile-label">Still training</span><span className="gx-big">{retention === null ? '—' : `${retention}%`}</span><span className="gx-tile-sub">{activeNow} of {clients.length} trained in the last 4 weeks</span></div>
        <div className="gx-tile gx-tile-amber"><span className="gx-tile-label">Renewals at risk</span><span className="gx-big">{high}</span><span className="gx-tile-sub">plan ending and not training</span></div>
        <div className="gx-tile gx-tile-blue"><span className="gx-tile-label">New, not started</span><span className="gx-big">{waiting}</span><span className="gx-tile-sub">joined in the last 4 weeks, no workout yet</span></div>
      </div>

      <div className="gx-grid2 even">
        <section className="gx-card">
          <h2 className="gx-h2">Workouts per week</h2>
          <p className="gx-sub">Last 8 weeks, with how many members trained.</p>
          {weekly.length > 0 && today && (
            <WeeklyBars values={weekly.map((w) => w.workouts)} secondary={weekly.map((w) => w.members)} labels={weekLabels(today, weekly.length)} ranges={weekRanges(today, weekly.length)} title="Workouts per week" />
          )}
        </section>
        <section className="gx-card">
          <h2 className="gx-h2">Busiest times</h2>
          <p className="gx-sub">When members start training, last 8 weeks.</p>
          {insights?.peak?.total >= 5 ? <PeakGrid grid={insights.peak.grid} /> : <p className="gx-sub">A few more workouts and the busy times will show here.</p>}
        </section>
      </div>

      {money && (
        <section className="gx-card">
          <h2 className="gx-h2">Money collected</h2>
          <p className="gx-sub">{rupees(money.thisMonth)} this month</p>
          <div className="gx-bars">
            {money.months.map((m, i) => (
              <div key={m.key} className="gx-bar">
                <span className="gx-bar-n">{m.total ? rupees(m.total) : ''}</span>
                <i className={i === money.months.length - 1 ? 'now' : ''} style={{ height: `${Math.max(4, (m.total / maxMonth) * 100)}%` }} />
                <span className="gx-sub">{m.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="gx-card">
        <h2 className="gx-h2">Trainer scorecard</h2>
        <p className="gx-sub">Members still training, workouts per member each week, and members slipping.</p>
        {ranked.length === 0 && <p className="gx-sub">Trainers appear once they have members.</p>}
        <div className="gx-list">
          {ranked.map((t) => (
            <div key={t.id} className="gx-rank">
              <div>
                <div className="gx-name">{t.name}</div>
                <div className="gx-sub">{t.clientCount} member{t.clientCount === 1 ? '' : 's'} · {t.stats.activePct}% still training · {t.stats.perClientWeek} workouts/member/week · {t.stats.atRisk} slipping or stopped</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">Renewal risk</h2>
        <p className="gx-sub">Plans ending soon or ended. Members who stopped training come first, since they are the ones likely to leave.</p>
        {!biz && <p className="gx-sub">Add plans in Payments to see renewals.</p>}
        {biz && risk.length === 0 && <p className="gx-sub">No plans are ending right now.</p>}
        <div className="gx-list">
          {risk.map(({ client, plan, level }) => (
            <div key={client.id} className="gx-rank">
              <div className="gx-grow">
                <div className="gx-name">{client.name} <span className={`gx-pill ${level === 'high' ? 'amber' : 'green'}`}>{level === 'high' ? 'Likely to leave' : 'Still training'}</span></div>
                <div className="gx-sub">{plan.planName} {planWhen(plan)}</div>
              </div>
              {client.phone && <button type="button" className="gx-btn gx-btn-dark" onClick={() => messagePlan(client, gym.name, plan)}>{plan.state === 'expired' ? 'Renew' : 'Remind'}</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">New-member journey</h2>
        <p className="gx-sub">Members who joined in the last 4 weeks: have they started, and how many workouts in their first 2 weeks.</p>
        {journey.length === 0 && <p className="gx-sub">Nobody joined in the last 4 weeks.</p>}
        <div className="gx-list">
          {journey.map(({ client, stage, dayN, firstWorkoutDay, workouts }) => (
            <div key={client.id} className="gx-rank">
              <div className="gx-grow">
                <div className="gx-name">{client.name} <span className={`gx-pill ${JOURNEY_LABEL[stage].tone}`}>{JOURNEY_LABEL[stage].text}</span></div>
                <div className="gx-sub">Day {dayN} · {stage === 'waiting' ? 'no workout yet' : `first workout on day ${firstWorkoutDay + 1} · ${workouts} workout${workouts === 1 ? '' : 's'} so far`}</div>
              </div>
              {client.phone && stage !== 'hooked' && <button type="button" className="gx-btn gx-btn-dark" onClick={() => messageNewMember(client, gym.name, stage)}>{stage === 'waiting' ? 'Welcome' : 'Cheer on'}</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
