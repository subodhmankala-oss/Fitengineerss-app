import { useState } from 'react';
import GymInvite from './GymInvite';
import { busyLabel, checkinsToday, greeting, insideNow, istDate, leadStats, memberPlans, monthlyCollections, rankTrainers, rupees } from './gymView';
import { HealthBar, WeeklyBars } from '../components/OwnerCharts';
import { weekLabels, weekRanges } from '../utils/ownerView';

// Overview from what the app really knows today: training activity. Money,
// check-ins and leads fill the same grid as their stages land.
export default function GymOverview({ data, biz, service, onChanged, owner, onOpenMembers }) {
  const [pick, setPick] = useState('');
  const [ciBusy, setCiBusy] = useState(false);
  const [ciError, setCiError] = useState('');
  const { clients, trainers, insights, gym } = data;
  const first = (owner?.name || '').split(' ')[0];
  const trainedWeek = clients.filter((c) => c.workouts7d > 0).length;
  const workoutsWeek = clients.reduce((s, c) => s + c.workouts7d, 0);
  const stopped = clients.filter((c) => ['quiet', 'inactive'].includes(c.engagement?.status)).length;
  const slipping = clients.filter((c) => c.engagement?.status === 'slipping').length;
  const waiting = clients.filter((c) => !c.trainerName && !c.selfGuided).length;
  const fresh = clients.filter((c) => c.engagement?.status === 'new').length;
  const ranked = rankTrainers(trainers).slice(0, 3);
  const weekly = insights?.weekly || [];
  const today = insights?.today;

  const plans = biz && insights?.today ? memberPlans(biz, insights.today) : {};
  const dueN = clients.filter((c) => plans[c.id]?.state === 'due').length;
  const endsN = clients.filter((c) => ['ends-soon', 'expired'].includes(plans[c.id]?.state)).length;
  const money = biz && insights?.today ? monthlyCollections(biz.payments, insights.today, 6) : null;
  const maxMonth = money ? Math.max(1, ...money.months.map((m) => m.total)) : 1;

  const live = biz?.checkins ? insideNow(biz.checkins) : null;
  const capacity = biz?.settings?.capacity ?? 60;
  const names = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const todayStr = insights?.today;
  const collectedToday = biz && todayStr ? biz.payments.filter((p) => p.paid_on === todayStr).reduce((s, p) => s + p.amount_inr, 0) : 0;
  const lead = biz?.leads && todayStr ? leadStats(biz.leads, biz.settings?.join_goal ?? 20, todayStr) : null;
  const joinsToday = biz?.leads && todayStr ? biz.leads.filter((l) => l.stage === 'joined' && l.joined_at && istDate(l.joined_at) === todayStr).length : 0;
  const trialsToday = biz?.leads && todayStr ? biz.leads.filter((l) => l.stage === 'trial_booked' && l.trial_at && istDate(l.trial_at) === todayStr).length : 0;
  const checkIn = async (memberId, out) => {
    if (!memberId || ciBusy) return;
    setCiBusy(true); setCiError('');
    const r = await service.gymCheckin(memberId, out);
    setCiBusy(false);
    if (r.success) { setPick(''); onChanged(); } else setCiError(r.error);
  };

  const plan = [
    { n: dueN, tone: 'amber', title: 'Payments still due', sub: 'Remind them on WhatsApp', cta: `See all ${dueN}`, filter: 'due' },
    { n: endsN, tone: 'amber', title: 'Plans ending or ended', sub: 'Send renewal reminders', cta: `See all ${endsN}`, filter: 'ends' },
    { n: stopped, tone: 'red', title: 'Members who stopped coming', sub: 'Send a friendly “we miss you”', cta: `See all ${stopped}`, filter: 'stopped' },
    { n: slipping, tone: 'amber', title: 'Members who are slipping', sub: 'Training much less than before', cta: `See all ${slipping}`, filter: 'slipping' },
    { n: waiting, tone: 'green', title: 'Waiting for a trainer', sub: 'Joined with the gym code, no trainer yet', cta: `Assign ${waiting}`, filter: 'waiting' }
  ].filter((p) => p.n > 0);

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div>
          <h1 className="gx-h1">{greeting()}{first ? `, ${first}` : ''}</h1>
          <div className="gx-pills">
            <span className="gx-pill amber">{trainedWeek} of {clients.length} members trained this week</span>
            {fresh > 0 && <span className="gx-pill green">{fresh} new member{fresh === 1 ? '' : 's'} not started</span>}
          </div>
        </div>
      </div>

      <GymInvite gym={gym} />

      <div className="gx-grid3">
        <button type="button" className="gx-tile gx-tile-dark" onClick={() => onOpenMembers('all')}>
          <span className="gx-tile-label">Members in {gym.name}</span>
          <span className="gx-big">{clients.length}</span>
          <span className="gx-tile-sub">{trainers.filter((t) => t.clientCount > 0).length} trainers coaching them</span>
        </button>
        <button type="button" className="gx-tile gx-tile-amber" onClick={() => onOpenMembers('active')}>
          <span className="gx-tile-label">Trained this week</span>
          <span className="gx-big">{trainedWeek}</span>
          <span className="gx-tile-sub">logged a workout in the last 7 days</span>
        </button>
        <button type="button" className="gx-tile gx-tile-blue" onClick={() => onOpenMembers('active')}>
          <span className="gx-tile-label">Workouts this week</span>
          <span className="gx-big">{workoutsWeek}</span>
          <span className="gx-tile-sub">across all members</span>
        </button>
      </div>

      {live && (
        <div className="gx-grid2 even">
          <section className="gx-card gx-live">
            <div className="gx-row"><span className="gx-pill green">● Live in the gym</span><span className="gx-sub">{busyLabel(live.length, capacity)}</span></div>
            <div className="gx-big dark">{live.length} <small>of {capacity} spots</small></div>
            <div className="gx-meter" role="img" aria-label={`${live.length} of ${capacity} spots in use`}><i style={{ width: `${Math.min(100, (live.length / capacity) * 100)}%` }} /></div>
            <div className="gx-form-inline">
              <select className="gx-select wide" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Member to check in">
                <option value="">Check someone in…</option>
                {[...clients].sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !live.some((l) => l.member_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="gx-btn gx-btn-dark" disabled={!pick || ciBusy} onClick={() => checkIn(pick, false)}>+ Check in</button>
            </div>
            {ciError && <p className="gx-err" role="alert">{ciError}</p>}
            <div className="gx-inside">
              {live.length === 0 && <p className="gx-sub">Nobody is checked in right now.</p>}
              {live.map((l) => (
                <span key={l.id} className="gx-insider">{names[l.member_id] || 'Member'}<button type="button" aria-label={`Check out ${names[l.member_id] || 'member'}`} disabled={ciBusy} onClick={() => checkIn(l.member_id, true)}>Check out</button></span>
              ))}
            </div>
          </section>
          <section className="gx-card">
            <h2 className="gx-h2">Today so far</h2>
            <div className="gx-today">
              <div className="blue"><b>{checkinsToday(biz.checkins, todayStr)}</b><span>Check-ins</span></div>
              <div className="amber"><b>{rupees(collectedToday)}</b><span>Collected</span></div>
              <div className="green"><b>{joinsToday}</b><span>New joins</span></div>
              <div className="red"><b>{trialsToday}</b><span>Trials booked</span></div>
            </div>
            {lead && <p className="gx-sub">{lead.joined} of {lead.goal} new members this month</p>}
          </section>
        </div>
      )}

      <section className="gx-card">
        <h2 className="gx-h2">Today’s game plan</h2>
        <p className="gx-sub">{plan.length ? `${plan.length} quick win${plan.length === 1 ? '' : 's'} waiting for you` : 'Nothing needs you right now'}</p>
        {plan.length > 0 && (
          <div className="gx-grid3">
            {plan.map((p) => (
              <div key={p.filter} className={`gx-plan ${p.tone}`}>
                <div className="gx-plan-top">
                  <span className="gx-plan-n">{p.n}</span>
                  <div><div className="gx-plan-title">{p.title}</div><div className="gx-sub">{p.sub}</div></div>
                </div>
                <button type="button" className="gx-btn gx-btn-dark gx-btn-full" onClick={() => onOpenMembers(p.filter)}>{p.cta}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="gx-grid2">
        <section className="gx-card">
          <h2 className="gx-h2">Workouts per week</h2>
          <p className="gx-sub">Each bar is one week of members’ logged workouts.</p>
          {weekly.length > 0 && today && (
            <WeeklyBars
              values={weekly.map((w) => w.workouts)} secondary={weekly.map((w) => w.members)}
              labels={weekLabels(today, weekly.length)} ranges={weekRanges(today, weekly.length)}
              title="Workouts per week"
            />
          )}
        </section>
        <section className="gx-card">
          <h2 className="gx-h2">Trainer leaderboard</h2>
          <p className="gx-sub">Ranked by members still training</p>
          {ranked.length === 0 && <p className="gx-sub">Trainers appear once they have members.</p>}
          <div className="gx-list">
            {ranked.map((t, i) => (
              <div key={t.id} className={`gx-rank r${i + 1}`}>
                <span className="gx-medal">{i + 1}</span>
                <div>
                  <div className="gx-name">{t.name}</div>
                  <div className="gx-sub">{t.stats.activePct}% still training · {t.clientCount} member{t.clientCount === 1 ? '' : 's'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {money && (
        <section className="gx-card">
          <h2 className="gx-h2">Money collected</h2>
          <p className="gx-sub">{rupees(money.thisMonth)} this month · payments you recorded, by month</p>
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
        <h2 className="gx-h2">Member health</h2>
        <p className="gx-sub">Based on the last 2 weeks of training compared with the 4 before.</p>
        <HealthBar
          health={insights?.health || {}}
          onSelect={(k) => onOpenMembers(['quiet', 'inactive'].includes(k) ? 'stopped' : ['thriving', 'steady'].includes(k) ? 'active' : k)}
        />
      </section>
    </div>
  );
}
