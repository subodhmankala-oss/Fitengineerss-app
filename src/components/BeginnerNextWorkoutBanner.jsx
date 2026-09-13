import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { pickNextBeginnerProgram } from '../utils/beginnerGuidance';

// A client is still considered "new to training" for this nudge while
// they've logged fewer than this many total sessions. Deliberately simple
// and independent of the coaching "Training Level" tenure system (which
// tracks calendar weeks since a client's first session, for a different
// purpose — gating which difficulty tier a coach sees them at). This is
// just "have they logged enough workouts that they don't need a starter
// suggestion anymore" — a rough proxy, not tied to that bigger system.
const BEGINNER_SESSION_CAP = 12;

// Home-screen guidance for a client who's new to training: tells them
// exactly which Beginner Workout Library program to do, whether that's
// "you haven't started yet" or "you finished X, do Y next" — a plain
// round-robin through the Beginner programs (see beginnerGuidance.js).
// Renders nothing once the client has logged enough sessions, or if
// there's no Beginner library loaded/configured.
export default function BeginnerNextWorkoutBanner({ userId, logs, onNavigateToWorkouts }) {
  const [programs, setPrograms] = useState(null); // null = still loading

  useEffect(() => {
    let cancelled = false;
    databaseService.getGenericWorkoutsByLevel('beginner')
      .then(list => { if (!cancelled) setPrograms(list || []); })
      .catch(() => { if (!cancelled) setPrograms([]); });
    return () => { cancelled = true; };
  }, []);

  if (!programs || programs.length === 0) return null;

  // One entry per distinct logged date (most recent non-empty plan name
  // wins per date) — kept self-contained here rather than depending on the
  // parent's own groupLogsByDate shape.
  const sessionsByDate = new Map();
  (logs || []).forEach(log => {
    const date = log.log_date;
    if (!date) return;
    const planName = log.plan_name || log.planName || '';
    const existing = sessionsByDate.get(date);
    if (!existing) sessionsByDate.set(date, { date, planName });
    else if (!existing.planName && planName) existing.planName = planName;
  });
  const sessions = Array.from(sessionsByDate.values());

  if (sessions.length >= BEGINNER_SESSION_CAP) return null; // past the starter nudge

  const pick = pickNextBeginnerProgram(programs, sessions);
  if (!pick) return null;
  const { program, reason, lastProgram } = pick;

  const title = reason === 'rotation' ? '🌱 Keep going — next up' : '🌱 New here? Start with this';
  const body = reason === 'rotation'
    ? `Nice work on ${lastProgram.name}! Next up: ${program.name}.`
    : `We recommend starting with ${program.name} — a structured Beginner program from the Workout Library.`;

  const goToProgram = () => {
    if (userId) {
      try {
        // Same localStorage keys WorkoutTracker reads on mount (see its
        // lastTabKey/lastLevelKey) — lands the client straight on the
        // Workouts tab, Beginner level, instead of wherever it defaults to.
        localStorage.setItem(`workoutTrackerLastTab_${userId}`, 'templates');
        localStorage.setItem(`workoutTrackerLastLevel_${userId}`, 'beginner');
      } catch { /* ignore quota/serialization errors */ }
    }
    onNavigateToWorkouts && onNavigateToWorkouts();
  };

  return (
    <div
      onClick={goToProgram}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToProgram(); } }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 0, padding: '12px 14px', marginBottom: '4px', cursor: 'pointer'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>{title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{body}</div>
      </div>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap', flexShrink: 0 }}>Go →</span>
    </div>
  );
}
