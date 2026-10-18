import { greeting, rankTrainers } from './gymView';
import { HealthBar, WeeklyBars } from '../components/OwnerCharts';
import { weekLabels, weekRanges } from '../utils/ownerView';

// Overview from what the app really knows today: training activity. Money,
// check-ins and leads fill the same grid as their stages land.
export default function GymOverview({ data, owner, onOpenMembers }) {
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

  const plan = [
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
