import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { determineWorkoutGuidance } from '../utils/beginnerGuidance';

// No session-count cutoff: this used to hide itself past 12 sessions (a
// "new client nudge"), but that no longer fits a genuine ~3-month-per-level
// journey — a client training 3x/week clears 12 sessions in under a month,
// long before even reaching Intermediate, and would never see a level-up.
// The banner is now an ongoing guide for every stage (Beginner through
// permanent Advanced rotation), so it stays visible indefinitely.

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CATEGORIES = ['gym', 'home'];

// Writes the same localStorage keys WorkoutTracker reads on mount (see its
// lastTabKey/lastLevelKey/lastCategoryKey/autoStart handling) and navigates.
// Lands the client on the right Workouts tab / level / category even if the
// deep-link auto-start can't run for some reason (e.g. a session is already
// in progress); when it can, it starts logging `program` immediately — no
// extra tap on the library card needed.
function startProgram(userId, onNavigateToWorkouts, category, level, program) {
  if (userId) {
    try {
      localStorage.setItem(`workoutTrackerLastTab_${userId}`, 'templates');
      localStorage.setItem(`workoutTrackerLastLevel_${userId}`, level);
      localStorage.setItem(`workoutTrackerLastCategory_${userId}`, category);
      localStorage.setItem(`workoutTrackerAutoStart_${userId}`, JSON.stringify({
        name: program.name,
        exercises: program.exercises,
        level
      }));
    } catch { /* ignore quota/serialization errors */ }
  }
  onNavigateToWorkouts && onNavigateToWorkouts();
}

// Home-screen guidance for a client who's still new to training: tells them
// exactly which Workout Library program to do next — starting at Gym or Home
// Beginner and automatically advancing to Intermediate, then Advanced, on a
// genuine ~3-month-per-level tenure clock (see determineWorkoutGuidance /
// WEEKS_PER_LEVEL in beginnerGuidance.js for the full algorithm, including a
// client who already has Intermediate/Advanced history with no Beginner
// sessions at all, and Gym vs Home tracked independently).
// Tapping the banner deep-links straight into logging that exact program —
// see startProgram above — rather than just opening the Workout Library at
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

  const guidance = determineWorkoutGuidance(library, sessions);
  if (!guidance) return null;

  // A client with ZERO logged sessions has no history to infer Gym vs Home
  // from — determineWorkoutGuidance defaults to Gym, but silently assuming
  // that is a real error for a client who only trains at home. Ask instead,
  // this one time: two explicit choices, each deep-linking straight into
  // that category's first Beginner program. The moment they've logged
  // anything at all (even from one of these two picks), this branch stops
  // matching and the normal single-suggestion banner below takes over,
  // correctly following whichever they actually did.
  if (guidance.reason === 'no-sessions') {
    const gymFirst = library.gym.beginner?.[0];
    const homeFirst = library.home.beginner?.[0];
    if (!gymFirst && !homeFirst) return null;

    return (
      <div
        style={{
          background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
          borderRadius: 0, padding: '12px 14px', marginBottom: '4px'
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-accent-light)' }}>🌱 New here? Let's get you started</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: '10px' }}>
          Where will you be training?
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {gymFirst && (
            <button
              type="button"
              onClick={() => startProgram(userId, onNavigateToWorkouts, 'gym', 'beginner', gymFirst)}
              style={{
                flex: 1, background: 'rgba(var(--accent-rgb), 0.15)', border: '1px solid rgba(var(--accent-rgb), 0.4)',
                borderRadius: '8px', padding: '8px 10px', color: 'var(--primary-accent-light)', fontSize: '0.78rem',
                fontWeight: 700, cursor: 'pointer'
              }}
            >
              🏋️ I have gym access
            </button>
          )}
          {homeFirst && (
            <button
              type="button"
              onClick={() => startProgram(userId, onNavigateToWorkouts, 'home', 'beginner', homeFirst)}
              style={{
                flex: 1, background: 'rgba(var(--accent-rgb), 0.15)', border: '1px solid rgba(var(--accent-rgb), 0.4)',
                borderRadius: '8px', padding: '8px 10px', color: 'var(--primary-accent-light)', fontSize: '0.78rem',
                fontWeight: 700, cursor: 'pointer'
              }}
            >
              🏠 I'm training at home
            </button>
          )}
        </div>
      </div>
    );
  }

  const { category, level, program, reason, lastProgram } = guidance;

  const categoryLabel = category === 'home' ? 'Home' : 'Gym';
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  const title = reason === 'leveled-up'
    ? `🎉 ${levelLabel} unlocked!`
    : reason === 'rotation'
      ? '🌱 Keep going — next up'
      : '🌱 New here? Start with this';

  const body = reason === 'leveled-up'
    ? `You've put in your 3 months as a ${categoryLabel} ${lastProgramLevelLabel(level)}! Time to level up — try ${program.name}.`
    : reason === 'rotation'
      ? `Nice work on ${lastProgram.name}! Next up: ${program.name}.`
      : `We recommend starting with ${program.name} — a structured ${categoryLabel} ${levelLabel} program from the Workout Library.`;

  const goToProgram = () => startProgram(userId, onNavigateToWorkouts, category, level, program);

  return (
    <div
      onClick={goToProgram}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToProgram(); } }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
        borderRadius: 0, padding: '12px 14px', marginBottom: '4px', cursor: 'pointer'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-accent-light)' }}>{title}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{body}</div>
      </div>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary-accent-light)', whiteSpace: 'nowrap', flexShrink: 0 }}>Go →</span>
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
