import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { getUnopenedCoachPlans } from '../utils/openedCoachPlans';
import PlanCard from './PlanCard';

// Home-screen card for a plan the coach just assigned. Shows each coach plan
// the client hasn't started yet; tapping Start deep-links into Log Sets with
// that plan loaded (WorkoutTracker reads the coachPlanId
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

  // Not marked opened here: WorkoutTracker marks it once the plan really
  // starts. If a session is already in progress the tracker keeps that one
  // and this plan stays on Home.
  const start = (plan) => {
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
      {/* Same card as Log Sets → Coach Assigned (muscle thumbnail, chips,
          est. minutes), so a plan looks identical in both places. */}
      <div className="wt-plan-list" style={{ marginTop: '10px' }}>
        {unopened.map(plan => (
          <PlanCard key={plan.id} plan={plan} source="coach" markOpenedOnStart={false} onStart={() => start(plan)} />
        ))}
      </div>
    </div>
  );
}
