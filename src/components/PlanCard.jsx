import React, { useState } from 'react';
import MuscleThumbnail, { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { getPlanCardMeta, PPLC_COLOR } from '../utils/planCardMeta';
import { MUSCLE_TO_PPLC } from '../utils/muscleGroups';
import { getOpenedPlanIds, markPlanOpened } from '../utils/openedCoachPlans';
import './WorkoutTracker.css';

// Routine-picker card icons — plain stroke SVGs (matches ClientProfile.jsx's
// icon style) instead of emoji, so Coach Plan and Saved Template cards use
// the exact same icon language.
const FolderIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 16 14" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);
const DumbbellIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 6.5 17.5 17.5M4 4l3 3M20 20l-3-3M2 8l3-3M8 2l3 3M16 22l3-3M22 16l-3 3" />
  </svg>
);
export const TrashIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// "3d ago" / "Today" / "Yesterday" from an ISO timestamp — used for saved
// templates, which only track createdAt (no separate updated-at column).
const relativeDateLabel = (isoString) => {
  if (!isoString) return '';
  const then = new Date(isoString);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Absolute "Jul 27, 2026" form — used for the coach-assigned date, where an
// exact date reads better than a relative one (matches the coach's own
// "Assigned to: X · Jul 27, 2026" label in TrainerDashboard).
const assignedDateLabel = (isoString) => {
  if (!isoString) return '';
  const then = new Date(isoString);
  if (Number.isNaN(then.getTime())) return '';
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Routine card — a coach-assigned plan (muscle thumbnail, Push/Pull/Legs
// color) or a client's own saved template (folder icon). Both live in the
// Log Sets routine picker, so they present a plan the exact same way.
// markOpenedOnStart: Home's card passes false and leaves the marking to
// WorkoutTracker, which only marks a plan once it has actually started it.
// "3 × 10" when the sets share the same reps, else just the set count.
const formatSetsLabel = (sets) => {
  if (!Array.isArray(sets) || sets.length === 0) return '';
  const reps = sets.map(st => st && st.reps);
  const same = reps[0] && reps.every(r => String(r) === String(reps[0]));
  return same ? `${sets.length} × ${reps[0]}` : `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`;
};

// onOpenExercise: when given (Log Sets picker only — Home's card omits it), the
// "N exercises" count becomes a toggle that expands the plan's exercise list,
// and each name opens that exercise's history sheet. `customized` flags a
// plan whose exercises were swapped for today's session.
const PlanCard = ({ plan, source, onStart, onDelete, markOpenedOnStart = true, onOpenExercise, getExerciseStatus, customized = false }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = getPlanCardMeta(plan);
  const exerciseList = Array.isArray(plan.exercises) ? plan.exercises : [];
  const isTemplate = source === 'self';
  const isUnopened = source === 'coach' && plan.id && !getOpenedPlanIds().has(plan.id);
  const handleStart = () => {
    if (source === 'coach' && markOpenedOnStart) markPlanOpened(plan.id);
    onStart();
  };
  return (
    <div className="wt-plan-card">
      {isUnopened && <span className="wt-plan-new-dot" aria-label="New, unopened plan" />}
      {isTemplate ? (
        <div className="wt-plan-thumb-fallback" style={{ background: `${meta.color}1c`, color: meta.color }}>
          <FolderIcon />
        </div>
      ) : (
        <div className="wt-plan-thumb">
          {meta.muscles.length > 1 ? (
            <FullBodyThumbnail trainedMuscles={meta.muscles} view={meta.view} size={64} />
          ) : (
            <MuscleThumbnail muscle={meta.primaryMuscle} color={meta.color} size={64} />
          )}
        </div>
      )}

      <div className="wt-plan-body">
        {!isTemplate && (
          <div className="wt-plan-top-row">
            <span className="wt-plan-source-label" style={{ color: meta.color }}>
              Coach assigned{plan.createdAt ? ` · ${assignedDateLabel(plan.createdAt)}` : ''}
            </span>
          </div>
        )}

        <strong className="wt-plan-title">{plan.planName}</strong>

        <div className="wt-plan-meta-row">
          {isTemplate ? (
            <span><CalendarIcon /> Updated {relativeDateLabel(plan.createdAt)}</span>
          ) : (
            <span><ClockIcon /> {meta.estMinutes} min</span>
          )}
          {onOpenExercise ? (
            <button
              type="button"
              className={`wt-plan-expand-btn ${expanded ? 'open' : ''}`}
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              <DumbbellIcon /> {meta.exerciseCount} exercises <span className="wt-plan-expand-caret" aria-hidden="true">▾</span>
            </button>
          ) : (
            <span><DumbbellIcon /> {meta.exerciseCount} exercises</span>
          )}
        </div>

        {meta.muscles.length > 0 && (
          <div className="wt-plan-chip-row">
            {meta.muscles.slice(0, 3).map(m => (
              <span key={m} className="wt-muscle-chip">
                <span className="wt-muscle-chip-dot" style={{ background: PPLC_COLOR[MUSCLE_TO_PPLC[m]] || meta.color }} />
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="wt-plan-side">
        <button type="button" className="wt-plan-start-btn" onClick={handleStart}>
          ▶ Start
        </button>
        {isTemplate && onDelete && (
          <button
            type="button"
            className="wt-plan-delete-btn"
            aria-label="Delete template"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {onOpenExercise && expanded && (
        <div className="wt-plan-exercises">
          {exerciseList.map((ex, i) => {
            const status = getExerciseStatus ? getExerciseStatus(ex.name) : null;
            const flagged = status && (status.key === 'neglected' || status.key === 'under' || status.key === 'low');
            return (
              <button
                key={`${ex.name}-${i}`}
                type="button"
                className="wt-plan-exercise-row"
                title="View exercise history"
                onClick={() => onOpenExercise(ex.name)}
              >
                <span className="wt-plan-exercise-name">{ex.name}</span>
                <span className="wt-plan-exercise-right">
                  {flagged && (
                    <span className={`wt-plan-status-tag wt-plan-status-tag--${status.key}`}>
                      {status.key === 'neglected' ? 'Neglected' : status.key === 'under' ? 'Undertrained' : 'Slightly low'}
                    </span>
                  )}
                  <span className="wt-plan-exercise-sets">{formatSetsLabel(ex.sets)} ›</span>
                </span>
              </button>
            );
          })}
          {customized && <p className="wt-plan-customized">Swapped for today's session. The saved plan isn't changed.</p>}
        <button type="button" className="wt-plan-start-wide" onClick={handleStart}>
          ▶ Start workout
        </button>
        </div>
      )}
    </div>
  );
};

export default PlanCard;
