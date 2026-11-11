import { useEffect, useState } from 'react';
import { LEAD_SOURCES, monthName, rupees, trendLabel } from './gymView';

const sourceLabel = (k) => LEAD_SOURCES.find((s) => s.key === k)?.label || k;
const retained = (r) => (r ? `${r.pct}% (${r.kept} of ${r.of})` : '—');

function Trend({ row }) {
  const text = trendLabel(row.change, row.lastMonth);
  if (!text) return <span className="gx-sub">—</span>;
  const tone = row.change > 0 ? 'green' : row.change < 0 ? 'amber' : '';
  return <span className={`gx-pill ${tone}`}>{text}</span>;
}

function RankList({ rows, unit, empty }) {
  if (!rows.length) return <p className="gx-sub">{empty}</p>;
  return (
    <div className="gx-list">
      {rows.map((r) => (
        <div key={r.name} className="gx-rank">
          <div className="gx-rank-main">
            <div className="gx-name">{r.name}</div>
            <div className="gx-sub">{r.count} {unit} this month · {r.lastMonth} same days last month</div>
          </div>
          <Trend row={r} />
        </div>
      ))}
    </div>
  );
}

// Reports that need the server's aggregation (api/_ownerInsights.js):
// exercises and muscles, month by month, and where enquiries come from.
// Aggregates only — nothing here names a member.
export default function GymReportsMore({ service }) {
  const [state, setState] = useState({ loading: !!service?.getOwnerReports, report: null, error: '' });

  useEffect(() => {
    if (!service?.getOwnerReports) return undefined;
    let live = true;
    service.getOwnerReports().then((r) => {
      if (!live) return;
      setState(r?.success ? { loading: false, report: r, error: '' } : { loading: false, report: null, error: r?.error || 'Could not load these reports.' });
    });
    return () => { live = false; };
  }, [service]);

  if (state.loading) return <section className="gx-card"><p className="gx-sub">Loading more reports…</p></section>;
  if (state.error) return <section className="gx-card"><p className="gx-sub">{state.error}</p></section>;
  const r = state.report;
  if (!r) return null;

  return (
    <>
      <div className="gx-grid2 even">
        <section className="gx-card">
          <h2 className="gx-h2">Most-used exercises</h2>
          <p className="gx-sub">This month so far, across all members, against the same days last month.</p>
          <RankList rows={r.exercises} unit="sessions" empty="Exercises appear once members log workouts this month." />
        </section>
        <section className="gx-card">
          <h2 className="gx-h2">Muscle groups trained</h2>
          <p className="gx-sub">Sets this month so far, against the same days last month.</p>
          <RankList rows={r.muscles} unit="sets" empty="Muscle groups appear once members log workouts this month." />
        </section>
      </div>

      <section className="gx-card">
        <h2 className="gx-h2">Month by month</h2>
        <p className="gx-sub">Money collected, new members, and how many were still training 30 and 60 days after joining.</p>
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead><tr><th>Month</th><th>Collected</th><th>New members</th><th>Training at 30 days</th><th>Training at 60 days</th></tr></thead>
            <tbody>
              {[...r.months].reverse().map((m) => (
                <tr key={m.key}>
                  <td>{monthName(m.key)}</td>
                  <td>{rupees(m.collected)}</td>
                  <td>{m.joined}</td>
                  <td>{retained(m.retention[30])}</td>
                  <td>{retained(m.retention[60])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="gx-sub">A dash means too early to tell, or before workouts were tracked here. “Still training” means at least one workout in the 2 weeks starting that day.</p>
      </section>

      <section className="gx-card">
        <h2 className="gx-h2">Where new members come from</h2>
        <p className="gx-sub">Enquiries from the last 90 days: how many booked a trial and how many joined.</p>
        {r.leads === null && <p className="gx-sub">Leads are not set up yet.</p>}
        {r.leads && r.leads.length === 0 && <p className="gx-sub">No enquiries in the last 90 days.</p>}
        {r.leads && r.leads.length > 0 && (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead><tr><th>Source</th><th>Enquiries</th><th>Trial</th><th>Joined</th><th>Enquiry to joined</th></tr></thead>
              <tbody>
                {r.leads.map((l) => (
                  <tr key={l.source}><td>{sourceLabel(l.source)}</td><td>{l.enquiries}</td><td>{l.trials}</td><td>{l.joined}</td><td>{l.pct === null ? '—' : `${l.pct}%`}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
