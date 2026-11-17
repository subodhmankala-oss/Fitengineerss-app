import { useState } from 'react';
import useClientBreaks from '../hooks/useClientBreaks';
import {
  BREAK_REASONS, activeBreak, recentlyEndedBreak, daysBetween, formatBreakDate, lastWorkoutDateOf,
} from '../utils/clientBreaks';
import { getLocalDateString } from '../utils/dateUtils';
import { BreakReasonIcon } from './ClientBreakIcons';
import ClientBreakSheet from './ClientBreakSheet';
import './ClientBreak.css';

const Tick = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);

// Home: while a break runs, a calm card saying when they're back and what
// it keeps safe (level, no reminders, coach told), with Extend and "I'm back
// early". For a few days after it ends — until they log a workout — a
// "Welcome back" card instead. Renders nothing otherwise.
export default function ClientBreakCard({ logs, userName = '', coachName = '', hasCoach = false, onNavigateToWorkouts }) {
  const { ownBreaks: breaks, updateBreak, endBreak } = useClientBreaks();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const today = getLocalDateString();
  const running = activeBreak(breaks, today);

  if (running) {
    const meta = BREAK_REASONS[running.reason] || BREAK_REASONS.other;
    const total = Math.max(1, daysBetween(running.startDate, running.backDate));
    const day = Math.min(total, daysBetween(running.startDate, today) + 1);
    const left = daysBetween(today, running.backDate);
    const end = async () => {
      setEnding(true);
      setError('');
      try { await endBreak(running.id); } catch (e) { setError(e.message || 'Could not end your break.'); }
      setEnding(false);
    };
    return (
      <div className="cb-card" style={{ '--c': meta.color, '--c-rgb': meta.rgb }}>
        <div className="cb-card-head">
          <BreakReasonIcon reason={running.reason} size={22} />
          <div>
            <div className="cb-card-title">{meta.status}</div>
            <div className="cb-card-sub">Back {formatBreakDate(running.backDate)} · {left} day{left === 1 ? '' : 's'} left</div>
          </div>
        </div>
        <div className="cb-progress" aria-hidden="true"><i style={{ width: `${Math.round((day / total) * 100)}%` }} /></div>
        <div className="cb-card-day">Day {day} of {total}</div>
        <ul className="cb-kept">
          <li><Tick />Your Training Level is on hold, no drop</li>
          <li><Tick />No workout reminders</li>
          {hasCoach && <li><Tick />{coachName ? `Coach ${coachName.split(/\s+/)[0]} knows` : 'Your coach knows'}</li>}
        </ul>
        {error && <div className="cb-error" role="alert">{error}</div>}
        <div className="cb-card-actions">
          <button type="button" className="cb-card-btn" onClick={() => setSheetOpen(true)}>Extend</button>
          <button type="button" className="cb-card-btn accent" disabled={ending} onClick={end}>
            {ending ? 'Ending…' : "I'm back early"}
          </button>
        </div>
        {sheetOpen && (
          <ClientBreakSheet existing={running} hasCoach={hasCoach} onSave={updateBreak} onEnd={endBreak} onClose={() => setSheetOpen(false)} />
        )}
      </div>
    );
  }

  const ended = recentlyEndedBreak(breaks, today, lastWorkoutDateOf(logs));
  if (!ended) return null;
  const first = (userName || '').trim().split(/\s+/)[0];
  return (
    <div className="cb-welcome">
      <div className="cb-welcome-title">Welcome back{first ? `, ${first}` : ''}</div>
      <div className="cb-welcome-sub">Ease back in today. Your first workout can be a light one.</div>
      <div className="cb-welcome-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18l5-6 4 3 7-9" /></svg>
        <span>Your Training Level was held during your break, no points lost</span>
      </div>
      <div className="cb-welcome-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>Go easy: 2 sets of each exercise is plenty today</span>
      </div>
      {onNavigateToWorkouts && (
        <button type="button" className="cb-welcome-go" onClick={onNavigateToWorkouts}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
          Start workout
        </button>
      )}
    </div>
  );
}
