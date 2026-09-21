import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import {
  formatMonthKey, shiftMonthKey, formatVolume, formatDurationShort, formatDelta,
  consistencyTier, volumeEquivalent, reportHeadline, computeDeltas
} from '../utils/monthlyProgress';
import './MonthlyReportCard.css';

// Client-side rendering of a coach's monthly progress report (see
// sql/supabase_monthly_progress_reports.sql). Everything shown comes from the
// stored `stats` snapshot — nothing is recomputed here, so the card always
// matches what the coach reviewed and sent.
//
// Three pieces, all driven by the same snapshot:
//   MonthlyReportStats  — headline, tiles, trend bars, top lifts (also used
//                         by the coach's composer as the live preview — same
//                         layout on both sides, no separate breakdown table)
//   MonthlyReportCard   — the full card with badge, coach message, actions
//   MonthlyReportsList  — accordion history on the Monthly tab

const DeltaTag = ({ delta, pct, suffix, size = 'sm' }) => {
  const d = formatDelta(delta, { pct, suffix });
  if (!d.text) return null;
  return <span className={`mrc-delta mrc-delta--${d.dir} mrc-delta--${size}`}>{d.text}</span>;
};

// Three-bar mini chart (two months back / last month / this month) for one
// metric. Heights are relative to the tallest of the three; an empty month
// gets a stub bar so the axis still reads as three slots. Each bar is a
// button: tapping selects that month (shared across both charts) and the
// headline, tiles, fact line and top lifts above all switch to it.
function TrendBars({ label, cols, values, fmt, selected, onSelect }) {
  const max = Math.max(...values.map(v => v || 0), 0);
  return (
    <div className="mrc-trend">
      <div className="mrc-trend-label">{label}</div>
      <div className="mrc-trend-bars">
        {cols.map((m, i) => {
          const v = values[i];
          const has = v != null;
          const h = has && max > 0 ? Math.max(6, Math.round((v / max) * 100)) : 4;
          const isSel = selected === i;
          return (
            <button
              type="button"
              key={m}
              className={`mrc-bar-col ${i === 2 ? 'mrc-bar-col--cur' : ''} ${isSel ? 'mrc-bar-col--sel' : ''}`}
              onClick={() => onSelect(i)}
              aria-pressed={isSel}
              aria-label={`${formatMonthKey(m)}: ${has ? fmt(v) : 'no data'}`}
            >
              <span className="mrc-bar-val">{has ? fmt(v) : '—'}</span>
              <span className="mrc-bar-track"><span className={`mrc-bar ${has ? '' : 'mrc-bar--empty'}`} style={{ height: `${h}%` }} /></span>
              <span className="mrc-bar-m">{formatMonthKey(m, { withYear: false })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * @param {object} stats - buildMonthlyReport() output
 * @param {boolean} compact - client phone layout (unused now that both
 *   sides share the same layout; kept for the compact card styling hook).
 */
export function MonthlyReportStats({ stats, compact = false }) {
  // Which of the three months the cards above the charts are showing:
  // 2 = the reported month (default), 1 = last month, 0 = two months back.
  const [selected, setSelected] = useState(2);
  if (!stats || !stats.current) return null;
  const month = stats.month || stats.current.month;
  const cols = [shiftMonthKey(month, -2), shiftMonthKey(month, -1), month];
  const monthAt = (i) => (i === 0 ? stats.prevPrevious : i === 1 ? stats.previous : stats.current);
  const series = (key) => cols.map((_, i) => {
    const m = monthAt(i);
    return m && m.hasData ? m[key] : null;
  });

  // The month on display. Its deltas are vs the month before IT — the
  // stored deltas only cover reported-vs-previous, so the middle column is
  // recomputed and the oldest column has nothing to compare against.
  const c = monthAt(selected) || { hasData: false, sessions: 0, totalCalories: 0, totalDurationSec: 0, prCount: 0, totalVolumeKg: 0, sessionsPerWeek: 0, topLifts: [] };
  const d = selected === 2 ? (stats.deltas || {})
    : selected === 1 ? computeDeltas(stats.previous, stats.prevPrevious)
    : {};
  const viewMonth = cols[selected];
  const isReported = selected === 2;
  const tier = consistencyTier(c.sessionsPerWeek);
  const equiv = volumeEquivalent(c.totalVolumeKg);

  return (
    <div className={`mrc-stats ${compact ? 'mrc-stats--compact' : ''}`}>
      <div className="mrc-headline">
        <span className="mrc-headline-text">{reportHeadline({ current: c, deltas: d })}</span>
        <span className={`mrc-tier mrc-tier--${tier.tone}`}>{tier.emoji} {tier.label}</span>
      </div>

      {!isReported && (
        <div className="mrc-viewing">
          Showing <strong>{formatMonthKey(viewMonth)}</strong>
          <button type="button" className="mrc-viewing-back" onClick={() => setSelected(2)}>Back to {formatMonthKey(month, { withYear: false })}</button>
        </div>
      )}

      <div className="mrc-tiles">
        <div className="mrc-tile mrc-tile--blue"><span className="mrc-tile-l">🏋️ Sessions</span><span className="mrc-tile-v">{c.sessions} <DeltaTag delta={d.sessions} /></span></div>
        <div className="mrc-tile mrc-tile--emerald"><span className="mrc-tile-l">🔥 Calories</span><span className="mrc-tile-v">{Math.round(c.totalCalories || 0).toLocaleString('en-IN')} <small>kcal</small> <DeltaTag delta={d.totalCalories} pct /></span></div>
        <div className="mrc-tile mrc-tile--amber"><span className="mrc-tile-l">⏱ Training time</span><span className="mrc-tile-v">{formatDurationShort(c.totalDurationSec)} <DeltaTag delta={d.totalDurationSec} pct /></span></div>
        <div className="mrc-tile mrc-tile--violet"><span className="mrc-tile-l">🏆 PRs</span><span className="mrc-tile-v">{c.prCount} <DeltaTag delta={d.prCount} /></span></div>
      </div>

      {equiv && (
        <div className="mrc-fact">💡 {formatVolume(c.totalVolumeKg)} lifted in {formatMonthKey(viewMonth, { withYear: false })} — {equiv}</div>
      )}

      <div className="mrc-trends">
        <TrendBars label="Sessions" cols={cols} values={series('sessions')} fmt={(v) => v} selected={selected} onSelect={setSelected} />
        <TrendBars label="Volume" cols={cols} values={series('totalVolumeKg')} fmt={formatVolume} selected={selected} onSelect={setSelected} />
      </div>
      <div className="mrc-trend-hint">Tap a month to view it above</div>

      {c.topLifts && c.topLifts.length > 0 && (
        <>
          <div className="mrc-section-label">Top lifts in {formatMonthKey(viewMonth, { withYear: false })}</div>
          <div className="mrc-chips">
            {c.topLifts.map((t, i) => (
              <span key={t.exercise} className="mrc-chip">
                <span aria-hidden="true">{MEDALS[i]}</span> {t.exercise} <strong>{t.bestWeightKg} kg</strong> × {t.bestReps}
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
            <span className="mrc-message-avatar" aria-hidden="true">{(coachLabel || 'C').trim().charAt(0).toUpperCase()}</span>
            <div className="mrc-message-bubble">
              <div className="mrc-message-from">{coachLabel}</div>
              <div>{report.coachMessage}</div>
            </div>
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
          ? [`${c.sessions} session${c.sessions === 1 ? '' : 's'}`, `${formatVolume(c.totalVolumeKg)} lifted`, `${c.prCount} PR${c.prCount === 1 ? '' : 's'}`].join(' · ')
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
