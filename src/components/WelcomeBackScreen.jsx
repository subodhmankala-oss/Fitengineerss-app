import React, { useMemo, useState } from 'react';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';
import { getLocalDateString } from '../utils/dateUtils';
import './WelcomeBackScreen.css';

// Re-engagement "Welcome Back" screen — shown on the client Home tab in place
// of the normal Weekly/Daily/Monthly/Muscles view ONLY when the client has no
// available workout plan to start (see `WorkoutProgressDashboard`'s
// `clientPlans.length === 0` gate) but DOES have real prior progress
// (logs.length > 0 — a true first-timer still gets the existing "Start Your
// Fitness Journey" empty state instead, this screen is for someone coming
// BACK, not someone who's never trained).
//
// Deliberately warm/low-pressure per product brief: no "you were inactive",
// no missed-day counts, no nudge to train right now — just real existing
// data (sessions/progress/muscle balance) reframed as a welcome, plus two
// low-effort ways to re-engage (check in, or look at progress). Every number
// shown here is read from data the parent already computed/fetched — this
// component performs no session/workout/plan logic of its own.
const MOODS = [
  { key: 'great', emoji: '😊', label: 'Great' },
  { key: 'okay', emoji: '🙂', label: 'Okay' },
  { key: 'low', emoji: '😴', label: 'Low energy' },
  { key: 'rough', emoji: '😣', label: 'Not great' },
];

