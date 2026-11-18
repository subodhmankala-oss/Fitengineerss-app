import React, { useState } from 'react';
import SwipeToHide from './SwipeToHide';
import useWorkoutLeftovers from '../utils/useWorkoutLeftovers';
import { getSelfMissedAlert } from '../utils/workoutLeftovers';

// Self-guided home card: "You missed Triceps Long Head this week. It's on
// your next push day." The self-guided twin of the coach bell's "missed
// <part> last week" (see getSelfMissedAlert). Swipe to hide; hidden per week.
export default function MissedPartsCard({ userId }) {
  const items = useWorkoutLeftovers(userId);
  const alert = getSelfMissedAlert(items);
  const key = alert ? `missedPartsHidden_${userId}_${alert.weekEnd}` : null;
  const [, setTick] = useState(0);
  if (!alert) return null;
  let hidden = false;
  try { hidden = localStorage.getItem(key) === '1'; } catch { /* storage blocked — shows */ }
  if (hidden) return null;
  const hide = () => {
    try { localStorage.setItem(key, '1'); } catch { /* storage blocked — hidden until reload */ }
    setTick(t => t + 1);
  };
  return (
    <SwipeToHide onHide={hide} hintKey={`missedPartsSwipeHintSeen_${userId}`} hideLabel="Hide this reminder" style={{ marginBottom: '12px' }}>
      <div
        role="status"
        data-testid="missed-parts-card"
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
          borderRadius: '14px', background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{alert.title}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '2px' }}>{alert.body}</div>
        </div>
      </div>
    </SwipeToHide>
  );
}
