import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { getUnopenedCoachPlans, markPlanOpened } from '../utils/openedCoachPlans';

// Home-screen card for a plan the coach just assigned. Shows each coach plan
// the client hasn't started yet; tapping Start marks it opened and deep-links
// into Log Sets with that plan loaded (WorkoutTracker reads the coachPlanId
// from workoutTrackerAutoStart_<userId>). Once started, the plan drops off
// Home and lives only in Log Sets' "Coach Assigned" section.
export default function CoachPlanHomeCard({ userId, logs, onNavigateToWorkouts }) {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const load = () => {
      databaseService.getWorkoutPlansForUser(userId)
        .then(list => { if (!cancelled) setPlans(list || []); })
        .catch(() => { /* card is optional — leave it hidden */ });
    };
    load();
    // Refetch when the app comes back to the foreground — the moment a
    // client opens it after a "new plan" push.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const unopened = getUnopenedCoachPlans(plans, logs);
  if (unopened.length === 0) return null;

  const start = (plan) => {
    markPlanOpened(plan.id);
    try {
      localStorage.setItem(`workoutTrackerLastTab_${userId}`, 'log');
      localStorage.setItem(`workoutTrackerAutoStart_${userId}`, JSON.stringify({ coachPlanId: plan.id }));
    } catch { /* ignore quota/serialization errors */ }
    onNavigateToWorkouts && onNavigateToWorkouts();
  };

  return (
    <div
      style={{
        background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
        borderRadius: 0, padding: '12px 14px', marginBottom: '4px'
      }}
    >
      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-text)' }}>
        📋 {unopened.length === 1 ? 'New plan from your coach' : `${unopened.length} new plans from your coach`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        {unopened.map(plan => {
          const exerciseCount = Array.isArray(plan.exercises) ? plan.exercises.length : 0;
          return (
            <div key={plan.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plan.planName}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => start(plan)}
                style={{
                  flexShrink: 0, background: 'rgba(var(--accent-rgb), 0.15)', border: '1px solid rgba(var(--accent-rgb), 0.4)',
                  borderRadius: '8px', padding: '8px 12px', color: 'var(--accent-text)', fontSize: '0.78rem',
                  fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                ▶ Start
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
