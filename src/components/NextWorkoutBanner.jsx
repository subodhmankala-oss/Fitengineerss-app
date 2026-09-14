import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { determineWorkoutGuidance } from '../utils/beginnerGuidance';

// A client is still considered "new to training" for this nudge while
// they've logged fewer than this many total sessions. Deliberately simple
// and independent of the coaching "Training Level" tenure system (which
// tracks calendar weeks since a client's first session, for a different
// purpose — gating which difficulty tier a coach sees them at). This is
// just "have they logged enough workouts that they don't need a starter
// suggestion anymore" — a rough proxy, not tied to that bigger system.
const SESSION_CAP = 12;

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CATEGORIES = ['gym', 'home'];

// Home-screen guidance for a client who's still new to training: tells them
// exactly which Workout Library program to do next — starting at Gym or Home
// Beginner and automatically advancing to Intermediate, then Advanced, once
// every program at the current level has been logged at least once (see
// determineWorkoutGuidance in beginnerGuidance.js for the full algorithm,
// including a client who already has Intermediate/Advanced history with no
// Beginner sessions at all, and Gym vs Home tracked independently).
// Tapping the banner deep-links straight into logging that exact program —
// see goToProgram below — rather than just opening the Workout Library at
// the right level/category and leaving the client to tap the card
// themselves.
// Renders nothing once the client has logged enough sessions, or if no
// Workout Library programs are configured for either category at all.
export default function NextWorkoutBanner({ userId, logs, onNavigateToWorkouts }) {
  const [library, setLibrary] = useState(null); // null = still loading

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CATEGORIES.map(category =>
        Promise.all(LEVELS.map(level => databaseService.getGenericWorkoutsByLevel(level, category)))
      )
    ).then(([gymLists, homeLists]) => {
      if (cancelled) return;
      setLibrary({
        gym: { beginner: gymLists[0], intermediate: gymLists[1], advanced: gymLists[2] },
        home: { beginner: homeLists[0], intermediate: homeLists[1], advanced: homeLists[2] }
      });
    }).catch(() => {
      if (!cancelled) setLibrary({ gym: {}, home: {} });
    });
    return () => { cancelled = true; };
  }, []);

  if (!library) return null;

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

  if (sessions.length >= SESSION_CAP) return null; // past the starter nudge

  const guidance = determineWorkoutGuidance(library, sessions);
  if (!guidance) return null;
  const { category, level, program, reason, lastProgram } = guidance;

  const categoryLabel = category === 'home' ? 'Home' : 'Gym';
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  const title = reason === 'leveled-up'
    ? `🎉 ${levelLabel} unlocked!`
    : reason === 'rotation'
      ? '🌱 Keep going — next up'
      : '🌱 New here? Start with this';

  const body = reason === 'leveled-up'
    ? `You've completed every ${categoryLabel} ${lastProgramLevelLabel(level)} program! Time to level up — try ${program.name}.`
    : reason === 'rotation'
      ? `Nice work on ${lastProgram.name}! Next up: ${program.name}.`
      : `We recommend starting with ${program.name} — a structured ${categoryLabel} ${levelLabel} program from the Workout Library.`;

  const goToProgram = () => {
    if (userId) {
      try {
        // Same localStorage keys WorkoutTracker reads on mount (see its
        // lastTabKey/lastLevelKey/lastCategoryKey) — lands the client on the
        // right Workouts tab / level / category even if the deep-link
        // auto-start below can't run for some reason (e.g. a session is
        // already in progress).
        localStorage.setItem(`workoutTrackerLastTab_${userId}`, 'templates');
        localStorage.setItem(`workoutTrackerLastLevel_${userId}`, level);
        localStorage.setItem(`workoutTrackerLastCategory_${userId}`, category);
        // The actual deep link — WorkoutTracker's mount effect reads this
        // and starts logging `program` immediately, no extra tap needed.
        localStorage.setItem(`workoutTrackerAutoStart_${userId}`, JSON.stringify({
          name: program.name,
          exercises: program.exercises,
          level
        }));
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

// The level just cleared, for the 'leveled-up' message ("completed every
// ___ program") — one below whichever level the client is now on.
function lastProgramLevelLabel(currentLevel) {
  const idx = LEVELS.indexOf(currentLevel);
  const previous = idx > 0 ? LEVELS[idx - 1] : currentLevel;
  return previous.charAt(0).toUpperCase() + previous.slice(1);
}
