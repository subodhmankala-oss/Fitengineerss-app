import React, { useEffect, useMemo, useState } from 'react';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import {
  buildMonthlyReport, defaultReportMonth, monthKeyOf, shiftMonthKey, formatMonthKey,
  formatVolume, suggestCoachMessage
} from '../utils/monthlyProgress';
import { MonthlyReportStats } from './MonthlyReportCard';
import './MonthlyReportComposer.css';

// Coach-side "Monthly report" panel, shown in the client detail view's
// History tab. The comparison is computed live from the client's already-
// loaded logs (rawWorkoutLogs in TrainerDashboard — no extra fetch); the
// coach can only edit the message, not the numbers. "Send report" stores the
// snapshot (databaseService.sendMonthlyReport, upsert per client+month) and
// fires a monthly_report push; the client sees it on their home screen
// (MonthlyReportCard) and forever after on their Monthly tab.
//
// clientId / coachId are users.id (same as coach_notes).
export default function MonthlyReportComposer({ clientId, clientName, coachId, logs }) {
  const [monthKey, setMonthKey] = useState(() => defaultReportMonth());
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sentReports, setSentReports] = useState({}); // { [monthKey]: sentAt }
  // Collapsed by default — same accordion row as the client's Monthly
  // reports list, so the History tab isn't dominated by the composer when
  // the coach just wants to scroll the session log.
  const [open, setOpen] = useState(false);

  const firstName = (clientName || '').trim().split(/\s+/)[0] || 'there';

  // Month options: the in-progress month (labelled "so far" so nobody reads
  // a half month as a full one) plus the 12 completed months before it.
  // Default stays the last completed month.
  const currentMonth = monthKeyOf(new Date());
  const monthOptions = useMemo(() => {
    return Array.from({ length: 13 }, (_, i) => shiftMonthKey(currentMonth, -i));
  }, [currentMonth]);

  const report = useMemo(() => buildMonthlyReport(logs || [], monthKey), [logs, monthKey]);

  // Pre-fill the message whenever the month (or its numbers) change, unless
  // the coach has already started typing their own.
  useEffect(() => {
    if (!touched) setMessage(suggestCoachMessage(report, firstName));
  }, [report, firstName, touched]);

  // Which months have already been sent, so the button can say "Re-send".
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    databaseService.getMonthlyReportsSentForClient(clientId).then(rows => {
      if (cancelled) return;
      const map = {};
      (rows || []).forEach(r => { map[r.month] = r.sentAt; });
      setSentReports(map);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  const alreadySentAt = sentReports[monthKey];

  const handleMonthChange = (e) => {
    setMonthKey(e.target.value);
    setTouched(false);
    setFeedback('');
  };

  const handleSend = async () => {
    if (sending || !clientId) return;
    setSending(true);
    setFeedback('');
    try {
      const res = await databaseService.sendMonthlyReport(clientId, coachId, monthKey, report, message);
      if (!res.success) {
        setFeedback(`⚠️ Couldn't send: ${res.error || 'unknown error'}`);
        return;
      }
      const c = report.current;
      const summary = c.hasData
        ? `${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${formatVolume(c.totalVolumeKg)} · ${c.prCount} PR${c.prCount === 1 ? '' : 's'}`
        : 'Your monthly progress report is ready';
      notifyEvent('monthly_report', { clientUserId: clientId, message: summary, workoutName: formatMonthKey(monthKey) });
      setSentReports(prev => ({ ...prev, [monthKey]: new Date().toISOString() }));
      setFeedback(`✅ ${formatMonthKey(monthKey)} report sent to ${firstName}.`);
    } finally {
      setSending(false);
    }
  };

  const sentLabel = alreadySentAt
    ? new Date(alreadySentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  const c = report.current;
  const rowSummary = c.hasData
    ? `${formatMonthKey(monthKey)} · ${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${formatVolume(c.totalVolumeKg)} lifted${sentLabel ? ` · sent ${sentLabel}` : ''}`
    : `${formatMonthKey(monthKey)} · no workouts logged${sentLabel ? ` · sent ${sentLabel}` : ''}`;

  return (
    <div className={`mrcomp-card ${open ? 'mrcomp-card--open' : ''}`}>
      <button type="button" className="mrcomp-row" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="mrcomp-row-main">
          <span className="mrcomp-title">📈 Monthly report</span>
          <span className="mrcomp-row-sub">{rowSummary}</span>
        </span>
        <span className="mrcomp-row-side">
          {!sentLabel && c.hasData && <span className="mrcomp-pill">Ready to send</span>}
          <span className="mrcomp-chev" aria-hidden="true">›</span>
        </span>
      </button>

      {open && (
      <div className="mrcomp-body">
      <div className="mrcomp-head">
        <span className="mrcomp-label" style={{ margin: 0 }}>Report month</span>
        <select className="mrcomp-month" value={monthKey} onChange={handleMonthChange} disabled={sending} aria-label="Report month">
          {monthOptions.map(m => (
            <option key={m} value={m}>{formatMonthKey(m)}{m === currentMonth ? ' (so far)' : ''}{sentReports[m] ? ' ✓' : ''}</option>
          ))}
        </select>
      </div>

      {!report.current.hasData && (
        <div className="mrcomp-empty">
          No logged workouts in {formatMonthKey(monthKey)}. You can still send a message.
        </div>
      )}

      <MonthlyReportStats stats={report} />

      <div className="mrcomp-label">Your message (editable)</div>
      <textarea
        className="coach-note-textarea"
        rows={3}
        value={message}
        disabled={sending}
        onChange={(e) => { setMessage(e.target.value); setTouched(true); if (feedback) setFeedback(''); }}
      />
      {touched && (
        <button type="button" className="mrcomp-reset" onClick={() => { setTouched(false); setFeedback(''); }} disabled={sending}>
          Reset to suggested text
        </button>
      )}

      <div className="mrcomp-actions">
        <span className="mrcomp-hint">
          {sentLabel
            ? `Sent ${sentLabel} — re-sending replaces it.`
            : `Numbers come from ${firstName}'s logged workouts.`}
        </span>
        {feedback && (
          <span className={`coach-note-feedback ${feedback.startsWith('✅') ? 'ok' : 'err'}`}>{feedback}</span>
        )}
        <button type="button" className="coach-note-send" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending…' : (alreadySentAt ? 'Re-send report' : 'Send report')}
        </button>
      </div>
      </div>
      )}
    </div>
  );
}
