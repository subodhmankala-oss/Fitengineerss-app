import React, { useState } from 'react';
import databaseService from '../services/databaseService';
import { buildComebackWorkout, exercisesFromLastWorkout } from '../utils/comebackWorkout';
import { getLocalDateString } from '../utils/dateUtils';

// Home-screen card for a client with NO coach who hasn't logged a workout in
// a few days (see COMEBACK_THRESHOLD_DAYS). It's where the client-side
// "we miss you" push lands (api/push.js sends them to /?tab=home), and it
// replaces NextWorkoutBanner while it's showing so the two never stack.
//
// Two things to do instead of a blank screen:
//   1. A 10-minute session built automatically from their own last workout
//      (see buildComebackWorkout), started straight in the logger through the
//      same workoutTrackerAutoStart_<userId> hand-off NextWorkoutBanner uses.
//   2. Connect with a coach: opens the existing ConnectCoachModal.
// "Not today" hides it until tomorrow.
const dismissKey = (userId) => `comebackCardDismissed_${userId}`;

function isComebackCardDismissedToday(userId) {
  try { return localStorage.getItem(dismissKey(userId)) === getLocalDateString(); } catch { return false; }
}

export default function ComebackCard({ userId, userName, logs, daysAway, onNavigateToWorkouts, onConnectCoach }) {
  const [dismissed, setDismissed] = useState(() => isComebackCardDismissedToday(userId));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  if (dismissed) return null;

  const firstName = (userName || '').trim().split(/\s+/)[0];

  const startSession = async () => {
    if (starting) return;
    setStarting(true);
    setError('');
    let workout = buildComebackWorkout(logs);
    if (!workout) {
      // No usable history — fall back to the first Home Beginner program.
      try {
        const homeBeginner = await databaseService.getGenericWorkoutsByLevel('beginner', 'home');
        workout = buildComebackWorkout(logs, homeBeginner?.[0]);
      } catch { /* handled below */ }
    }
    if (!workout) {
      setStarting(false);
      setError("Couldn't load a workout right now. Check your connection and try again.");
      return;
    }
    try {
      localStorage.setItem(`workoutTrackerAutoStart_${userId}`, JSON.stringify(workout));
    } catch { /* ignore quota/serialization errors */ }
    setStarting(false);
    onNavigateToWorkouts && onNavigateToWorkouts();
  };

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(userId), getLocalDateString()); } catch { /* still hide for this visit */ }
    setDismissed(true);
  };

  const buttonStyle = {
    flex: 1, borderRadius: '8px', padding: '10px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
  };

  return (
    <div
      style={{
        background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
        borderRadius: 0, padding: '12px 14px', marginBottom: '4px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-text)' }}>
            👋 Good to see you{firstName ? `, ${firstName}` : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {daysAway >= 7
              ? 'Easing back in? Start small. Ten minutes is enough today.'
              : 'Short on time? Ten minutes still counts.'}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem',
            fontWeight: 600, cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap', flexShrink: 0
          }}
        >
          Not today
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          type="button"
          onClick={startSession}
          disabled={starting}
          style={{
            ...buttonStyle,
            background: 'var(--primary-accent)', border: '1px solid transparent',
            color: '#fff', opacity: starting ? 0.7 : 1
          }}
        >
          {starting ? 'Getting it ready…' : '▶ Start a 10-min session'}
        </button>
        <button
          type="button"
          onClick={onConnectCoach}
          style={{
            ...buttonStyle,
            background: 'rgba(var(--accent-rgb), 0.15)', border: '1px solid rgba(var(--accent-rgb), 0.4)',
            color: 'var(--accent-text)'
          }}
        >
          🤝 Get a coach
        </button>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
        {exercisesFromLastWorkout(logs).length >= 2
          ? 'Based on your last workout: 3 exercises, 2 sets each.'
          : 'No equipment needed: 3 exercises, 2 sets each.'}
      </div>
      {error && <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '6px' }}>{error}</div>}
    </div>
  );
}