// Smallest possible check-in: no check-in feature exists anywhere else in the
// app (confirmed by inspection — no table, no component), so per spec this
// stays a purely local, single-tap mood log rather than a new backend system.
// One entry per calendar day, keyed to this client's id so it doesn't leak
// across accounts sharing a device.
function CheckInCard({ userId, onCheckIn }) {
  const todayKey = getLocalDateString();
  const storageKey = `wb_checkin_${userId || 'anon'}_${todayKey}`;

  // Lazy-read from localStorage on first render — a plain synchronous read,
  // not an external subscription, so it belongs in the initializer rather
  // than an effect (avoids an extra render pass just to hydrate this).
  const [saved, setSaved] = useState(() => { // { mood, note } | null
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    if (!mood) return;
    const entry = { mood, note: note.trim() };
    try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* storage full/unavailable — still update UI */ }
    setSaved(entry);
    setEditing(false);
    onCheckIn?.();
  };

  const moodMeta = (key) => MOODS.find(m => m.key === key);

  return (
    <div className="wb-card wb-checkin-card">
      <div className="wb-card-head">
        <span className="wb-card-icon">😊</span>
        <div>
          <h3>Check in</h3>
          <p className="wb-card-sub">Tell us how you're feeling</p>
        </div>
      </div>

      {saved && !editing ? (
        <div className="wb-checkin-done">
          <span className="wb-checkin-done-emoji">{moodMeta(saved.mood)?.emoji}</span>
          <div className="wb-checkin-done-text">
            <div>Thanks for checking in — logged as <strong>{moodMeta(saved.mood)?.label}</strong> today.</div>
            {saved.note && <div className="wb-checkin-note-preview">"{saved.note}"</div>}
          </div>
          <button type="button" className="wb-link-btn" onClick={() => { setMood(saved.mood); setNote(saved.note || ''); setEditing(true); }}>
            Edit
          </button>
        </div>
      ) : (
        <>
          <div className="wb-mood-row">
            {MOODS.map(m => (
              <button
                key={m.key}
                type="button"
                className={`wb-mood-btn ${mood === m.key ? 'active' : ''}`}
                onClick={() => setMood(m.key)}
              >
                <span className="wb-mood-emoji">{m.emoji}</span>
                <span className="wb-mood-label">{m.label}</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            className="wb-note-input"
            placeholder="Anything you want to note? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
          />
          <button type="button" className="wb-btn-primary" disabled={!mood} onClick={handleSave}>
            Check in →
          </button>
        </>
      )}
    </div>
  );
}

export default function WelcomeBackScreen({
  userId,
  userName,
  logs,
  weekDays,
  isLinkedToCoach,
  sessionsTotal,
  totalSessionsDone,
  onCheckIn,
  onShowProgress,
}) {
  const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';

  // All-time distinct workout days — the one progress signal every client has
  // regardless of whether they're coach-connected or have a configured
  // program length. Reuses the same `logs` the parent already fetched.
  const totalWorkoutsAllTime = useMemo(
    () => new Set((logs || []).map(l => l.log_date)).size,
    [logs]
  );

  // Muscle Balance teaser — same source of truth as the Muscles tab
  // (WeeklyMuscleAnalytics), just summarized to two counts. Only rendered
  // when this week actually has classifiable data, so nothing is fabricated.
  const muscleTeaser = useMemo(() => {
    if (!weekDays || weekDays.length < 7) return null;
    const stats = getWeeklyMuscleStats(logs || [], weekDays[0], weekDays[6]);
    const counts = {};
    stats.forEach(s => { counts[s.status.key] = (counts[s.status.key] || 0) + 1; });
    const anyTrained = stats.some(s => s.sets > 0);
    if (!anyTrained) return null;
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([key, count]) => {
        const meta = stats.find(s => s.status.key === key)?.status;
        return `${count} ${meta?.label || key}`;
      });
    return ranked.join(' · ');
  }, [logs, weekDays]);

  const hasConfiguredProgram = isLinkedToCoach && Number.isFinite(sessionsTotal) && sessionsTotal > 0;
  const percentComplete = hasConfiguredProgram
    ? Math.min(100, Math.round((totalSessionsDone / sessionsTotal) * 100))
    : null;
  const programComplete = hasConfiguredProgram && totalSessionsDone >= sessionsTotal;

  return (
    <div className="wb-root animate-slide-up">
      {/* ── Hero ── */}
      <div className="wb-hero">
        <div className="wb-hero-eyebrow">👀 Look who's back!</div>
        <h1 className="wb-hero-title">👋 Welcome back, {firstName}</h1>
        <p className="wb-hero-sub">Your progress didn't disappear while you were away. 😄</p>
      </div>

      {/* ── Journey / progress section — real data only, never fabricated ── */}
      <div className="wb-card wb-journey-card">
        {programComplete ? (
          <>
            <span className="wb-eyebrow">🎉 Program complete!</span>
            <p className="wb-journey-copy">You made it all the way through — {totalSessionsDone} of {sessionsTotal} sessions done. That's real work.</p>
          </>
        ) : hasConfiguredProgram ? (
          <>
            <span className="wb-eyebrow">🎯 Your journey</span>
            <div className="wb-journey-stat">
              <span className="wb-journey-fraction">{totalSessionsDone} / {sessionsTotal}</span>
              <span className="wb-journey-label">sessions completed</span>
            </div>
            <div className="wb-progress-track">
              <div className="wb-progress-fill" style={{ width: `${percentComplete}%` }} />
            </div>
            <span className="wb-progress-pct">{percentComplete}% complete</span>
            <p className="wb-journey-copy">You've already put in the work. Let's keep the momentum going.</p>
          </>
        ) : totalWorkoutsAllTime > 0 ? (
          <>
            <span className="wb-eyebrow">🎯 Your journey</span>
            <div className="wb-journey-stat">
              <span className="wb-journey-fraction">{totalWorkoutsAllTime}</span>
              <span className="wb-journey-label">{totalWorkoutsAllTime === 1 ? 'workout logged' : 'workouts logged'}</span>
            </div>
            <p className="wb-journey-copy">
              {isLinkedToCoach
                ? "Your coach hasn't set a program length yet, but every session you've logged is still right here."
                : "You've already put in the work. Let's keep the momentum going."}
            </p>
          </>
        ) : (
          <p className="wb-journey-copy">Your account's ready whenever you are — no pressure, no countdown.</p>
        )}
      </div>

      <p className="wb-plan-prompt">Okay… what's the plan? 😄</p>

      {/* ── Low-pressure actions ── */}
      <div className="wb-actions">
        <CheckInCard userId={userId} onCheckIn={onCheckIn} />

        <button type="button" className="wb-card wb-progress-card" onClick={onShowProgress}>
          <div className="wb-card-head">
            <span className="wb-card-icon">📊</span>
            <div>
              <h3>Show my progress</h3>
              <p className="wb-card-sub">
                {muscleTeaser ? 'See your sessions, strength & muscle balance' : 'See how far you\'ve come'}
              </p>
            </div>
          </div>
          {(hasConfiguredProgram || muscleTeaser) && (
            <div className="wb-progress-teaser">
              {hasConfiguredProgram && <span>{totalSessionsDone}/{sessionsTotal} sessions</span>}
              {muscleTeaser && <span>Muscle Balance: {muscleTeaser}</span>}
            </div>
          )}
          <span className="wb-progress-cta">View progress →</span>
        </button>
      </div>
    </div>
  );
}
