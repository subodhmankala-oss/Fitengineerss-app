import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { formatMonthKey, shiftMonthKey, formatVolume, formatDurationShort, formatDelta } from '../utils/monthlyProgress';
import './MonthlyReportCard.css';

// Client-side rendering of a coach's monthly progress report (see
// sql/supabase_monthly_progress_reports.sql). Everything shown comes from the
// stored `stats` snapshot — nothing is recomputed here, so the card always
// matches what the coach reviewed and sent.
//
// Three pieces, all driven by the same snapshot:
//   MonthlyReportStats  — tiles + 3-column table + top lifts (also used by
//                         the coach's composer as the live preview)
//   MonthlyReportCard   — the full card with badge, coach message, actions
//   MonthlyReportsList  — accordion history on the Monthly tab

const num = (v) => (v == null ? '—' : v);

const DeltaTag = ({ delta, pct, suffix, size = 'sm' }) => {
  const d = formatDelta(delta, { pct, suffix });
  if (!d.text) return null;
  return <span className={`mrc-delta mrc-delta--${d.dir} mrc-delta--${size}`}>{d.text}</span>;
};

/**
 * @param {object} stats - buildMonthlyReport() output
 * @param {boolean} compact - client phone layout (4 tiles first, table second)
 */
export function MonthlyReportStats({ stats, compact = false }) {
  if (!stats || !stats.current) return null;
  const { current: c, previous: p, prevPrevious: pp, deltas: d = {}, liftRows = [] } = stats;
  const month = stats.month || c.month;
  const cols = [shiftMonthKey(month, -2), shiftMonthKey(month, -1), month];
  const cell = (m, key, fmt = num) => (m && m.hasData ? fmt(m[key]) : '—');

  const rows = [
    { label: 'Sessions', key: 'sessions' },
    { label: 'Sets logged', key: 'totalSets' },
    { label: 'Total volume', key: 'totalVolumeKg', fmt: formatVolume, pct: true },
    { label: 'Training time', key: 'totalDurationSec', fmt: formatDurationShort, pct: true },
    { label: 'Sessions / week', key: 'sessionsPerWeek' },
    { label: 'Personal records', key: 'prCount' }
  ];

  return (
    <div className={`mrc-stats ${compact ? 'mrc-stats--compact' : ''}`}>
      {compact && (
        <div className="mrc-tiles">
          <div className="mrc-tile"><span className="mrc-tile-l">Sessions</span><span className="mrc-tile-v">{c.sessions} <DeltaTag delta={d.sessions} /></span></div>
          <div className="mrc-tile"><span className="mrc-tile-l">Volume</span><span className="mrc-tile-v">{formatVolume(c.totalVolumeKg)} <DeltaTag delta={d.totalVolumeKg} pct /></span></div>
          <div className="mrc-tile"><span className="mrc-tile-l">Training time</span><span className="mrc-tile-v">{formatDurationShort(c.totalDurationSec)} <DeltaTag delta={d.totalDurationSec} pct /></span></div>
          <div className="mrc-tile"><span className="mrc-tile-l">PRs</span><span className="mrc-tile-v">{c.prCount} <DeltaTag delta={d.prCount} /></span></div>
        </div>
      )}

      <table className="mrc-table">
        <thead>
          <tr>
            <th></th>
            {cols.map((m, i) => (
              <th key={m} className={i === 2 ? 'mrc-col-cur' : ''}>{formatMonthKey(m, { withYear: false })}</th>
            ))}
            {!compact && <th className="mrc-col-delta">vs {formatMonthKey(cols[1], { withYear: false })}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{cell(pp, r.key, r.fmt)}</td>
              <td>{cell(p, r.key, r.fmt)}</td>
              <td className="mrc-col-cur">{cell(c, r.key, r.fmt)}</td>
              {!compact && <td className="mrc-col-delta"><DeltaTag delta={d[r.key]} pct={r.pct} /></td>}
            </tr>
          ))}
          {liftRows.map(l => (
            <tr key={`lift-${l.exercise}`} className="mrc-lift-row">
              <td>{l.exercise} best</td>
              <td>{num(l.prevPrevious)}</td>
              <td>{num(l.previous)}</td>
              <td className="mrc-col-cur">{l.current} kg</td>
              {!compact && (
                <td className="mrc-col-delta">
                  <DeltaTag delta={l.previous != null ? { abs: Math.round((l.current - l.previous) * 10) / 10 } : null} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!compact && c.topLifts && c.topLifts.length > 0 && (
        <>
          <div className="mrc-section-label">Top lifts in {formatMonthKey(month, { withYear: false })}</div>
          <div className="mrc-chips">
            {c.topLifts.map(t => (
              <span key={t.exercise} className="mrc-chip">
                {t.exercise} {t.bestWeightKg} kg × {t.bestReps}
                {t.prevBestWeightKg != null && t.bestWeightKg !== t.prevBestWeightKg && (
                  <DeltaTag delta={{ abs: Math.round((t.bestWeightKg - t.prevBestWeightKg) * 10) / 10 }} />
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const formatSentAt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The full report card.
 * @param {object} report - mapMonthlyReportRow() shape {id, month, stats, coachMessage, sentAt, readAt}
 * @param {string} coachName
 * @param {boolean} isNew - shows the "New from …" badge + "Got it" (home screen)
 * @param {function} onDismiss - "Got it" handler (home screen only)
 */
export function MonthlyReportCard({ report, coachName, isNew = false, onDismiss }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  if (!report || !report.stats) return null;

  const monthLabel = formatMonthKey(report.month);
  const coachLabel = coachName || 'your coach';

  // Same share flow as WorkoutShareCard: native share sheet with the PNG on
  // mobile, plain download everywhere else.
  const handleShare = async () => {
    if (busy || !cardRef.current) return;
    setBusy(true);
    setShareMsg('');
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0b0f19', scale: 2, useCORS: true });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], `fitengineers-${report.month}-report.png`, { type: 'image/png' });
      const text = `My ${monthLabel} training report — tracked with Fitengineers.`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${monthLabel} report`, text });
      } else {
        downloadBlob(blob, file.name);
        setShareMsg('Image saved to your downloads.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        setShareMsg('Could not share. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`mrc-card ${isNew ? 'mrc-card--new' : ''}`}>
      <div ref={cardRef} className="mrc-capture">
        <div className="mrc-head">
          {isNew ? (
            <span className="mrc-badge">New from {coachLabel}</span>
          ) : (
            <span className="mrc-badge mrc-badge--muted">From {coachLabel}</span>
          )}
          {isNew && onDismiss && (
            <button type="button" className="mrc-close" onClick={onDismiss} aria-label="Dismiss" title="Got it">✕</button>
          )}
        </div>
        <div className="mrc-title">Your {monthLabel} report</div>

        <MonthlyReportStats stats={report.stats} compact />

        {report.coachMessage && (
          <div className="mrc-message">
            <span className="mrc-message-icon" aria-hidden="true">💬</span>
            <span>{report.coachMessage}</span>
          </div>
        )}
        <div className="mrc-sent">Sent by {coachLabel}{report.sentAt ? ` · ${formatSentAt(report.sentAt)}` : ''}</div>
      </div>

      <div className="mrc-actions">
        {isNew && onDismiss && (
          <button type="button" className="mrc-btn" onClick={onDismiss}>Got it</button>
        )}
        <button type="button" className="mrc-btn" onClick={handleShare} disabled={busy}>
          {busy ? 'Preparing…' : '↗ Share'}
        </button>
      </div>
      {shareMsg && <div className="mrc-share-msg">{shareMsg}</div>}
    </div>
  );
}

/**
 * Accordion history list — one row per month, newest first; tapping a row
 * opens that month's full card (any other open row closes). Purely a view:
 * nothing is written on open/close.
 */
export function MonthlyReportsList({ reports, coachName }) {
  const [openId, setOpenId] = useState(null);
  if (!reports || reports.length === 0) {
    return (
      <div className="mrc-empty">
        No monthly reports yet. Your coach can send one at the end of each month.
      </div>
    );
  }
  return (
    <div className="mrc-list">
      {reports.map(r => {
        const c = r.stats && r.stats.current;
        const d = r.stats && r.stats.deltas;
        const open = openId === r.id;
        const summary = c
          ? [`${c.sessions} session${c.sessions === 1 ? '' : 's'}`, formatVolume(c.totalVolumeKg), `${c.prCount} PR${c.prCount === 1 ? '' : 's'}`].join(' · ')
          : '';
        return (
          <div key={r.id} className={`mrc-item ${open ? 'mrc-item--open' : ''}`}>
            <button type="button" className="mrc-row" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
              <span className="mrc-row-main">
                <span className="mrc-row-title">{formatMonthKey(r.month)}</span>
                <span className="mrc-row-sub">{summary}</span>
              </span>
              <span className="mrc-row-side">
                <DeltaTag delta={d && d.totalVolumeKg} pct />
                <span className="mrc-chev" aria-hidden="true">›</span>
              </span>
            </button>
            {open && (
              <div className="mrc-body">
                <MonthlyReportCard report={r} coachName={coachName} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MonthlyReportCard;
