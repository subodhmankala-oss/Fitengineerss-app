import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './WorkoutTracker.css';
import databaseService, { isTrainer } from '../services/databaseService';
import { getLocalDateString, isLocalToday } from '../utils/dateUtils';
import SetTypeMenu, { getSetTypeVisual } from './SetTypeMenu';
import ExercisePickerModal from './ExercisePickerModal';
import { EXERCISE_LIBRARY, isCardioExercise, isTimedExercise, isLoadedCarryExercise, isBodyweightExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { formatDuration, computeElapsedSeconds, computeLiveCalories, formatSecondsToTimeString, maskDigitsToTimeString, parseTimeStringToSeconds, estimateCardioKcal, estimateCardioDistanceKm, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { normalizeExerciseForGuide, findExerciseGuideMatch } from '../utils/videoUtils';
import ExerciseGuideModal from './ExerciseGuideModal';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import { notifyEvent } from '../utils/pushNotify';
import { getMuscleGroupsForExercise, MUSCLE_TO_PPLC } from '../utils/muscleGroups';
import WorkoutShareCard from './WorkoutShareCard';
import './WorkoutShareCard.css';
import MuscleThumbnail, { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { useTour } from '../context/TourContext';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import ClockTimerModal from './ClockTimerModal';
import { StopwatchIcon, PlayIcon, PauseIcon } from './TimerIcons';
import { playAlarmBeeps, unlockAudio } from '../utils/alarmSound';
import { useSetNumberPad } from '../utils/setInputUtils';
import { suggestNextWeight } from '../utils/progressiveOverload';
import SetNumberPad from './SetNumberPad';
import SetValueField from './SetValueField';

// Default dynamic warm-up block — auto-prepended whenever a client starts a
// fresh workout log (empty start or from a plan/template), so a warm-up is
// there without the client having to add it themselves. Reps-only (no
// weight, no calories — see isWarmupExercise), removable like any exercise.
// Fresh array/object instances per call so nothing shares references across
// sessions.
const getDefaultWarmupExercises = () => [
  { name: 'Arm Circle', sets: [{ reps: '10', weight: '0', isCompleted: false }] },
  { name: 'Leg Swing', sets: [{ reps: '10', weight: '0', isCompleted: false }] },
];

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
const TrashIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// Bold stacked words for a library card's typographic tile (e.g. "Beginner
// Full Body A" → ["FULL", "BODY A"]). Strips the level word (the tabs already
// filter by it) and joiners, merges a trailing single-letter variant ("A"/"B")
// into the previous line, and caps at 3 lines so the tile never overflows.
const programTileWords = (name) => {
  const words = String(name || '')
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(w => w && !/^(beginner|intermediate|advanced|&|and|-|\+)$/i.test(w))
    .map(w => w.toUpperCase());
  const lines = [];
  words.forEach(w => {
    if (w.length <= 2 && lines.length > 0) lines[lines.length - 1] += ` ${w}`;
    else lines.push(w);
  });
  return lines.slice(0, 3);
};

// Push/Pull/Legs/Core color coding for the routine-picker cards — same
// categorization Section 3 of Weekly Muscle Analytics uses (MUSCLE_TO_PPLC),
// so a "Push Strength" plan's thumbnail/chips read the same warm-red family
// a client already associates with chest/shoulders/triceps elsewhere.
const PPLC_COLOR = { Push: '#ef4444', Pull: '#3b82f6', Legs: '#10b981', Core: '#a855f7' };

// Derives the routine-picker card's display data from a plan's exercise list
// — muscle groups trained, a representative body region + color for its
// MuscleThumbnail, and a rough duration estimate (no real duration is
// tracked per plan, so this is a heuristic: ~1min work + ~1.5min rest per
// set, rounded to the nearest 5 minutes for a clean-looking number).
const getPlanCardMeta = (plan) => {
  const exercises = plan.exercises || [];
  const exerciseCount = exercises.length;
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

  const muscleCounts = {};
  exercises.forEach(ex => {
    getMuscleGroupsForExercise(ex.name).forEach(m => {
      muscleCounts[m] = (muscleCounts[m] || 0) + 1;
    });
  });
  const muscles = Object.keys(muscleCounts).sort((a, b) => muscleCounts[b] - muscleCounts[a]);

  const categoryCounts = {};
  muscles.forEach(m => {
    const cat = MUSCLE_TO_PPLC[m];
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + muscleCounts[m];
  });
  const category = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0] || 'Push';

  // "Full body" gets the whole-body thumbnail instead of MuscleThumbnail's
  // single-muscle zoomed crop, which otherwise misrepresented a plan as
  // "just a chest day" — either the coach named it that outright (may still
  // be light on exercises, like a plan still being built out) or its
  // exercises genuinely span 3+ of the 4 Push/Pull/Legs/Core categories.
  const isFullBody = /full\s*body/i.test(plan.planName || '') || Object.keys(categoryCounts).length >= 3;

  return {
    muscles,
    primaryMuscle: muscles[0] || 'Chest',
    category,
    color: PPLC_COLOR[category] || PPLC_COLOR.Push,
    isFullBody,
    exerciseCount,
    totalSets,
    estMinutes: Math.max(15, Math.round((totalSets * 2.5) / 5) * 5)
  };
};

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

// Tracks which coach-assigned plan IDs this client has already opened (i.e.
// pressed Start on), scoped per-user via localStorage since there's no
// server-side "viewed" column on workout_plans. Used to show a small "new"
// dot on cards for plans the client hasn't opened yet.
const OPENED_PLANS_KEY_PREFIX = 'wt_opened_coach_plan_ids';
const getOpenedPlanIds = () => {
  try {
    const userId = localStorage.getItem('userId') || 'anon';
    const raw = localStorage.getItem(`${OPENED_PLANS_KEY_PREFIX}_${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};
const markPlanOpened = (planId) => {
  if (!planId) return;
  try {
    const userId = localStorage.getItem('userId') || 'anon';
    const ids = getOpenedPlanIds();
    ids.add(planId);
    localStorage.setItem(`${OPENED_PLANS_KEY_PREFIX}_${userId}`, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
};

// Routine card — a coach-assigned plan (muscle thumbnail, Push/Pull/Legs
// color) or a client's own saved template (folder icon). Shared by the Log
// Sets routine picker and the Workouts tab's "Your Coach's Plan" section, so
// both present a plan the exact same way.
const PlanCard = ({ plan, source, onStart, onDelete }) => {
  const meta = getPlanCardMeta(plan);
  const isTemplate = source === 'self';
  const isUnopened = source === 'coach' && plan.id && !getOpenedPlanIds().has(plan.id);
  const handleStart = () => {
    if (source === 'coach') markPlanOpened(plan.id);
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
          {meta.isFullBody ? (
            <FullBodyThumbnail trainedMuscles={meta.muscles} size={64} />
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
          <span><DumbbellIcon /> {meta.exerciseCount} exercises</span>
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
    </div>
  );
};

// Initial pre-hydrated historical progression logs for client "Sridhar"
const defaultHistoricalSessions = [
  {
    id: 'session-1',
    clientName: 'Sridhar',
    date: '2026-04-22',
    exercises: [
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: 2.0 }, { reps: 8, weight: 2.0 }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: 2.0 }, { reps: 12, weight: 2.0 }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: 2.0 }, { reps: 12, weight: 2.0 }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: 1.0 }, { reps: 10, weight: 1.0 }] }
    ]
  },
  {
    id: 'session-2',
    clientName: 'Sridhar',
    date: '2026-04-29',
    exercises: [
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: 2.2 }, { reps: 9, weight: 2.2 }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: 2.2 }, { reps: 14, weight: 2.2 }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: 2.2 }, { reps: 12, weight: 2.2 }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: 1.5 }, { reps: 11, weight: 1.5 }] }
    ]
  },
  {
    id: 'session-3',
    clientName: 'Sridhar',
    date: '2026-05-06',
    exercises: [
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: 2.5 }, { reps: 8, weight: 2.5 }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: 2.5 }, { reps: 15, weight: 2.5 }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: 2.5 }, { reps: 12, weight: 2.5 }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: 2.0 }, { reps: 12, weight: 1.5 }] }
    ]
  },
  {
    id: 'session-4',
    clientName: 'Sridhar',
    date: '2026-05-13',
    exercises: [
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: 2.5 }, { reps: 9, weight: 2.5 }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: 2.5 }, { reps: 15, weight: 2.5 }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: 2.5 }, { reps: 12, weight: 2.5 }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: 2.0 }, { reps: 12, weight: 2.0 }] }
    ]
  },
  {
    id: 'session-5',
    clientName: 'Sridhar',
    date: '2026-05-20',
    exercises: [
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: 2.5 }, { reps: 9, weight: 2.5 }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: 2.5 }, { reps: 15, weight: 2.5 }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: 2.5 }, { reps: 12, weight: 2.6 }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: 2.0 }, { reps: 12, weight: 2.0 }] }
    ]
  }
];

const defaultClientProfiles = [
  { clientName: 'Sridhar', activeProgram: 'Body Weights & Dumbbells', totalSessions: 12 },
  { clientName: 'Generic Client', activeProgram: 'Hypertrophy Surge', totalSessions: 24 }
];

const availablePrograms = [
  {
    id: 'bodyweight_dumbbells',
    name: 'Body Weights & Dumbbells',
    sessions: 12,
    difficulty: 'Beginner',
    focus: 'Strength & Conditioning',
    desc: 'Structured dumbells training focus incorporating core stabilizing overload mechanics.',
    price: '₹2,999'
  },
  {
    id: 'hypertrophy_surge',
    name: 'Hypertrophy Surge',
    sessions: 24,
    difficulty: 'Intermediate',
    focus: 'Anabolic Hypertrophy',
    desc: 'Intense strength progressive overload program centered around lifting mechanics and mass overload.',
    price: '₹5,999'
  },
  {
    id: 'caloric_deficit_conditioning',
    name: 'Caloric Deficit Conditioning',
    sessions: 16,
    difficulty: 'Intermediate',
    focus: 'Fat Loss & Conditioning',
    desc: 'Caloric burn focus utilizing high density sets to maximize conditioning.',
    price: '₹3,999'
  },
  {
    id: 'gut_reset_restore',
    name: 'Gut Biome Reset & Restore',
    sessions: 8,
    difficulty: 'Beginner',
    focus: 'Wellness & Maintenance',
    desc: 'Combines light hypertrophy load curves with metabolic reset coaching programs.',
    price: '₹1,999'
  }
];

// Exported so other screens (TrainerDashboard's Form Guide) can use this as
// a local fallback when the DB-backed exercise fetch fails/times out —
// without it, a network hiccup meant those exercises' real video/guide data
// was completely unreachable, not just briefly delayed (see the matching
// comment on TrainerDashboard's guideExercisesList fetch).
export const presetExercises = [
  {
    name: 'Shoulders Press',
    category: 'Shoulders',
    primary: 'Deltoids',
    secondary: 'Triceps, Upper Chest',
    videoFile: '/videos/shoulders-press.mp4',
    guide: {
      target: 'Deltoids (Shoulders), Triceps, Upper Chest',
      setup: 'Sit on a bench with back support. Hold dumbbells at shoulder height with an overhand grip, elbows bent at 90 degrees.',
      execution: 'Press the weights straight up above your head until your arms are fully extended. Lower slowly back to the starting point.',
      tip: 'Keep your core engaged and avoid arching your lower back as you press the weights overhead.'
    }
  },
  {
    name: 'Biceps Curls',
    category: 'Arms',
    primary: 'Biceps',
    secondary: 'Brachialis, Brachioradialis',
    videoFile: '/videos/biceps-curls.mp4',
    guide: {
      target: 'Biceps Brachii, Brachialis, Brachioradialis',
      setup: 'Stand upright with feet shoulder-width apart, holding dumbbells at your sides with palms facing forward.',
      execution: 'Keep elbows close to your torso. Curl the weights while contracting your biceps. Lower slowly to full extension.',
      tip: 'Do not swing your body or use momentum. Keep your upper arms completely stationary during the movement.'
    }
  },
  {
    name: 'One Arm Row',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Rhomboids, Trapezius, Biceps',
    videoFile: '/videos/one-arm-row.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Rhomboids, Trapezius, Biceps',
      setup: 'Place one knee and same-side hand on a flat bench. Keep your back flat and parallel to the floor, holding a dumbbell in the other hand.',
      execution: 'Row the dumbbell up to your hip crease, squeezing your shoulder blade at the peak. Lower with control to full stretch.',
      tip: 'Pull with your elbow rather than your hand. Maintain a neutral spine throughout the set.'
    }
  },
  {
    name: 'Lat Pull Down',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Upper Back, Biceps',
    videoFile: '/videos/lat-pull-down.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Upper Back, Biceps',
      setup: 'Sit at a pulldown station and adjust the thigh pad. Grasp the bar with a wide overhand grip, leaning slightly back.',
      execution: 'Pull the bar down to your upper chest by driving your elbows down and back. Squeeze your lats and slowly return.',
      tip: 'Avoid pulling the bar behind your neck. Control the weight on the way up to maximize hypertrophy.'
    }
  },
  {
    name: 'Flat Bench Press',
    category: 'Chest',
    primary: 'Pectoralis Major',
    secondary: 'Anterior Deltoids, Triceps',
    videoFile: '/videos/flat-bench-press.mp4',
    guide: {
      target: 'Pectoralis Major (Chest), Anterior Deltoids, Triceps',
      setup: 'Lie flat on a bench, grip the barbell slightly wider than shoulder-width. Keep feet flat on the floor and retract shoulder blades.',
      execution: 'Unrack the bar and lower it slowly to your mid-chest. Press upward in a slight arc until arms are locked out.',
      tip: 'Keep your elbows tucked at roughly 45 degrees. Do not bounce the bar off your chest.'
    }
  },
  {
    name: 'Incline Dumbbell Press',
    category: 'Chest',
    primary: 'Upper Chest',
    secondary: 'Shoulders, Triceps',
    videoFile: '/videos/incline-dumbbell-press.mp4',
    guide: {
      target: 'Clavicular Pectoralis (Upper Chest), Shoulders, Triceps',
      setup: 'Set an incline bench to 30-45 degrees. Sit with dumbbells at your chest, elbows tucked, feet firmly planted.',
      execution: 'Press the dumbbells straight up over your chest until arms are extended. Lower slowly until you feel a deep chest stretch.',
      tip: 'Keep your shoulder blades pinched together. Press in a stable, controlled path.'
    }
  },
  {
    name: 'Cable Crossover',
    category: 'Chest',
    primary: 'Pectoralis Major',
    secondary: 'Anterior Deltoids',
    videoFile: '/videos/cable-crossover.mp4',
    guide: {
      target: 'Sternal Pectoralis (Inner & Lower Chest)',
      setup: 'Set pulleys to high position. Hold handles, step forward with one foot, lean slightly forward, arms extended out.',
      execution: 'Bring hands down and forward in a wide arc until they meet or cross over. Squeeze your chest hard at the bottom.',
      tip: 'Keep a slight bend in your elbows. Do not let the weights fly back aggressively; control the eccentric phase.'
    }
  },
  {
    name: 'Barbell Squat',
    category: 'Legs',
    primary: 'Quadriceps',
    secondary: 'Glutes, Hamstrings, Core',
    videoFile: '/videos/barbell-squat.mp4',
    guide: {
      target: 'Quadriceps, Gluteus Maximus, Hamstrings, Core',
      setup: 'Rest the barbell across your upper traps. Stand with feet slightly wider than shoulder-width, toes flared out.',
      execution: 'Send hips back and bend knees to squat down until thighs are parallel to floor or lower. Drive through heels to stand.',
      tip: 'Keep your chest up and knees tracking in line with your toes. Never let your knees cave inward.'
    }
  },
  {
    name: 'Romanian Deadlift',
    category: 'Legs',
    primary: 'Hamstrings',
    secondary: 'Glutes, Lower Back',
    videoFile: '/videos/romanian-deadlift.mp4',
    guide: {
      target: 'Hamstrings, Glutes, Lower Back (Erectors)',
      setup: 'Stand tall holding dumbbells or a barbell at hip height. Feet hip-width apart, knees slightly unlocked.',
      execution: 'Hinge at your hips, pushing them back as you lower the weight down your shins. Squeeze glutes to return when stretch is felt.',
      tip: 'Keep the bar touching your legs. Maintain a flat back; do not round your spine.'
    }
  },
  {
    name: 'Leg Extensions',
    category: 'Legs',
    primary: 'Quadriceps',
    secondary: 'Rectus Femoris, Vastus Lateralis',
    videoFile: '/videos/leg-extensions.mp4',
    guide: {
      target: 'Quadriceps (Rectus Femoris, Vastus Lateralis)',
      setup: 'Sit in the extension machine, back flush against pad. Place ankles under the roller pad and hold the side handles.',
      execution: 'Extend your legs fully by contracting your quads. Hold for a split second at peak extension, then lower slowly.',
      tip: 'Keep your hips locked into the seat. Do not swing the weight or use momentum.'
    }
  },
  {
    name: 'Overhead Triceps Extension',
    category: 'Arms',
    primary: 'Triceps',
    secondary: 'Core, Shoulders',
    videoFile: '/videos/overhead-triceps-extension.mp4',
    guide: {
      target: 'Triceps Brachii (Long Head focus)',
      setup: 'Stand or sit, holding a dumbbell with both hands vertically overhead, cupping the top plate under your palms.',
      execution: 'Lower the dumbbell slowly behind your head by bending your elbows. Keep upper arms close to ears. Press back up.',
      tip: 'Do not flare your elbows excessively outward. Keep your torso upright and core tight.'
    }
  },
  {
    name: 'Hammer Curls',
    category: 'Arms',
    primary: 'Brachialis',
    secondary: 'Brachioradialis, Biceps',
    videoFile: '/videos/hammer-curls.mp4',
    guide: {
      target: 'Brachialis, Brachioradialis (Forearms), Biceps',
      setup: 'Stand tall with dumbbells in each hand, palms facing each other (neutral grip).',
      execution: 'Curl the dumbbells up toward shoulders while maintaining a neutral grip. Lower slowly to full extension.',
      tip: 'Avoid swinging the elbows forward. Squeeze the forearm and bicep muscles at the top.'
    }
  },
  {
    name: 'Plank',
    category: 'Core',
    primary: 'Core',
    secondary: 'Glutes, Shoulders',
    videoFile: '/videos/plank.mp4',
    guide: {
      target: 'Core (Rectus Abdominis, Obliques, Transverse Abdominis)',
      setup: 'Place forearms on the floor, elbows aligned under shoulders. Extend legs straight back, resting on toes.',
      execution: 'Engage your core, glutes, and thighs. Maintain a straight line from head to heels. Hold static position.',
      tip: 'Do not let your hips sag down or your butt push up in the air. Keep breathing consistently.'
    }
  },
  {
    name: 'Hanging Leg Raises',
    category: 'Core',
    primary: 'Lower Abs',
    secondary: 'Hip Flexors, Core',
    videoFile: '/videos/hanging-leg-raises.mp4',
    guide: {
      target: 'Lower Rectus Abdominis, Iliopsoas (Hip Flexors)',
      setup: 'Hang from a pull-up bar with an overhand grip, arms and legs fully extended, shoulders active.',
      execution: 'Keeping legs straight or slightly bent, engage core to raise feet up until legs are parallel to floor or higher. Lower slowly.',
      tip: 'Do not swing your body. Initiate the lift using your lower abs, not momentum.'
    }
  },
  {
    name: 'Dumbbell Lateral Raises',
    category: 'Shoulders',
    primary: 'Lateral Deltoids',
    secondary: 'Trapezius',
    videoFile: '/videos/dumbbell-lateral-raises.mp4',
    guide: {
      target: 'Lateral Deltoids (Side Shoulders)',
      setup: 'Stand upright holding dumbbells at your sides, palms facing inward. Lean forward very slightly.',
      execution: 'Raise dumbbells out to the sides in a wide arc until arms are parallel to the floor. Lower back down slowly.',
      tip: 'Keep elbows slightly bent. Do not shrug your shoulders or raise the weights above shoulder level.'
    }
  },
  {
    name: 'Pull-ups',
    category: 'Back',
    primary: 'Latissimus Dorsi',
    secondary: 'Rhomboids, Teres Major, Biceps',
    videoFile: '/videos/pull-ups.mp4',
    guide: {
      target: 'Latissimus Dorsi (Lats), Teres Major, Rhomboids, Biceps',
      setup: 'Hang from a bar with a wide overhand grip. Depress and retract your scapula (pull shoulders down).',
      execution: 'Pull your body upward by driving elbows down until your chest approaches the bar. Lower with control.',
      tip: 'Avoid kicking or kipping with your legs. Focus on a full range of motion from dead hang to chin over bar.'
    }
  }
];

// Form-guide lookup order: DB-sourced exercises (if loaded) take precedence,
// then the 16 rich presets (with video/guide), then the shared
// EXERCISE_LIBRARY for muscle info. The picker itself uses the shared
// library via <ExercisePickerModal>.
const allExerciseOptions = [...presetExercises, ...EXERCISE_LIBRARY]
  .filter((ex, idx, arr) => arr.findIndex(e => e.name.toLowerCase() === ex.name.toLowerCase()) === idx)
  .sort((a, b) => a.name.localeCompare(b.name));

const WorkoutTracker = () => {
  const loggedInUser = localStorage.getItem('userName') || 'Warrior';

  // ─── In-progress workout draft persistence ───
  // The entire logging session (exercises, timer timestamps, form fields) lives
  // in component state. Because App renders the Workouts tab via a switch,
  // navigating to another bottom-nav tab, reloading, logging out, or the browser
  // evicting a backgrounded tab unmounts WorkoutTracker and used to wipe a
  // half-finished session — forcing the client to start over. We mirror the
  // active session into localStorage (keyed per user) so it survives an unmount
  // and is restored on the next mount. The timer is derived from start/pause
  // timestamps, so elapsed time and calories stay correct across a reload with
  // no extra bookkeeping.
  const workoutDraftKey = `workoutDraft_${localStorage.getItem('userId') || loggedInUser}`;
  const loadWorkoutDraft = () => {
    try {
      const raw = localStorage.getItem(workoutDraftKey);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      return draft && draft.isLoggingWorkout ? draft : null;
    } catch (e) {
      return null;
    }
  };
  const [savedWorkoutDraft] = useState(loadWorkoutDraft);
  // Canonical DB user id, resolved async on mount — needed to save/load/clear
  // this client's workout_drafts row (the DB copy of the same in-progress
  // session, which is what survives being away from the app/device and is
  // what the Home tab's "Resume Workout" banner reads).
  const [ownUserId, setOwnUserId] = useState(null);

  // Custom on-screen number pad for the set-logging table's weight/reps/km/
  // time fields — see utils/setInputUtils.js for why this replaced the
  // native mobile keyboard entirely.
  const { activeKey: activeSetKey, registerField: registerSetField, openField: openSetField, closeField: closeSetField, getActiveField: getActiveSetField } = useSetNumberPad();

  const [activeView, setActiveView] = useState(savedWorkoutDraft ? 'log' : 'analytics'); // 'analytics', 'log', or 'programs'
  const [sessions, setSessions] = useState([]);
  const [clientProfiles, setClientProfiles] = useState([]);
  const [selectedClient, setSelectedClient] = useState(loggedInUser);
  // Coach-set program length (clients.total_sessions) for the logged-in client.
  // This is the source of truth for the session total, overriding the legacy
  // mock package counts so the Workout tab matches the client home card.
  const [coachSetTotalSessions, setCoachSetTotalSessions] = useState(null);
  // DB-backed completed-session count (distinct workout_logs dates) for the
  // logged-in client — same source as the home progress card, so the two
  // surfaces agree on "Completed".
  const [dbCompletedSessions, setDbCompletedSessions] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState('Shoulders Press');

  // Custom templates and plans state
  const [isLoggingWorkout, setIsLoggingWorkout] = useState(!!savedWorkoutDraft);

  // First-login spotlight tour — advance the shared step whenever the real
  // navigation state it's watching for actually changes. See TourOverlay.jsx
  // for what each step highlights.
  const tour = useTour();
  useEffect(() => {
    if (activeView === 'templates') tour.advanceIfStep(2, 3);
    if (activeView === 'log') tour.advanceIfStep(4, 5);
  }, [activeView, tour]);
  useEffect(() => {
    if (isLoggingWorkout) tour.advanceIfStep(5, 6);
  }, [isLoggingWorkout, tour]);
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(savedWorkoutDraft?.saveAsTemplate ?? false);
  const [templateName, setTemplateName] = useState(savedWorkoutDraft?.templateName ?? '');
  // Name the saved-template will use — editable in the finish summary so the
  // client can give the reusable template its own name instead of being
  // locked to the session's workout name. Empty = fall back to the workout
  // name (then a dated default).
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [workoutSource, setWorkoutSource] = useState(savedWorkoutDraft?.workoutSource ?? 'self'); // 'self' | 'coach'
  // Generic workout templates (Push/Pull/Leg)
  const [genericTemplates, setGenericTemplates] = useState([]);
  const [activeTemplateName, setActiveTemplateName] = useState(savedWorkoutDraft?.activeTemplateName ?? '');

  // Generic (non-coach) starter workout templates — always available, regardless of coach_id.
  const [defaultTemplates, setDefaultTemplates] = useState([]);
  const [loadingDefaultTemplates, setLoadingDefaultTemplates] = useState(false);
  const [selectedDefaultTemplateId, setSelectedDefaultTemplateId] = useState('');

  // Generic workout library, filtered by difficulty level (Beginner/Intermediate/Advanced)
  const [genericLevel, setGenericLevel] = useState('beginner');
  const [levelWorkouts, setLevelWorkouts] = useState([]);
  const [loadingLevelWorkouts, setLoadingLevelWorkouts] = useState(false);
  // Library list is collapsed to the first few programs with a "Show all N"
  // expander (resets when switching level tabs).
  const [showAllLevelWorkouts, setShowAllLevelWorkouts] = useState(false);
  // Set type popup menu: { exIdx, sIdx } when open, null when closed
  const [setTypeMenu, setSetTypeMenu] = useState(null);
  // Whether this client is actually connected to a coach. Initialized from the
  // localStorage cache for fast paint (guarding against the literal string
  // "null"/"undefined" left by legacy writes), then reconciled against the DB
  // connection record on mount — same source of truth as the home card. Gates
  // every coaching-only surface (billing/session accounting, coach's plan) so a
  // generic/unconnected client never sees them.
  const storedCoachId = localStorage.getItem('userCoachId');
  const [hasCoachAssigned, setHasCoachAssigned] = useState(
    () => !!(storedCoachId && storedCoachId !== 'null' && storedCoachId !== 'undefined')
  );

  useEffect(() => {
    const loadDefaultTemplates = async () => {
      setLoadingDefaultTemplates(true);
      try {
        const templates = await databaseService.getDefaultWorkoutTemplates();
        setDefaultTemplates(templates || []);
        if (templates && templates.length > 0) {
          setSelectedDefaultTemplateId(prev => prev || templates[0].id);
        }
      } catch (e) {
        console.error('Error fetching default workout templates:', e);
      } finally {
        setLoadingDefaultTemplates(false);
      }
    };
    loadDefaultTemplates();
  }, []);

  // Load the difficulty-leveled generic workout library whenever the selected level changes
  useEffect(() => {
    let cancelled = false;
    const loadLevelWorkouts = async () => {
      setLoadingLevelWorkouts(true);
      try {
        const workouts = await databaseService.getGenericWorkoutsByLevel(genericLevel);
        if (!cancelled) setLevelWorkouts(workouts || []);
      } catch (e) {
        console.error('Error fetching generic workouts by level:', e);
        if (!cancelled) setLevelWorkouts([]);
      } finally {
        if (!cancelled) setLoadingLevelWorkouts(false);
      }
    };
    loadLevelWorkouts();
    return () => { cancelled = true; };
  }, [genericLevel]);

  // Coaches pick a client by name from their roster; a client viewing their own workouts
  // should be keyed by their real account id, not a (possibly non-unique) display name —
  // a shared name like the "Warrior" default would otherwise merge plans across accounts.
  const getPlanOwnerId = () => {
    if (isTrainer(localStorage.getItem('userEmail'))) return selectedClient;
    return localStorage.getItem('userId') || selectedClient;
  };

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const plans = await databaseService.getWorkoutPlansForUser(getPlanOwnerId());
      setClientPlans(plans || []);
    } catch (e) {
      console.error('Error fetching client plans:', e);
    } finally {
      setLoadingPlans(false);
    }
  };

  // Load generic templates on mount
  useEffect(() => {
    databaseService.getDefaultWorkoutTemplates().then(tpls => {
      setGenericTemplates(tpls || []);
    }).catch(() => {
      setGenericTemplates(databaseService.BUILTIN_TEMPLATES);
    });
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [selectedClient]);

  useEffect(() => {
    if (!setTypeMenu) return;
    const close = () => setSetTypeMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [setTypeMenu]);
  const [chartMetric, setChartMetric] = useState('weight'); // 'weight' or 'volume'
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(4);
  const [timeframe, setTimeframe] = useState('monthly'); // 'weekly' or 'monthly'
  const [toastMessage, setToastMessage] = useState('');
  const [historyExpandedDate, setHistoryExpandedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // 0-indexed month
  });

  // Payment Gateway Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentProgram, setPaymentProgram] = useState(null);
  const [paymentTab, setPaymentTab] = useState('card'); // 'card' or 'upi'
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  // Hevy Workout Tracker States — timer state machine matches the coach Live
  // Log exactly: idle until the first set is marked done, then running/paused
  // via explicit control. Duration and calories are always recomputed fresh
  // from these timestamps (never an incrementing counter), same as the coach.
  const [workoutTimerStatus, setWorkoutTimerStatus] = useState(savedWorkoutDraft?.workoutTimerStatus ?? 'idle'); // 'idle' | 'running' | 'paused'
  const [workoutTimerStartedAt, setWorkoutTimerStartedAt] = useState(savedWorkoutDraft?.workoutTimerStartedAt ?? null);
  const [workoutPauseIntervals, setWorkoutPauseIntervals] = useState(savedWorkoutDraft?.workoutPauseIntervals ?? []); // [{ pausedAt, resumedAt }]
  const [, forceWorkoutTimerTick] = useState(0);
  // Derived, not stored — every read site below (Finish summary, live badge,
  // billing, stopwatch display) keeps using this name/shape unchanged.
  const workoutActiveSeconds = computeElapsedSeconds(workoutTimerStartedAt, workoutPauseIntervals);
  const [showExerciseDbModal, setShowExerciseDbModal] = useState(false);
  const [showFinishSummary, setShowFinishSummary] = useState(false);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [restTimerActive, setRestTimerActive] = useState(false);
  // Rest start/end used to be announced with a toast; now the floating rest
  // timer card itself blinks instead — bumping this key forces React to
  // remount the card so its CSS blink animation replays every time (a class
  // toggle alone wouldn't restart an already-applied animation).
  const [restPulseKey, setRestPulseKey] = useState(0);
  // True for a short window right after the countdown hits 0 — swaps the
  // card to a "Rest over" blink instead of vanishing instantly.
  const [restJustFinished, setRestJustFinished] = useState(false);
  const [summaryStats, setSummaryStats] = useState(null);
  // Post-save share card (client self-logged sessions only — see
  // handleConfirmSaveWorkout) — the "Session Finished" confirmation above is
  // shown BEFORE the save, so duration/calories/PRs aren't final there yet.
  const [shareCardData, setShareCardData] = useState(null);
  // Routine picker (Log Sets → Start Workout Session) — "View all" toggle per section.
  const [showAllCoachPlans, setShowAllCoachPlans] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [activeGuideExercise, setActiveGuideExercise] = useState(null);
  const [historyModalExercise, setHistoryModalExercise] = useState(null);
  // Timed exercise stopwatches: { "exIdx,sIdx": { isRunning, startedAt, pausedDuration } }
  const [setTimers, setSetTimers] = useState({});
  const [, forceSetTimerTick] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);

  useEffect(() => {
    databaseService.getExerciseLibrary().then(setExercisesList).catch(err => console.error(err));
  }, []);

  const [showUntickedFinishModal, setShowUntickedFinishModal] = useState(false);
  const [showDiscardConfirmModal, setShowDiscardConfirmModal] = useState(false);
  // Rest/warmup timer popup (ClockTimerModal) — same utility as the coach's
  // Live Log, purely a stopwatch/timer overlay, no data saved.
  const [showClockTimer, setShowClockTimer] = useState(false);

  // Coach Log Form States
  const [logClient, setLogClient] = useState(savedWorkoutDraft?.logClient ?? loggedInUser);
  const [logDate, setLogDate] = useState(savedWorkoutDraft?.logDate ?? getLocalDateString());
  const [logExercises, setLogExercises] = useState(savedWorkoutDraft?.logExercises ?? [
    { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
    { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
    { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
    { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
  ]);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('userName') || 'Warrior';
    const loggedInKey = loggedInUser.toLowerCase().replace(/\s+/g, '');

    // ─── Hydrate sessions: merge global + client-specific + coach-logged ───
    const mergeAndDedupeSessions = (base, extra) => {
      // Primary dedup: by session ID
      const seenIds = new Set(base.map(s => s.id).filter(Boolean));
      // Fallback dedup: by date + clientName + sorted exercise names
      const seenKeys = new Set(base.map(s =>
        `${s.date}|${(s.clientName||'').toLowerCase()}|${(s.exercises||[]).map(e=>e.name).sort().join(',')}`
      ));
      const merged = [...base];
      extra.forEach(s => {
        const hasId = Boolean(s.id);
        const key = `${s.date}|${(s.clientName||'').toLowerCase()}|${(s.exercises||[]).map(e=>e.name).sort().join(',')}`;
        if ((hasId && seenIds.has(s.id)) || seenKeys.has(key)) return; // skip duplicate
        if (hasId) seenIds.add(s.id);
        seenKeys.add(key);
        merged.push(s);
      });
      return merged;
    };

    let allSessions = [];
    // 1. Load global workoutSessions
    const stored = localStorage.getItem('workoutSessions');
    if (stored) {
      try { allSessions = JSON.parse(stored); } catch(e) { allSessions = []; }
    }
    // 2. Merge client-specific coach-logged sessions for logged-in user
    const clientSpecificRaw = localStorage.getItem(`client_${loggedInKey}_workoutSessions`);
    if (clientSpecificRaw) {
      try {
        const clientSpecific = JSON.parse(clientSpecificRaw);
        allSessions = mergeAndDedupeSessions(allSessions, clientSpecific);
      } catch(e) {}
    }
    // 3. Scan all keys for any coach-logged sessions for this user
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('client_') && key.endsWith('_workoutSessions') && key !== `client_${loggedInKey}_workoutSessions`) {
        try {
          const partSessions = JSON.parse(localStorage.getItem(key) || '[]');
          const relevant = partSessions.filter(s =>
            s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === loggedInKey
          );
          if (relevant.length > 0) allSessions = mergeAndDedupeSessions(allSessions, relevant);
        } catch(e) {}
      }
    }

    if (allSessions.length > 0) {
      localStorage.setItem('workoutSessions', JSON.stringify(allSessions));
      setSessions(allSessions);
      setSelectedSessionIndex(allSessions.length - 1);
    } else {
      if (loggedInUser.toLowerCase() === 'sridhar') {
        localStorage.setItem('workoutSessions', JSON.stringify(defaultHistoricalSessions));
        setSessions(defaultHistoricalSessions);
        setSelectedSessionIndex(defaultHistoricalSessions.length - 1);
      } else {
        localStorage.setItem('workoutSessions', JSON.stringify([]));
        setSessions([]);
        setSelectedSessionIndex(-1);
      }
    }

    // Hydrate profiles
    const storedProfiles = localStorage.getItem('workoutClientProfiles');
    if (storedProfiles) {
      const parsedProfiles = JSON.parse(storedProfiles);
      const hasProfile = parsedProfiles.some(p => p.clientName.toLowerCase() === loggedInUser.toLowerCase());
      if (!hasProfile) {
        const onboardingGoal = localStorage.getItem('userGoal') || 'Gut Fix';
        let programName = 'Body Weights & Dumbbells';
        if (onboardingGoal.includes('Fat Loss')) programName = 'Caloric Deficit Conditioning';
        else if (onboardingGoal.includes('Muscle Building')) programName = 'Hypertrophy Surge';
        const matchedProg = availablePrograms.find(ap => ap.name === programName) || availablePrograms[0];
        parsedProfiles.unshift({ clientName: loggedInUser, activeProgram: matchedProg.name, totalSessions: matchedProg.sessions });
        localStorage.setItem('workoutClientProfiles', JSON.stringify(parsedProfiles));
      }
      setClientProfiles(parsedProfiles);
    } else {
      const onboardingGoal = localStorage.getItem('userGoal') || 'Gut Fix';
      let programName = 'Body Weights & Dumbbells';
      if (onboardingGoal.includes('Fat Loss')) programName = 'Caloric Deficit Conditioning';
      else if (onboardingGoal.includes('Muscle Building')) programName = 'Hypertrophy Surge';
      const matchedProg = availablePrograms.find(ap => ap.name === programName) || availablePrograms[0];
      const freshProfiles = [
        { clientName: loggedInUser, activeProgram: matchedProg.name, totalSessions: matchedProg.sessions },
        { clientName: 'Sridhar', activeProgram: 'Body Weights & Dumbbells', totalSessions: 12 },
        { clientName: 'Generic Client', activeProgram: 'Hypertrophy Surge', totalSessions: 24 }
      ];
      localStorage.setItem('workoutClientProfiles', JSON.stringify(freshProfiles));
      setClientProfiles(freshProfiles);
    }

    // Pull the coach-set program length for this client so the session total
    // matches what the coach configured (and the client home progress card).
    databaseService.getOwnCoachConnection().then(conn => {
      setHasCoachAssigned(conn.connected);
      if (conn.connected && Number.isFinite(conn.totalSessions) && conn.totalSessions > 0) {
        setCoachSetTotalSessions(conn.totalSessions);
      } else {
        setCoachSetTotalSessions(null);
      }
    }).catch(() => {});

    // Completed count = distinct workout_logs dates (identical to the home card).
    // Also rebuild the analytics sessions from the DB (the source of truth) so
    // the progression graph + Workout History match the home screen instead of
    // stale localStorage — the localStorage store can lag behind coach-logged
    // sessions and miss exercises entirely.
    //
    // SECURITY: must be the real public.users.id (UUID), never a display name.
    // getWorkoutLogsForUser used to accept a name and resolve it via an
    // ambiguous "first match" DB lookup — since many clients share the
    // placeholder name "Warrior", this could return a different client's
    // private logs. It now fails closed on a non-UUID, but resolveUserId()
    // (self-healing, retried) is used here instead of a raw synchronous
    // localStorage read so this client's own data still loads reliably.
    const loadOwnDbLogs = async (attemptsLeft = 4) => {
      const ownKey = await databaseService.resolveUserId();
      if (!ownKey) {
        if (attemptsLeft <= 0) return { ownKey: null, logs: [] };
        await new Promise(r => setTimeout(r, 3000));
        return loadOwnDbLogs(attemptsLeft - 1);
      }
      return { ownKey, logs: await databaseService.getWorkoutLogsForUser(ownKey) };
    };
    loadOwnDbLogs().then(({ ownKey, logs }) => {
      const rows = logs || [];
      setDbCompletedSessions(new Set(rows.map(l => l.log_date)).size);
      const dbDates = new Set(rows.map(l => l.log_date));

      if (rows.length > 0) {
        // Group flat log rows into one session per date → { exercises:[{name,sets}] }
        const byDate = {};
        rows.forEach(l => {
          const d = l.log_date;
          if (!byDate[d]) byDate[d] = { id: `db-${d}`, clientName: loggedInUser, date: d, planName: l.plan_name || 'Logged Session', durationSeconds: null, caloriesBurned: null, exMap: {} };
          // Session duration/calories are duplicated onto every row of the
          // session (workout_logs has no session-level row) — take the first
          // non-null value seen for this date so the history card can show them.
          if (l.duration_seconds != null && byDate[d].durationSeconds == null) byDate[d].durationSeconds = l.duration_seconds;
          if (l.calories_burned != null && byDate[d].caloriesBurned == null) byDate[d].caloriesBurned = l.calories_burned;
          const ex = l.exercise_name;
          if (!byDate[d].exMap[ex]) byDate[d].exMap[ex] = [];
          // distance_km present = real cardio; cardio_duration_seconds present
          // without distance_km = a timed hold (plank etc.) reusing that column
          // (see databaseService.saveWorkoutSession) — else a normal reps/weight set.
          byDate[d].exMap[ex].push(
            l.distance_km != null
              ? { distanceKm: l.distance_km, time: formatSecondsToTimeString(l.cardio_duration_seconds), setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
              : l.cardio_duration_seconds != null
              ? { time: formatSecondsToTimeString(l.cardio_duration_seconds), setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
              : { reps: l.reps, weight: l.weight_kg, setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
          );
        });
        const dbSessions = Object.values(byDate).map(s => ({
          id: s.id, clientName: s.clientName, date: s.date, planName: s.planName,
          durationSeconds: s.durationSeconds, caloriesBurned: s.caloriesBurned,
          exercises: Object.entries(s.exMap).map(([name, sets]) => ({ name, sets }))
        }));
        // DB is authoritative per date; keep any local-only (unsynced) dates too.
        const localOnly = allSessions.filter(s => !dbDates.has(s.date));
        const merged = [...localOnly, ...dbSessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        setSessions(merged);
        setSelectedSessionIndex(merged.length - 1);
      }

      // Self-healing resync: a local session for THIS device's own account
      // that never reached workout_logs (the exact silent failure mode
      // saveWorkoutSession had before it could resolve a deterministic
      // clientId — see newSession in handleConfirmSaveWorkout). Retried here,
      // quietly, with that same clientId now supplied, so it lands instead of
      // repeating whatever ambiguous lookup likely caused it to go missing.
      // Scoped tightly: only this user's own sessions (never a stray
      // other-client entry from legacy local multi-client storage), only
      // dates truly absent from the DB, and only ones that actually have set
      // data to save. Used to also exclude source==='coach' sessions —
      // those needed this retry MOST (see the clientId fix above), so that
      // exclusion just meant a client's finished coach-assigned workout
      // could never self-heal into the DB even after the underlying bug was
      // fixed for new sessions.
      if (ownKey) {
        allSessions
          .filter(s =>
            s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === loggedInKey &&
            !dbDates.has(s.date) &&
            (s.exercises || []).some(ex => (ex.sets || []).length > 0)
          )
          .forEach(s => {
            databaseService.saveWorkoutSession({ ...s, clientId: ownKey }).catch(() => {});
          });
      }
    }).catch(() => {});

    fetchPlans();
  }, []);

  // Keep the graphed exercise on one the client has actually logged, so the
  // progression chart is never empty while sessions exist (e.g. the default
  // "Shoulders Press" when the client only logged chest/arm work).
  useEffect(() => {
    const names = [...new Set(
      sessions
        .filter(s => s.clientName && s.clientName.toLowerCase() === selectedClient.toLowerCase())
        .flatMap(s => (s.exercises || []).map(e => e.name))
    )];
    if (names.length > 0 && !names.some(n => n.toLowerCase() === selectedExercise.toLowerCase())) {
      setSelectedExercise(names[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, selectedClient]);

  // Hevy stopwatch — re-render once a second while running so the displayed
  // elapsed time / calories stay current. Values are always recomputed fresh
  // from timestamps above (never an incrementing counter), matching the
  // coach's live timer bar exactly. No more force-starting the clock just
  // from being on the Log Sets tab — it now only starts on the first
  // completed set (see handleToggleSetCompleted), same as the coach.
  useEffect(() => {
    if (workoutTimerStatus !== 'running') return;
    const id = setInterval(() => forceWorkoutTimerTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [workoutTimerStatus]);

  // Set timers for timed exercises — re-render every 100ms for smooth UI
  useEffect(() => {
    const anyRunning = Object.values(setTimers).some(t => t.isRunning);
    if (!anyRunning) return;
    const id = setInterval(() => forceSetTimerTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [setTimers]);

  const resetWorkoutTimer = () => {
    setWorkoutTimerStatus('idle');
    setWorkoutTimerStartedAt(null);
    setWorkoutPauseIntervals([]);
  };

  // Wipe the in-progress session and go back to the log picker. Shared by the
  // "empty sets" warning modal and the always-available discard button next
  // to Save — both need the exact same reset (timer, draft row, exercise
  // list) so a session can't be half-cleared by one path and not the other.
  const handleDiscardWorkout = () => {
    resetWorkoutTimer();
    setIsLoggingWorkout(false);
    setTemplateName('');
    setWorkoutSource('self');
    if (ownUserId) databaseService.deleteWorkoutDraft(ownUserId);
    setLogExercises([
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
    ]);
    setSetTimers({});
    setActiveView('analytics');
    triggerToast('🗑️ Workout session discarded.');
  };

  // Resolve this client's canonical DB id once on mount, then reconcile with
  // whatever's in workout_drafts for them. The DB row wins whenever it's
  // newer than (or the only) local draft — e.g. this is a different device,
  // or localStorage was cleared, or the client force-closed the app before
  // the local mirror below ever ran.
  useEffect(() => {
    let cancelled = false;
    databaseService.resolveUserId().then(id => {
      if (cancelled || !id) return;
      setOwnUserId(id);
      databaseService.getWorkoutDraft(id).then(dbDraft => {
        // Only ever auto-load a draft this client started themselves. A
        // 'coach' draft means the coach's Live Log is actively editing that
        // same session right now — pulling it into the client's own form too
        // would let both sides edit it concurrently and stomp each other's
        // saves (last debounced write wins, silently dropping sets).
        if (cancelled || !dbDraft || dbDraft.source === 'coach') return;
        const dbTime = dbDraft.updatedAt ? new Date(dbDraft.updatedAt).getTime() : 0;
        const localTime = savedWorkoutDraft?.savedAt || 0;
        if (!savedWorkoutDraft || dbTime > localTime) {
          if (dbDraft.exercises && dbDraft.exercises.length > 0) setLogExercises(dbDraft.exercises);
          setSetTimers({});
          if (dbDraft.logDate) setLogDate(dbDraft.logDate);
          setTemplateName(dbDraft.planName || '');
          setWorkoutSource(dbDraft.source === 'coach' ? 'coach' : 'self');
          setWorkoutTimerStatus(dbDraft.timerStatus || 'idle');
          setWorkoutTimerStartedAt(dbDraft.timerStartedAt ?? null);
          setWorkoutPauseIntervals(dbDraft.pauseIntervals || []);
          setIsLoggingWorkout(true);
          setActiveView('log');
        }
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftSaveTimerRef = useRef(null);

  // Mirror the active logging session into localStorage on every change so it
  // survives an unmount (tab switch / reload / logout), and clear it the moment
  // the session ends (finish or discard sets isLoggingWorkout back to false).
  // Also debounce-push the same session to workout_drafts in the DB — that
  // copy is what survives being away from the device entirely (backgrounded
  // for 15-20 min, different device) and what the Home tab's "Resume
  // Workout" banner reads. Debounced so typing a weight/rep doesn't fire a
  // request per keystroke; a completed-set tick still lands within ~1.2s.
  useEffect(() => {
    if (isLoggingWorkout) {
      try {
        localStorage.setItem(workoutDraftKey, JSON.stringify({
          isLoggingWorkout: true,
          logExercises,
          logClient,
          logDate,
          templateName,
          activeTemplateName,
          saveAsTemplate,
          workoutTimerStatus,
          workoutTimerStartedAt,
          workoutPauseIntervals,
          savedAt: Date.now()
        }));
      } catch (e) {
        // Quota/serialization failure shouldn't break the live session.
      }

      if (ownUserId) {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = setTimeout(() => {
          databaseService.saveWorkoutDraft({
            userId: ownUserId,
            coachId: null,
            source: workoutSource,
            planName: templateName,
            logDate,
            exercises: logExercises,
            timerStatus: workoutTimerStatus,
            timerStartedAt: workoutTimerStartedAt,
            pauseIntervals: workoutPauseIntervals
          });
        }, 1200);
      }
    } else {
      localStorage.removeItem(workoutDraftKey);
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggingWorkout, logExercises, logClient, logDate, templateName, activeTemplateName, saveAsTemplate, workoutTimerStatus, workoutTimerStartedAt, workoutPauseIntervals, ownUserId, workoutSource]);

  const handlePauseWorkoutTimer = () => {
    if (workoutTimerStatus !== 'running') return;
    setWorkoutPauseIntervals(prev => [...prev, { pausedAt: Date.now(), resumedAt: null }]);
    setWorkoutTimerStatus('paused');
    // Pausing the whole session should also freeze any cardio set actively
    // running underneath it — otherwise that stopwatch (and its live
    // calories) kept ticking on its own even though the session clock
    // itself had stopped.
    logExercises.forEach((ex, exIdx) => {
      if (!isCardioExercise(ex.name)) return;
      ex.sets.forEach((set, sIdx) => {
        const timer = setTimers[getSetTimerKey(exIdx, sIdx)];
        if (timer?.isRunning) handleCardioStopwatchPause(exIdx, sIdx);
      });
    });
  };

  const handleResumeWorkoutTimer = () => {
    if (workoutTimerStatus !== 'paused') return;
    setWorkoutPauseIntervals(prev => {
      const copy = [...prev];
      const openIdx = copy.map(p => p.resumedAt).lastIndexOf(null);
      if (openIdx !== -1) copy[openIdx] = { ...copy[openIdx], resumedAt: Date.now() };
      return copy;
    });
    setWorkoutTimerStatus('running');
  };

  useEffect(() => {
    let interval = null;
    if (restTimerActive && restSecondsRemaining > 0) {
      interval = setInterval(() => {
        setRestSecondsRemaining(prev => {
          if (prev <= 1) {
            // Swap to the "Rest over" blink instead of a toast, then let the
            // card linger just long enough to actually be seen blinking
            // before it clears itself.
            setRestJustFinished(true);
            setRestPulseKey(k => k + 1);
            playAlarmBeeps(1);
            setTimeout(() => {
              setRestTimerActive(false);
              setRestJustFinished(false);
            }, 2200);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [restTimerActive, restSecondsRemaining]);

  // Listen for coach live-session saves and merge new sessions in real-time
  useEffect(() => {
    const onCoachSaved = (e) => {
      const { session } = e.detail || {};
      if (!session) return;
      setSessions(prev => {
        const alreadyExists = prev.some(s => s.id === session.id);
        if (alreadyExists) return prev;
        const updated = [...prev, session];
        localStorage.setItem('workoutSessions', JSON.stringify(updated));
        return updated;
      });
      setHistoryExpandedDate(session.id); // auto-expand the new session
    };
    window.addEventListener('workoutSessionsUpdated', onCoachSaved);
    return () => window.removeEventListener('workoutSessionsUpdated', onCoachSaved);
  }, []);

  const formatStopwatchTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs > 0 ? String(hrs).padStart(2, '0') : null,
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0')
    ].filter(Boolean).join(':');
  };

  const getPreviousSessionSet = (exName, setIdx) => {
    const clientHistory = sessions
      .filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase())
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (clientHistory.length > 0) {
      for (const session of clientHistory) {
        const exercise = session.exercises.find(e => e.name.toLowerCase() === exName.toLowerCase());
        if (exercise && exercise.sets && exercise.sets[setIdx]) {
          const set = exercise.sets[setIdx];
          if (isCardioExercise(exName)) {
            if (!set.distanceKm) return '—';
            return `${set.distanceKm}km${set.time ? ` · ${set.time}` : ''}`;
          }
          if (isTimedExercise(exName)) {
            return set.time || '—';
          }
          return `${set.weight}${getExerciseUnit(exName)} x ${set.reps}`;
        }
      }
    }
    return '—';
  };

  const handleToggleSetCompleted = (exerciseIndex, setIndex) => {
    // Real click, right here — unlocks audio for the rest timer's alarm,
    // which fires later from a setInterval tick (see alarmSound.js).
    unlockAudio();
    const now = Date.now();
    // First completed set of an idle session = the client has started working
    // out. Notify their coach once, at that transition. Only for a client
    // logging their own session (not the coach's own Live Log path). Fall back
    // to the cached userId so a not-yet-resolved ownUserId doesn't drop it.
    const togglingSetOn = !logExercises[exerciseIndex]?.sets[setIndex]?.isCompleted;
    const clientId = ownUserId || localStorage.getItem('userId');
    if (workoutTimerStatus === 'idle' && togglingSetOn && clientId && workoutSource !== 'coach') {
      // Same workoutName field the "completed" notification already sends
      // (see handleConfirmSaveWorkout below) — the server just wasn't using
      // it for either event until now (see api/push.js).
      notifyEvent('workout_started', { clientUserId: clientId, workoutName: templateName?.trim() || null });
    }
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx === setIndex) {
              const nextState = !s.isCompleted;
              if (nextState) {
                setRestSecondsRemaining(60);
                setRestTimerActive(true);
                setRestJustFinished(false);
                setRestPulseKey(k => k + 1);
              }
              // completedAt is what the live calorie calc's rest-interval math
              // uses — never cleared retroactively except when this exact set
              // is unchecked, so re-checking it later is timed fresh.
              return { ...s, isCompleted: nextState, completedAt: nextState ? now : null };
            }
            return s;
          })
        };
      }
      return ex;
    }));
    // Logging real work is what starts the session clock — matches the coach.
    setWorkoutTimerStatus(prevStatus => {
      if (prevStatus === 'idle') {
        setWorkoutTimerStartedAt(now);
        return 'running';
      }
      return prevStatus;
    });
  };

  const saveSessionsToLocal = (newSessions) => {
    localStorage.setItem('workoutSessions', JSON.stringify(newSessions));
    setSessions(newSessions);

    // Sync the completed workout session with the database. This used to be
    // fire-and-forget with no .catch() at all — any failure here (RLS blip,
    // expired token, network hiccup) became a silent unhandled rejection: the
    // session already looked "saved" locally (state/localStorage updated
    // above), so the client had no idea their workout never reached
    // workout_logs. That's how a client could finish and "submit" a workout
    // that then never showed up in their own summary or the coach's
    // dashboard, with no calories/duration either (nothing to read them from
    // — see line ~1030's self-heal retry, which only runs on the NEXT app
    // load and only helps if the client reopens the app). One automatic
    // retry, then a visible toast so the client knows to try again instead
    // of assuming it's fine.
    if (newSessions.length > 0) {
      const latestSession = newSessions[newSessions.length - 1];
      databaseService.saveWorkoutSession(latestSession).then(() => {
        // Tell any other already-mounted view (Home's WorkoutProgressDashboard,
        // in particular — it only loads workout_logs on its own mount and
        // otherwise has no way to know a session was just written) to refetch
        // now that the row is actually in the DB. Without this, a client who
        // saves a workout and immediately checks their Home tab's "This
        // Week's Sessions" could still see it as empty/stale — the same event
        // TrainerDashboard already fires after a coach's Live Log save.
        window.dispatchEvent(new CustomEvent('workoutSessionsUpdated', { detail: { session: latestSession } }));
      }).catch(async (firstErr) => {
        console.warn('Workout session save failed once, retrying automatically:', firstErr?.message || firstErr);
        try {
          await databaseService.saveWorkoutSession(latestSession);
          window.dispatchEvent(new CustomEvent('workoutSessionsUpdated', { detail: { session: latestSession } }));
        } catch (err) {
          console.error('Workout session save failed after retry:', err);
          triggerToast("⚠️ Couldn't sync this workout to the server. Please check your connection — it's saved on this device and will sync when reopened.");
        }
      });
    }
  };

  const saveProfilesToLocal = (newProfiles) => {
    localStorage.setItem('workoutClientProfiles', JSON.stringify(newProfiles));
    setClientProfiles(newProfiles);
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Get active client profile
  const baseProfile = clientProfiles.find(
    p => p.clientName.toLowerCase() === selectedClient.toLowerCase()
  ) || { clientName: selectedClient, activeProgram: 'Custom Program', totalSessions: 12 };

  // For the logged-in client's own profile, the coach-set total_sessions is
  // authoritative — override the legacy mock count so Billing Tracker and the
  // Client Profile summary show the same total as the home progress card.
  const isOwnProfile = selectedClient.toLowerCase() === loggedInUser.toLowerCase();
  const activeProfile = (isOwnProfile && coachSetTotalSessions != null)
    ? { ...baseProfile, totalSessions: coachSetTotalSessions }
    : baseProfile;

  // The client's own goal, exactly as chosen in the onboarding wizard
  // (localStorage 'userGoal' = 'Fat Loss' | 'Muscle Building' | 'Gut Health' /
  // 'Gut Fix'). This is what the client recognizes — the mapped mock program
  // name ('Body Weights & Dumbbells' etc.) is meaningless to them.
  const clientGoal = (localStorage.getItem('userGoal') || '').trim();

  // Sessions count calculations
  const clientSessions = sessions
    .filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // For the logged-in client, "Completed" mirrors the home card's DB-backed
  // distinct-date count; other (coach-viewed) profiles keep the local count.
  const completedSessionsCount = (isOwnProfile && dbCompletedSessions != null)
    ? dbCompletedSessions
    : clientSessions.length;
  const remainingSessionsCount = Math.max(0, activeProfile.totalSessions - completedSessionsCount);
  // A connected client's session package total is only real once the coach has
  // actually assigned one (clients.total_sessions). Until then we must NOT show
  // the legacy mock number (12/20/24…) as if it were the coach's plan — the
  // count is "Unassigned". Coach-viewed roster profiles keep their own total.
  const hasAssignedSessions = isOwnProfile
    ? (coachSetTotalSessions != null && coachSetTotalSessions > 0)
    : true;
  // Renewal warning is coaching-package specific — only for connected clients
  // (or a coach viewing one) who actually have an assigned package running low,
  // never a generic/unconnected client or one with no coach-set count yet.
  const showPaymentAlert = (hasCoachAssigned || isTrainer(localStorage.getItem('userEmail'))) && hasAssignedSessions && remainingSessionsCount <= 3;

  const displayedSessions = timeframe === 'weekly' 
    ? clientSessions.slice(-3) 
    : clientSessions;

  // Sync selected index boundaries
  useEffect(() => {
    if (displayedSessions.length > 0 && selectedSessionIndex >= displayedSessions.length) {
      setSelectedSessionIndex(displayedSessions.length - 1);
    }
  }, [displayedSessions, selectedSessionIndex]);

  // Exercise unit helper
  const getExerciseUnit = (exName) => {
    if (exName.toLowerCase().includes('lat pull') || exName.toLowerCase().includes('plate')) {
      return 'plates';
    }
    return 'kg';
  };

  // Extract graph dataset
  const graphData = displayedSessions.map((session, index) => {
    const exercise = session.exercises.find(
      e => e.name.toLowerCase() === selectedExercise.toLowerCase()
    );

    if (!exercise || exercise.sets.length === 0) {
      return { date: session.date, weight: 0, volume: 0, sets: [], index };
    }

    const weights = exercise.sets.map(s => parseFloat(s.weight) || 0);
    const maxWeight = Math.max(...weights);
    const totalVolume = exercise.sets.reduce((sum, s) => sum + ((s.reps || 0) * (parseFloat(s.weight) || 0)), 0);

    return {
      date: session.date,
      weight: parseFloat(maxWeight.toFixed(2)),
      volume: parseFloat(totalVolume.toFixed(2)),
      sets: exercise.sets,
      index
    };
  }).filter(d => d.weight > 0 || d.volume > 0);

  const activeSessionData = graphData.find(d => d.index === selectedSessionIndex) || graphData[graphData.length - 1] || null;

  // Overload calculations
  const getOverloadMetrics = () => {
    if (!activeSessionData || activeSessionData.index === 0) return null;
    
    const prevSessionData = graphData.find(d => d.index === activeSessionData.index - 1);
    if (!prevSessionData) return null;

    const weightDiff = activeSessionData.weight - prevSessionData.weight;
    const volumeDiff = activeSessionData.volume - prevSessionData.volume;

    return {
      overloadAchieved: weightDiff > 0 || volumeDiff > 0,
      weightDiff: parseFloat(weightDiff.toFixed(2)),
      volumeDiff: parseFloat(volumeDiff.toFixed(2))
    };
  };

  const overload = getOverloadMetrics();

  // SVG calculations
  const width = 500;
  const height = 200;
  const padding = 35;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  let pathPoints = '';
  let areaPoints = '';
  const yValues = graphData.map(d => chartMetric === 'weight' ? d.weight : d.volume);
  const maxY = Math.max(...yValues, 5) * 1.15;
  const minY = Math.min(...yValues, 0) * 0.9;

  if (graphData.length > 0) {
    graphData.forEach((d, idx) => {
      const val = chartMetric === 'weight' ? d.weight : d.volume;
      const x = padding + (idx / Math.max(graphData.length - 1, 1)) * chartWidth;
      const y = padding + chartHeight - ((val - minY) / Math.max(maxY - minY, 1)) * chartHeight;
      
      if (idx === 0) {
        pathPoints += `M ${x} ${y}`;
        areaPoints += `M ${x} ${padding + chartHeight} L ${x} ${y}`;
      } else {
        pathPoints += ` L ${x} ${y}`;
        areaPoints += ` L ${x} ${y}`;
      }
      if (idx === graphData.length - 1) {
        areaPoints += ` L ${x} ${padding + chartHeight} Z`;
      }
    });
  }

  const getPointX = (idx) => padding + (idx / Math.max(graphData.length - 1, 1)) * chartWidth;
  const getPointY = (val) => padding + chartHeight - ((val - minY) / Math.max(maxY - minY, 1)) * chartHeight;

  // Coach Log set actions
  const handleAddSet = (exerciseIndex, isWarmup = false) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        const lastSet = ex.sets[ex.sets.length - 1];
        let newSet;
        if (isCardioExercise(ex.name)) {
          // Suggest the previous set's distance and time as a starting point
          // instead of leaving both blank.
          newSet = { distanceKm: lastSet?.distanceKm || '', time: lastSet?.time || '', isCompleted: false, isWarmup };
        } else if (isTimedExercise(ex.name)) {
          newSet = { time: lastSet?.time || '', isCompleted: false, isWarmup };
        } else if (isWarmupExercise(ex.name)) {
          newSet = { reps: lastSet?.reps || 10, weight: '0', isCompleted: false, isWarmup };
        } else {
          // Reps stay fixed at the last set's target; weight steps up by one
          // plate increment (2.5kg) — straight/pyramid-style progression
          // instead of just repeating the last set verbatim.
          newSet = { reps: lastSet?.reps || 10, weight: suggestNextWeight(lastSet?.weight), isCompleted: false, isWarmup };
        }
        return { ...ex, sets: [...ex.sets, newSet] };
      }
      return ex;
    }));
  };

  const handleChangeSetType = (exerciseIndex, setIndex, type) => {
    if (type === 'remove') {
      handleRemoveSet(exerciseIndex, setIndex);
      setSetTypeMenu(null);
      return;
    }
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx !== exerciseIndex) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, sIdx) => {
          if (sIdx !== setIndex) return s;
          return { ...s, isWarmup: type === 'warmup', setType: type };
        })
      };
    }));
    setSetTypeMenu(null);
  };

  const handleRemoveSet = (exerciseIndex, setIndex) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        return {
          ...ex,
          sets: ex.sets.filter((_, sIdx) => sIdx !== setIndex)
        };
      }
      return ex;
    }));
  };

  const handleSetChange = (exerciseIndex, setIndex, field, value) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx === setIndex) {
              return { ...s, [field]: value };
            }
            return s;
          })
        };
      }
      return ex;
    }));
  };

  // Bodyweight exercises (push-ups, mountain climbers, jumping jacks) default
  // to no added weight. An exercise added before this toggle existed has no
  // bodyweightMode field — infer it from whether any set already has a
  // nonzero weight, so existing data doesn't get clobbered by defaulting to
  // "BW" and wiping it.
  const getLogExBwMode = (ex) =>
    ex.bodyweightMode !== undefined ? ex.bodyweightMode : !ex.sets.some(s => Number(s.weight) > 0);

  const handleToggleLogBodyweightMode = (exIdx) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      const nextMode = !getLogExBwMode(ex);
      return {
        ...ex,
        bodyweightMode: nextMode,
        sets: ex.sets.map(s => ({ ...s, weight: nextMode ? '0' : '' }))
      };
    }));
  };

  const getSetTimerKey = (exIdx, sIdx) => `${exIdx},${sIdx}`;

  const getSetElapsedSeconds = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    const timer = setTimers[key];
    if (!timer) return 0;
    if (!timer.startedAt) return timer.pausedDuration || 0;
    const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000) + (timer.pausedDuration || 0);
    return elapsed;
  };

  const handleSetStopwatchStart = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    // Same resume-from-typed-value fallback as handleCardioStopwatchStart:
    // if there's no timer entry yet (fresh set, or one whose time the
    // client typed in by hand instead of running the stopwatch), start from
    // the set's own saved `time` instead of always restarting at 0.
    const existingPausedDuration = setTimers[key]?.pausedDuration;
    const pausedDuration = existingPausedDuration != null
      ? existingPausedDuration
      : (parseTimeStringToSeconds(logExercises[exIdx]?.sets[sIdx]?.time) || 0);
    setSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration }
    }));
  };

  const handleSetStopwatchPause = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    const elapsed = getSetElapsedSeconds(exIdx, sIdx);
    // Sync into set.time on pause (not just on Complete) — without this the
    // time field had no manually-editable value to show while paused, since
    // the live count only ever lived in setTimers, not on the set itself.
    handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
    setSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: false, startedAt: null, pausedDuration: elapsed }
    }));
  };

  // Editing the time field by hand while paused (the field this feeds is
  // only ever shown when !isRunning) is meant to be the new authoritative
  // value — the field's own comment says "Pressing Start again resumes
  // from whatever's typed here". But handleSetStopwatchStart's resume logic
  // reads setTimers[key].pausedDuration FIRST and only falls back to the
  // set's own `time` field when no timer entry exists at all — once the
  // stopwatch had been started and paused even once this session, a timer
  // entry with a stale pausedDuration already existed, so a manual edit
  // afterward (e.g. typing "0" to reset it) updated the displayed text but
  // never touched that stale pausedDuration — so pressing Start again
  // resumed from the OLD number instead of the freshly typed one. Reported
  // 2026-08-14. Keep the two in sync on every manual edit, same fix applied
  // to handleCardioTimeEdit below for cardio's identical shape.
  const handleTimedSetTimeEdit = (exIdx, sIdx, rawValue) => {
    const masked = maskDigitsToTimeString(rawValue);
    handleSetChange(exIdx, sIdx, 'time', masked);
    const key = getSetTimerKey(exIdx, sIdx);
    setSetTimers(prev => (prev[key]
      ? { ...prev, [key]: { ...prev[key], pausedDuration: parseTimeStringToSeconds(masked) || 0 } }
      : prev));
  };

  // Cardio sets (Running, Jogging, Cycling, Cross Trainer, Incline Walk,
  // Treadmill Walk) reuse the same per-set stopwatch infrastructure as timed
  // exercises (setTimers/getSetElapsedSeconds) — two differences from that
  // pattern:
  // 1. The TIME field stays live-editable throughout instead of freezing on
  //    Complete, so pausing writes the ticked value into set.time instead of
  //    waiting for a separate Complete action.
  // 2. There's no GPS/sensor to measure real distance, so while running, KM
  //    auto-fills from an assumed average pace (estimateCardioDistanceKm) —
  //    tracked via the timer's `autoKm` flag, which starts true and flips to
  //    false the moment the client types their own value (handleCardioKmEdit),
  //    so a real number they're entering never gets overwritten by the estimate.
  const handleCardioStopwatchStart = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    // A normal pause leaves the timer entry in place with its pausedDuration
    // — but ticking a set complete deletes the entry entirely (see
    // handleCardioSetComplete), so un-ticking and pressing Start again found
    // no entry here and always restarted from 0, discarding the time/km
    // that had already accumulated. Falling back to the set's own saved
    // `time` field (which survives both complete and un-complete) instead
    // of a bare 0 makes Start always resume from wherever it was actually
    // left, not just within the same uninterrupted run.
    const existingPausedDuration = setTimers[key]?.pausedDuration;
    const pausedDuration = existingPausedDuration != null
      ? existingPausedDuration
      : (parseTimeStringToSeconds(logExercises[exIdx]?.sets[sIdx]?.time) || 0);
    setSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration, autoKm: true }
    }));
  };

  const handleCardioKmEdit = (exIdx, sIdx, value) => {
    // distanceKmAuto lives on the set itself (not just the ephemeral timer
    // entry) so a manual KM edit sticks even when there's no active
    // stopwatch — e.g. the client typed a time by hand first (see
    // handleCardioTimeEdit) and then corrects the KM it auto-filled.
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => si === sIdx ? { ...s, distanceKm: value, distanceKmAuto: false } : s)
      };
    }));
    const key = getSetTimerKey(exIdx, sIdx);
    setSetTimers(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], autoKm: false } } : prev));
  };

  // Typing a time directly (stopwatch never started, or paused and being
  // corrected) used to leave KM frozen at whatever it last was — the client
  // could type 25:00 and still see a stale 0.05km from an earlier accidental
  // tick. This mirrors the running-stopwatch auto-fill (estimateCardioDistanceKm)
  // for manually-typed time too, unless the client has already typed their
  // own KM for this set (distanceKmAuto === false).
  const handleCardioTimeEdit = (exIdx, sIdx, rawValue) => {
    const masked = maskDigitsToTimeString(rawValue);
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => {
          if (si !== sIdx) return s;
          const next = { ...s, time: masked };
          if (s.distanceKmAuto !== false) {
            const seconds = parseTimeStringToSeconds(masked) || 0;
            next.distanceKm = seconds > 0 ? String(estimateCardioDistanceKm(ex.name, seconds)) : '';
          }
          return next;
        })
      };
    }));
    // Same fix as handleTimedSetTimeEdit above — keep any existing paused
    // timer entry's pausedDuration in sync with a manual edit, or Start
    // resumes from the stale pre-edit number instead of what was just typed.
    const key = getSetTimerKey(exIdx, sIdx);
    setSetTimers(prev => (prev[key]
      ? { ...prev, [key]: { ...prev[key], pausedDuration: parseTimeStringToSeconds(masked) || 0 } }
      : prev));
  };

  const handleCardioStopwatchPause = (exIdx, sIdx) => {
    const elapsed = getSetElapsedSeconds(exIdx, sIdx);
    handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
    const key = getSetTimerKey(exIdx, sIdx);
    const timer = setTimers[key];
    if (timer?.autoKm) {
      const exName = logExercises[exIdx]?.name;
      handleSetChange(exIdx, sIdx, 'distanceKm', String(estimateCardioDistanceKm(exName, elapsed)));
    }
    handleSetStopwatchPause(exIdx, sIdx);
  };

  // Ticking a cardio set's checkbox while its stopwatch is still running
  // used to leave that timer ticking away in the background — the row
  // showed "completed" styling but the clock and live calories kept
  // climbing underneath. This finalizes the timer first (same as pausing:
  // freeze time, sync the KM estimate if it was still auto-driving) and
  // clears it, THEN marks the set complete, so a running cardio timer
  // actually stops the moment it's checked off.
  const handleCardioSetComplete = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    const timer = setTimers[key];
    if (timer?.isRunning) {
      const elapsed = getSetElapsedSeconds(exIdx, sIdx);
      handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
      if (timer.autoKm) {
        const exName = logExercises[exIdx]?.name;
        handleSetChange(exIdx, sIdx, 'distanceKm', String(estimateCardioDistanceKm(exName, elapsed)));
      }
      setSetTimers(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
    handleToggleSetCompleted(exIdx, sIdx);
  };

  const handleSetStopwatchComplete = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    // If the stopwatch was never started for this set (client typed the
    // time in by hand instead of running it), there's no setTimers entry —
    // getSetElapsedSeconds would then read 0 and stomp the typed value the
    // moment the set gets ticked. Only fall back to the live timer's
    // elapsed time when a timer entry actually exists; otherwise keep
    // whatever's already in set.time.
    const elapsed = setTimers[key]
      ? getSetElapsedSeconds(exIdx, sIdx)
      : (parseTimeStringToSeconds(logExercises[exIdx]?.sets[sIdx]?.time) || 0);
    handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
    handleToggleSetCompleted(exIdx, sIdx);
    setSetTimers(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleAddCustomExercise = () => {
    const name = prompt("Enter Exercise Name:");
    if (name) {
      setLogExercises(prev => [...prev, { name, sets: [{ reps: 10, weight: '5.0', isCompleted: false }] }]);
    }
  };

  const handleFinishWorkoutPress = (e) => {
    if (e) e.preventDefault();

    const totalSetsCount = logExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const completedSetsCount = logExercises.reduce(
      (sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length,
      0
    );

    if (totalSetsCount === 0) {
      alert("Please add at least one exercise and set before finishing!");
      return;
    }

    if (completedSetsCount < totalSetsCount) {
      setShowUntickedFinishModal(true);
      return;
    }

    // All sets ticked — now validate workout name. Real id is
    // 'workoutNameInputTop' (see the input further down); this used to look
    // up the stale 'workoutNameInput' id, which never matched anything, so
    // nameInput was always null and this whole block silently no-opped —
    // the Save button looked completely unresponsive with zero feedback
    // whenever the name was blank, instead of focusing/flagging the field.
    if (!templateName || !templateName.trim()) {
      const nameInput = document.getElementById('workoutNameInputTop');
      if (nameInput) {
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInput.focus();
        nameInput.setCustomValidity('Please enter a workout name before finishing.');
        nameInput.reportValidity();
        nameInput.setCustomValidity('');
      } else {
        alert('Please enter a workout name before finishing!');
      }
      return;
    }

    let currentExercises = [...logExercises];
    let totalVolume = 0;
    const prs = [];

    const clientSessions = sessions.filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase());
    const historicalMaxes = {};

    clientSessions.forEach(session => {
      session.exercises.forEach(ex => {
        const exName = ex.name.toLowerCase();
        ex.sets.forEach(set => {
          const w = parseFloat(set.weight) || 0;
          if (!historicalMaxes[exName] || w > historicalMaxes[exName]) {
            historicalMaxes[exName] = w;
          }
        });
      });
    });

    currentExercises.forEach(ex => {
      const exName = ex.name.toLowerCase();
      let exMaxWeightThisSession = 0;

      ex.sets.forEach(s => {
        if (s.isCompleted) {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps) || 0;
          totalVolume += w * r;

          if (w > exMaxWeightThisSession) {
            exMaxWeightThisSession = w;
          }
        }
      });

      const historicalPeak = historicalMaxes[exName] || 0;
      if (exMaxWeightThisSession > historicalPeak && historicalPeak > 0) {
        prs.push({
          exerciseName: ex.name,
          newRecord: exMaxWeightThisSession,
          oldRecord: historicalPeak,
          unit: getExerciseUnit(ex.name)
        });
      }
    });

    setSummaryStats({
      duration: formatStopwatchTime(workoutActiveSeconds),
      totalSets: completedSetsCount,
      volume: totalVolume.toLocaleString('en-IN', { maximumFractionDigits: 1 }),
      prs: prs
    });

    setShowFinishSummary(true);
  };

  const handleConfirmSaveWorkout = () => {
    let activeExercises = [...logExercises];
    const totalCompleted = activeExercises.reduce(
      (sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length,
      0
    );

    // Safeguard: if no sets are marked completed in state yet (due to async updates), auto-complete them
    if (totalCompleted === 0) {
      const now = Date.now();
      activeExercises = logExercises.map(ex => ({
        ...ex,
        sets: ex.sets.map(s => ({ ...s, isCompleted: true, completedAt: s.completedAt || now }))
      }));
    }

    const formattedExercises = activeExercises
      .map(ex => {
        const exIsCardio = isCardioExercise(ex.name);
        return {
          name: ex.name,
          sets: ex.sets
            .filter(s => s.isCompleted)
            .map(s => ({
              // Cardio sets carry distance/time instead of reps/weight, and
              // timed holds (plank etc.) carry time only, so the save step
              // (and workout_logs.distance_km/cardio_duration_seconds) doesn't
              // collapse them to zero.
              ...(exIsCardio
                ? { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' }
                : isTimedExercise(ex.name)
                ? { time: s.time || '' }
                : { reps: parseInt(s.reps) || 0, weight: parseFloat(s.weight) || 0 }),
              // Preserve the Warmup/Dropset/Failure tag chosen in the logger so
              // it reaches workout_logs.set_type instead of being discarded.
              ...(s.isWarmup ? { setType: 'warmup' } : {}),
              ...(s.setType && s.setType !== 'normal' && !s.isWarmup ? { setType: s.setType } : {})
            }))
        };
      })
      .filter(ex => ex.sets.length > 0);

    // Duration/calories for the client's own workout — identical mechanism to
    // the coach Live Log: elapsed time from the real start/pause timestamps,
    // and calories from each set's actual completion timestamp (work +
    // rest-interval gaps), not an approximation. activeExercises (not the
    // stripped formattedExercises) still carries completedAt on each set.
    const finalDurationSeconds = workoutTimerStartedAt ? computeElapsedSeconds(workoutTimerStartedAt, workoutPauseIntervals) : null;
    const clientBodyWeightKg = parseFloat(localStorage.getItem('userWeight')) || DEFAULT_BODY_WEIGHT_KG;
    const finalCalories = workoutTimerStartedAt ? computeLiveCalories(activeExercises, workoutTimerStartedAt, workoutPauseIntervals, clientBodyWeightKg).totalKcal : null;

    const newSession = {
      id: `session-${Date.now()}`,
      clientName: logClient,
      date: logDate,
      exercises: formattedExercises,
      duration: summaryStats?.duration || '00:15',
      durationSeconds: finalDurationSeconds,
      caloriesBurned: finalCalories,
      planName: templateName.trim() || 'Custom Routine',
      source: workoutSource, // 'self' for client self-logged, 'coach' for coach-assigned plans
      // Deterministic id for saveWorkoutSession's UUID fast path. This
      // component only ever renders for the logged-in client's own account
      // (App.jsx routes coaches to TrainerDashboard instead — see its
      // renderContent()), so ownUserId is reliably THIS client's id whether
      // the workout being logged is self-built ('self') or a coach-assigned
      // plan ('coach') — workoutSource describes who *authored* the plan,
      // not who's doing the logging. Without this, saveWorkoutSession falls
      // back to an ambiguous email/name lookup that can silently match
      // nobody and write zero rows to workout_logs — even though the
      // "workout finished" push to the coach still fires regardless, since
      // that's a separate, DB-independent call. Confirmed 2026-07-24: a
      // client's completed session never reached workout_logs, so it never
      // showed up as a "finished a workout" card on the coach's home
      // screen, despite the push notification arriving. BUG FIX
      // (2026-08-06): this used to exclude clientId specifically for
      // workoutSource === 'coach' — i.e. omitted it for exactly the
      // sessions most likely to need it (a coach's assigned plan), which is
      // how a client's finished coach-plan workout could go completely
      // missing from the coach's History/Muscles tabs with no error shown
      // anywhere.
      ...(ownUserId ? { clientId: ownUserId } : {})
    };

    const updated = [...sessions, newSession];
    saveSessionsToLocal(updated);
    
    // Save as client routine template if checked
    if (saveAsTemplate && formattedExercises.length > 0) {
      // Use Supabase UUID if available, fall back to display name
      const plan = {
        userId: getPlanOwnerId(),
        // Client's own custom template name wins; else fall back to the
        // session's workout name, then a dated default.
        planName: customTemplateName.trim() || templateName.trim() || `My Template — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        exercises: formattedExercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => isCardioExercise(ex.name)
            ? { distanceKm: s.distanceKm, time: s.time }
            : isTimedExercise(ex.name)
            ? { time: s.time }
            : { reps: s.reps, weight: s.weight })
        })),
        createdBy: 'client'
      };
      databaseService.saveWorkoutPlan(plan).then(() => {
        fetchPlans();
      }).catch(err => {
        // saveWorkoutPlan rejects a plan with no exercises/sets. The session
        // itself is already saved by this point, so only the optional template
        // copy is lost — say so rather than leaving an unhandled rejection.
        console.error('Failed to save workout template:', err);
        triggerToast('⚠️ Workout saved, but the template could not be created.');
      });
    }

    setIsLoggingWorkout(false);
    setSaveAsTemplate(false);
    setTemplateName('');
    setCustomTemplateName('');
    setWorkoutSource('self'); // Reset to self-logged for next workout
    // Cancel any debounced background draft-save still armed from the last
    // edit (typing a weight/rep within the last ~1200ms) — the draft-mirror
    // effect above only cancels it on its OWN next re-render (triggered by
    // isLoggingWorkout flipping to false just above), which can lose the
    // race against the deleteWorkoutDraft call a few lines down: edit a set,
    // hit Finish/Save within that debounce window, and the still-pending
    // saveWorkoutDraft fires right after the delete and silently recreates
    // the very row just removed — the exact "saved fine, but 'Live Log in
    // progress' banner won't go away" symptom already fixed once on the
    // coach's own Live Log save (see handleSaveLiveSession in
    // TrainerDashboard.jsx) but missed here on the client's self-log path.
    // Confirmed 2026-08-11 for a real client (Mahalsa).
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    // Session is finished and saved to workout_logs — the open draft is done.
    if (ownUserId) databaseService.deleteWorkoutDraft(ownUserId);

    // Notify this client's coach that a session was completed, with the real
    // duration and calories, so the coach can send a note back. Client
    // self-logged sessions only — a coach's own Live Log save has its own path.
    const finishedClientId = ownUserId || localStorage.getItem('userId');
    if (finishedClientId && workoutSource !== 'coach') {
      notifyEvent('workout_finished', {
        clientUserId: finishedClientId,
        durationSeconds: finalDurationSeconds,
        caloriesBurned: finalCalories,
        workoutName: newSession.planName
      });
    }

    // Auto-disconnect once this session pushes the client to (or past) their
    // coach-set total_sessions with no renewal (coach raising the total again
    // counts as renewing — see checkAndHandleSessionPackageCompletion). Self-
    // logged sessions only, same scope as the workout_finished push above.
    if (finishedClientId && workoutSource !== 'coach') {
      databaseService.checkAndHandleSessionPackageCompletion(finishedClientId).then(result => {
        if (result.disconnected && result.oldCoachId) {
          notifyEvent('client_disconnected', { clientUserId: finishedClientId, oldCoachId: result.oldCoachId });
        }
      }).catch(() => {});
    }

    setSelectedClient(logClient);
    const newClientSessions = updated.filter(s => s.clientName.toLowerCase() === logClient.toLowerCase());
    setSelectedSessionIndex(newClientSessions.length - 1);

    const finalSetsCount = formattedExercises.reduce((sum, ex) => sum + ex.sets.length, 0);

    // Share card is a client-facing "look what I did" moment — only relevant
    // for a client's own self-logged session, not a coach logging on a
    // client's behalf (workoutSource === 'coach'). Coach-logged saves keep
    // the plain toast.
    if (workoutSource !== 'coach') {
      // Best lift: the PR just set (if any — summaryStats.prs is already
      // sorted by discovery order in currentExercises above), else whichever
      // completed set this session had the heaviest weight. Cardio/timed
      // sets have no `weight` field, so they're naturally skipped here.
      let bestLift = null;
      if (summaryStats?.prs?.length > 0) {
        const topPr = summaryStats.prs[0];
        const matchEx = formattedExercises.find(ex => ex.name === topPr.exerciseName);
        const matchSet = matchEx?.sets.find(s => s.weight === topPr.newRecord);
        bestLift = {
          exerciseName: topPr.exerciseName,
          weight: topPr.newRecord,
          reps: matchSet?.reps ?? null,
          unit: topPr.unit,
          isPR: true
        };
      } else {
        let maxWeight = -1;
        formattedExercises.forEach(ex => {
          ex.sets.forEach(s => {
            if (typeof s.weight === 'number' && s.weight > maxWeight) {
              maxWeight = s.weight;
              bestLift = { exerciseName: ex.name, weight: s.weight, reps: s.reps, unit: 'kg', isPR: false };
            }
          });
        });
      }

      const muscleSet = new Set();
      formattedExercises.forEach(ex => {
        getMuscleGroupsForExercise(ex.name).forEach(m => muscleSet.add(m));
      });

      setShareCardData({
        workoutName: newSession.planName,
        clientName: (localStorage.getItem('userName') || '').trim(),
        dateLabel: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' · ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        durationLabel: finalDurationSeconds ? `${Math.round(finalDurationSeconds / 60)} min` : summaryStats?.duration || '—',
        calories: finalCalories != null ? Math.round(finalCalories) : null,
        bestLift,
        totalSets: summaryStats?.totalSets || finalSetsCount,
        volume: summaryStats?.volume ?? '0',
        muscleGroups: Array.from(muscleSet).slice(0, 4)
      });
    } else {
      triggerToast(`🏋️‍♂️ Your Fitengineers Workout Saved! Completed ${summaryStats?.totalSets || finalSetsCount} sets.`);
    }

    resetWorkoutTimer();
    setShowFinishSummary(false);
    
    setLogExercises([
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
    ]);
    setSetTimers({});

    setActiveView('analytics');
  };

  // Program enrollment select
  const selectCoachingProgram = (program) => {
    let isRenewal = false;
    const updatedProfiles = clientProfiles.map(p => {
      if (p.clientName.toLowerCase() === selectedClient.toLowerCase()) {
        const isSameProgram = p.activeProgram.toLowerCase() === program.name.toLowerCase();
        if (isSameProgram) {
          isRenewal = true;
          return {
            ...p,
            totalSessions: p.totalSessions + program.sessions
          };
        } else {
          return {
            ...p,
            activeProgram: program.name,
            totalSessions: program.sessions
          };
        }
      }
      return p;
    });

    // If client does not exist in profiles, add them
    const exists = clientProfiles.some(p => p.clientName.toLowerCase() === selectedClient.toLowerCase());
    if (!exists) {
      updatedProfiles.push({
        clientName: selectedClient,
        activeProgram: program.name,
        totalSessions: program.sessions
      });
    }

    saveProfilesToLocal(updatedProfiles);
    if (isRenewal) {
      triggerToast(`Package renewed! Appended +${program.sessions} sessions for ${selectedClient}.`);
    } else {
      triggerToast(`Enrolled in "${program.name}" (${program.sessions} sessions total!)`);
    }
    setActiveView('analytics');
  };

  const getAmountBreakdown = (priceStr) => {
    const total = parseFloat(priceStr.replace(/[^\d]/g, '')) || 0;
    const base = parseFloat((total / 1.18).toFixed(2));
    const gst = parseFloat((total - base).toFixed(2));
    return {
      total: priceStr,
      base: `₹${base.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      gst: `₹${gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    };
  };

  const handlePaymentSubmit = (e) => {
    e.preventDefault();
    setIsProcessingPayment(true);
    
    // Simulate premium payment processor verification
    setTimeout(() => {
      setIsProcessingPayment(false);
      setShowPaymentModal(false);
      
      // Perform the actual enrollment upon successful mock payment
      selectCoachingProgram(paymentProgram);
    }, 1800);
  };

  // ─── Start a workout from a generic template ───
  const handleStartFromTemplate = (template) => {
    const exercises = template.exercises.map(ex => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets || 3 }, () => ({
        reps: parseInt(String(ex.reps).split('–')[0]) || 10,
        weight: '0',
        isCompleted: false,
        // Kept so the reps input can show the plan's target range as a
        // placeholder hint once the lifter clears the pre-filled number.
        targetReps: ex.reps ? String(ex.reps) : null
      }))
    }));
    setLogExercises(exercises);
    setSetTimers({});
    setTemplateName(template.name);
    setActiveTemplateName(template.name);
    setLogClient(loggedInUser);
    setLogDate(getLocalDateString());
    resetWorkoutTimer();
    setIsLoggingWorkout(true);
    setActiveView('log');
    triggerToast(`Starting ${template.name} — fill in your weights and mark sets done!`);
  };

  // Starts a logging session straight from a saved/assigned plan, preserving
  // each set's real reps/weight (and cardio/timed fields) instead of
  // collapsing them to defaults — see handleStartFromTemplate above, which
  // was written for the older flat {sets: <count>, reps: '<string>'} shape
  // and silently zeroes out weight when used on a real per-set plan. This is
  // the one correct path; both the Coach Plans card (Templates view) and the
  // Start Workout Session launcher (Log view) route through it.
  const startPlan = (plan, source) => {
    // Guard the malformed/empty case explicitly: `plan.exercises` used to
    // be mapped directly, so a null one threw a TypeError and an empty
    // one silently opened a session containing only the default warm-ups
    // — both read to the user as "the template is empty". Reads are
    // normalized now (see normalizePlanExercises), so reaching here with
    // nothing means the stored plan genuinely has no exercises; say that
    // instead of opening a blank logger.
    const planExercises = Array.isArray(plan.exercises) ? plan.exercises : [];
    if (planExercises.length === 0) {
      triggerToast('⚠️ This plan has no exercises saved. Open it in the editor to rebuild it.');
      return;
    }
    setLogClient(selectedClient);
    setLogDate(getLocalDateString());
    setLogExercises([
      ...getDefaultWarmupExercises(),
      ...planExercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => isCardioExercise(ex.name)
          ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
          : isTimedExercise(ex.name)
          ? { time: s.time ?? '', isCompleted: false }
          // s.reps/s.weight can genuinely be missing (e.g. a loaded-carry
          // exercise like Farmer Walk saved from a source that didn't fill
          // both fields) — String(undefined) renders as the literal text
          // "undefined" in the input box instead of leaving it blank, same
          // bug the cardio/timed branches above already guard against with
          // `?? ''`. This branch never got that guard.
          : { reps: String(s.reps ?? ''), weight: String(s.weight ?? ''), isCompleted: false })
      })),
    ]);
    // setTimers is keyed purely by "exIdx,sIdx" (getSetTimerKey), not by
    // exercise identity — starting a plan without clearing it left whatever
    // stopwatch state a PREVIOUS session's exercise had at that same index
    // still attached. For a timed/cardio exercise (Plank, etc.) landing at
    // that index that showed up as a stale elapsed time, or even a still-
    // "running" stopwatch, on a set that was never touched in THIS plan —
    // reported as "not loading fresh". Clear it on every fresh plan start.
    setSetTimers({});
    setTemplateName(plan.planName);
    setWorkoutSource(source);
    setIsLoggingWorkout(true);
    resetWorkoutTimer();
  };

  // Renew client sessions package
  const renewSessionPackage = () => {
    const updatedProfiles = clientProfiles.map(p => {
      if (p.clientName.toLowerCase() === selectedClient.toLowerCase()) {
        return {
          ...p,
          totalSessions: (p.totalSessions || 12) + 12
        };
      }
      return p;
    });
    saveProfilesToLocal(updatedProfiles);
    triggerToast(`Package renewed! Appended +12 sessions for ${selectedClient}.`);
  };

  // Live calorie readout for the client's own "Log Sets" stopwatch banner —
  // identical mechanism to the coach Live Log: each completed set's own
  // completedAt timestamp drives the work + rest-interval calc, recomputed
  // fresh every render so it climbs live as sets get checked off.
  //
  // computeLiveCalories only counts COMPLETED sets, so an in-progress cardio
  // set contributed nothing here — the per-row time/kcal and the top banner
  // disagreed. This adds each not-yet-completed cardio set's own live
  // estimate on top, driven by elapsed time regardless of running/paused:
  // - RUNNING: elapsed climbs live off the timer, same as the per-row clock.
  // - PAUSED (not completed): elapsed reads the frozen set.time value that
  //   pausing already synced there, so the total holds steady instead of
  //   dropping to 0 and then jumping back up on resume.
  // - COMPLETED: excluded here on purpose — computeLiveCalories's own
  //   completed-set branch already counts it from the same final
  //   time/distanceKm, so nothing is double-counted or lost when a set gets
  //   ticked or un-ticked.
  const bodyWeightKgForLiveKcal = parseFloat(localStorage.getItem('userWeight')) || DEFAULT_BODY_WEIGHT_KG;
  const liveRunningCardioKcal = logExercises.reduce((sum, ex, exIdx) => {
    if (!isCardioExercise(ex.name)) return sum;
    return sum + ex.sets.reduce((s, set, sIdx) => {
      if (set.isCompleted) return s;
      const timer = setTimers[getSetTimerKey(exIdx, sIdx)];
      const isRunning = timer?.isRunning || false;
      const elapsed = isRunning ? getSetElapsedSeconds(exIdx, sIdx) : (parseTimeStringToSeconds(set.time) || 0);
      if (elapsed <= 0) return s;
      const km = (isRunning && timer?.autoKm !== false) ? estimateCardioDistanceKm(ex.name, elapsed) : set.distanceKm;
      return s + estimateCardioKcal(ex.name, km, elapsed, bodyWeightKgForLiveKcal);
    }, 0);
  }, 0);
  const liveOwnWorkoutKcal = isLoggingWorkout
    ? Math.round((computeLiveCalories(logExercises, workoutTimerStartedAt, workoutPauseIntervals, bodyWeightKgForLiveKcal).totalKcal + liveRunningCardioKcal) * 10) / 10
    : 0;

  return (
    <>
      <div className="workout-tracker-container animate-slide-up">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="reminder-toast animate-in">
          <span>✨</span> {toastMessage}
        </div>
      )}

      {/* Tab Segmented Control */}
      <div className="workouts-segmented-tabs">
        <button 
          className={`tab-item-btn ${activeView === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveView('analytics')}
        >
          📈 Progress
        </button>
        <button
          data-tour="wt-tab-templates"
          className={`tab-item-btn ${activeView === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveView('templates')}
        >
          🏋️ Workouts
        </button>
        <button
          data-tour="wt-tab-log"
          className={`tab-item-btn ${activeView === 'log' ? 'active' : ''}`}
          onClick={() => setActiveView('log')}
        >
          📝 Log Sets
        </button>
      </div>

      {activeView === 'analytics' && (
        <div className="analytics-view-wrapper">
          {/* Payment Warning Banner */}
          {showPaymentAlert && (
            <div className="billing-warning-alert-card animate-scale-in">
              <div className="billing-content">
                <span className="warning-icon">⚠️</span>
                <div className="billing-text">
                  <h4>Renew Session Package</h4>
                  <p>
                    {remainingSessionsCount === 0 
                      ? `${selectedClient} has finished all purchased sessions! Please renew now.`
                      : `Only ${remainingSessionsCount} sessions left in your "${activeProfile.activeProgram}" package!`
                    }
                  </p>
                </div>
              </div>
              <button className="btn-renew-action" onClick={renewSessionPackage}>
                💳 Renew Now (+12 Sessions)
              </button>
            </div>
          )}

          {/* Header area */}
          <div className="tracker-top-summary glass-panel">
            <div className="profile-details-group">
              <div className="name-group">
                {isTrainer(localStorage.getItem('userEmail')) ? (
                  <select 
                    className="client-select-dropdown"
                    value={selectedClient} 
                    onChange={(e) => {
                      setSelectedClient(e.target.value);
                      const clientSessionsCount = sessions.filter(s => s.clientName.toLowerCase() === e.target.value.toLowerCase()).length;
                      setSelectedSessionIndex(Math.max(0, clientSessionsCount - 1));
                    }}
                  >
                    {clientProfiles.map(p => (
                      <option key={p.clientName} value={p.clientName}>
                        {p.clientName} ({p.activeProgram})
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>

            {/* Session counters breakdown — coaching-program accounting, only for
                clients connected to a coach (or a coach viewing a client). */}
            {(hasCoachAssigned || isTrainer(localStorage.getItem('userEmail'))) && (
            <div className="sessions-accounting-split">
              <div className="acc-item">
                <span className="acc-lbl">{isOwnProfile ? 'My Goal' : 'Program Name'}</span>
                <strong>{isOwnProfile ? (clientGoal || activeProfile.activeProgram) : activeProfile.activeProgram}</strong>
              </div>
              <div className="acc-item">
                <span className="acc-lbl">Completed</span>
                <strong className="text-emerald">
                  {hasAssignedSessions ? `${completedSessionsCount} / ${activeProfile.totalSessions}` : completedSessionsCount}
                </strong>
              </div>
              <div className="acc-item">
                <span className="acc-lbl">Remaining</span>
                {hasAssignedSessions ? (
                  <strong className={remainingSessionsCount <= 3 ? 'text-warn' : 'text-blue'}>
                    {remainingSessionsCount} left
                  </strong>
                ) : (
                  <strong className="text-muted">Unassigned</strong>
                )}
              </div>
            </div>
            )}

            <div className="session-filters">
              <select 
                className="exercise-select-dropdown"
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
              >
                <option value="Shoulders Press">Shoulders Press</option>
                <option value="Biceps Curls">Biceps Curls</option>
                <option value="One Arm Row">One Arm Row</option>
                <option value="Lat Pull Down">Lat Pull Down</option>
                {sessions
                  .filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase())
                  .flatMap(s => s.exercises.map(e => e.name))
                  .filter((v, i, a) => a.indexOf(v) === i && !['shoulders press', 'biceps curls', 'one arm row', 'lat pull down'].includes(v.toLowerCase()))
                  .map(exName => (
                    <option key={exName} value={exName}>{exName}</option>
                  ))
                }
              </select>

              <button 
                type="button"
                className="video-guide-btn"
                onClick={() => {
                  const matched = findExerciseGuideMatch(exercisesList, selectedExercise) ||
                                  findExerciseGuideMatch(presetExercises, selectedExercise);
                  if (matched) {
                    setActiveGuideExercise(normalizeExerciseForGuide(matched));
                  } else {
                    setActiveGuideExercise({
                      name: selectedExercise,
                      category: 'Custom',
                      videoFile: '',
                      guide: {
                        target: 'Primary Muscle Group',
                        setup: 'Position yourself comfortably with stable support and check alignment.',
                        execution: 'Control the weights through a full range of motion. Keep core tight.',
                        tip: 'Focus on mind-muscle connection and avoid using momentum.'
                      }
                    });
                  }
                }}
              >
                🎬 Guide
              </button>

              <div className="timeframe-toggle">
                <button 
                  className={`toggle-btn ${timeframe === 'weekly' ? 'active' : ''}`}
                  onClick={() => setTimeframe('weekly')}
                >
                  Weekly
                </button>
                <button 
                  className={`toggle-btn ${timeframe === 'monthly' ? 'active' : ''}`}
                  onClick={() => setTimeframe('monthly')}
                >
                  Monthly
                </button>
              </div>
            </div>
          </div>

          {/* SVG Graph block */}
          <div className="overload-chart-card glass-panel">
            <div className="chart-header">
              <div className="title-section">
                <h3>{selectedExercise} Strength Progression</h3>
                <p>Tracking progressive overload metrics</p>
              </div>
              <div className="metric-switch">
                <button 
                  className={`metric-btn ${chartMetric === 'weight' ? 'active' : ''}`}
                  onClick={() => setChartMetric('weight')}
                >
                  Peak Weight
                </button>
                <button 
                  className={`metric-btn ${chartMetric === 'volume' ? 'active' : ''}`}
                  onClick={() => setChartMetric('volume')}
                >
                  Workload Volume
                </button>
              </div>
            </div>

            {graphData.length === 0 ? (
              <div className="empty-chart-state">
                <span>⚠️</span> No sessions logged yet for this client/exercise combinative.
              </div>
            ) : (
              <div className="chart-body">
                <div className="svg-container-box">
                  <svg viewBox={`0 0 ${width} ${height}`} className="analytics-svg-graph">
                    <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                    <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                    <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                    {chartMetric === 'volume' && areaPoints && (
                      <path 
                        d={areaPoints} 
                        fill="url(#volumeGradient)" 
                        opacity="0.15" 
                      />
                    )}
                    <defs>
                      <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary-accent-light)" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>

                    {pathPoints && (
                      <path 
                        d={pathPoints} 
                        fill="none" 
                        stroke={chartMetric === 'weight' ? '#3b82f6' : 'var(--primary-accent-light)'}
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    )}

                    {activeSessionData && (
                      <line 
                        x1={getPointX(activeSessionData.index)} 
                        y1={padding} 
                        x2={getPointX(activeSessionData.index)} 
                        y2={padding + chartHeight} 
                        stroke="rgba(255,255,255,0.1)" 
                        strokeWidth="1.5" 
                        strokeDasharray="3 3"
                      />
                    )}

                    {graphData.map((d, idx) => {
                      const val = chartMetric === 'weight' ? d.weight : d.volume;
                      const active = activeSessionData && activeSessionData.index === d.index;
                      const px = getPointX(d.index);
                      const py = getPointY(val);
                      return (
                        <g key={`${d.date}-${idx}`}>
                          <text
                            x={px}
                            y={Math.max(py - 14, 14)}
                            textAnchor="middle"
                            fontSize={active ? "14" : "13"}
                            fontWeight="800"
                            stroke="#090e17"
                            strokeWidth="3"
                            strokeLinejoin="round"
                            paintOrder="stroke"
                            fill={active ? '#fff' : 'rgba(255,255,255,0.85)'}
                          >
                            {chartMetric === 'weight' ? `${val}${getExerciseUnit(selectedExercise)}` : val}
                          </text>
                          <circle
                            cx={px}
                            cy={py}
                            r={active ? "6" : "4"}
                            fill={chartMetric === 'weight' ? '#3b82f6' : 'var(--primary-accent-light)'}
                            stroke="#090e17"
                            strokeWidth={active ? "2" : "1.5"}
                            style={{ transition: 'all 0.2s ease-in-out' }}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="graph-day-slider-panel">
                  <div className="slider-label-row">
                    <span>📅 Timeline Session</span>
                    <strong>
                      Session {selectedSessionIndex + 1}: <span className="text-highlight">{displayedSessions[selectedSessionIndex]?.date}</span>
                    </strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(graphData.length - 1, 0)}
                    value={selectedSessionIndex}
                    onChange={(e) => setSelectedSessionIndex(parseInt(e.target.value))}
                    className="timeline-range-slider"
                  />
                  {graphData.length > 0 && (() => {
                    const maxLabels = 6;
                    const step = Math.max(Math.ceil(graphData.length / maxLabels), 1);
                    return (
                      <div className="timeline-date-ticks">
                        {graphData.map((d, idx) => {
                          if (idx !== 0 && idx !== graphData.length - 1 && idx % step !== 0) return null;
                          const pct = graphData.length > 1 ? (idx / (graphData.length - 1)) * 100 : 0;
                          const label = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          return (
                            <span
                              key={`${d.date}-${idx}`}
                              className={`timeline-date-tick ${idx === selectedSessionIndex ? 'active' : ''}`}
                              style={{ left: `${pct}%` }}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Overload status badge */}
          {overload && (
            <div className={`progressive-overload-alert glass-panel ${overload.overloadAchieved ? 'success' : ''}`}>
              <div className="alert-badge">
                {overload.overloadAchieved ? '🔥 Progressive Overload Achieved!' : '⚖️ Metric Maintained'}
              </div>
              <p>
                {overload.overloadAchieved 
                  ? `Client successfully loaded more stress than the previous workout session! Weight delta: ${overload.weightDiff > 0 ? `+${overload.weightDiff} ${getExerciseUnit(selectedExercise)}` : 'Maintained'}, Volume delta: ${overload.volumeDiff > 0 ? `+${overload.volumeDiff}` : 'Maintained'}.`
                  : 'Weights and volume matched the preceding target indices to support recovery balance.'
                }
              </p>
            </div>
          )}

          {/* ─── WORKOUT HISTORY CALENDAR ─── */}
          <div className="session-detail-card glass-panel" style={{ marginTop: '16px' }}>
            <div className="detail-header" style={{ marginBottom: '12px' }}>
              <h3>📅 Workout History</h3>
              <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--primary-accent-light)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                {clientSessions.length} session{clientSessions.length !== 1 ? 's' : ''} logged
              </span>
            </div>

            {/* ── Mini Calendar ── */}
            {clientSessions.length > 0 && (() => {
              const workoutDates = new Set(clientSessions.map(s => s.date));
              const year = calendarMonth.year;
              const month = calendarMonth.month;
              const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const todayStr = getLocalDateString();
              const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              const cells = [];
              for (let i = 0; i < firstDay; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
              return (
                <div style={{ marginBottom: '16px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '12px 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {/* Month nav */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <button onClick={() => setCalendarMonth(prev => {
                      let m = prev.month - 1, y = prev.year;
                      if (m < 0) { m = 11; y -= 1; }
                      return { year: y, month: m };
                    })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 8px' }}>‹</button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>{monthName}</span>
                    <button onClick={() => setCalendarMonth(prev => {
                      let m = prev.month + 1, y = prev.year;
                      if (m > 11) { m = 0; y += 1; }
                      return { year: y, month: m };
                    })} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 8px' }}>›</button>
                  </div>
                  {/* Day labels */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                    {DAY_LABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, padding: '2px 0' }}>{d}</div>)}
                  </div>
                  {/* Day cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                    {cells.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;
                      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const hasWorkout = workoutDates.has(dateStr);
                      const isToday = dateStr === todayStr;
                      // Find matching sessions
                      const matchSessions = clientSessions.filter(s => s.date === dateStr);
                      const isSelected = matchSessions.some(s => {
                        const key = s.id || `${s.date}-${s.clientName}`;
                        return historyExpandedDate === key;
                      });
                      return (
                        <div
                          key={dateStr}
                          onClick={() => {
                            if (!hasWorkout) return;
                            // Toggle: if any session of this date is expanded, collapse; else expand first
                            if (isSelected) {
                              setHistoryExpandedDate(null);
                            } else {
                              const firstSess = matchSessions[0];
                              const key = firstSess.id || `${firstSess.date}-${firstSess.clientName}`;
                              setHistoryExpandedDate(key);
                            }
                          }}
                          style={{
                            position: 'relative',
                            textAlign: 'center',
                            padding: '5px 2px',
                            borderRadius: '8px',
                            fontSize: '0.72rem',
                            fontWeight: isToday || hasWorkout ? 700 : 400,
                            color: isSelected ? '#fff' : isToday ? 'var(--primary-accent-light)' : hasWorkout ? '#d1fae5' : 'var(--text-muted)',
                            background: isSelected ? 'rgba(16,185,129,0.3)' : isToday ? 'rgba(16,185,129,0.08)' : 'transparent',
                            border: isToday ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                            cursor: hasWorkout ? 'pointer' : 'default',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {day}
                          {hasWorkout && (
                            <span style={{ display: 'block', width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? '#fff' : 'var(--primary-accent-light)', margin: '2px auto 0' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {clientSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🏋️‍♂️</div>
                <p style={{ fontSize: '0.85rem' }}>No sessions logged yet.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Complete a workout or ask your coach to log a live session!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...clientSessions].reverse().map((sess) => {
                  const sessKey = sess.id || `${sess.date}-${sess.clientName}`;
                  const isExpanded = historyExpandedDate === sessKey;
                  let totalVol = 0, totalSets = 0;
                  sess.exercises.forEach(ex => ex.sets.forEach(s => {
                    totalVol += (parseFloat(s.weight)||0) * (parseInt(s.reps)||0);
                    totalSets += 1;
                  }));
                  const dateLabel = new Date(sess.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  const isToday = isLocalToday(sess.date);
                  const isCoachLogged = sess.loggedByCoach;
                  const planName = sess.planName || (isCoachLogged ? 'Coach Session' : 'Workout Session');
                  // Self-logged sessions store a pre-formatted "duration" string;
                  // coach Live Log sessions store raw "durationSeconds" instead —
                  // support whichever this session actually has.
                  const displayDuration = sess.duration || (sess.durationSeconds != null ? formatDuration(sess.durationSeconds) : null);
                  const displayCalories = sess.caloriesBurned != null ? sess.caloriesBurned : null;

                  return (
                    <div key={sessKey} style={{
                      background: isExpanded ? 'rgba(16,185,129,0.06)' : 'rgba(0,0,0,0.15)',
                      border: isExpanded ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
                    }}>

                      {/* Session Header */}
                      <div onClick={() => setHistoryExpandedDate(isExpanded ? null : sessKey)}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          {/* Workout Name (Plan Name) */}
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff', marginBottom: '2px' }}>{planName}</div>
                          {/* Date */}
                          <div style={{ fontSize: '0.73rem', color: isToday ? 'var(--primary-accent-light)' : 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                            📅 {dateLabel}{isToday ? ' · Today' : ''}
                          </div>
                          {/* Badges */}
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {isCoachLogged && (
                              <span style={{ fontSize: '0.6rem', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>👨‍🏫 Coach</span>
                            )}
                            <span style={{ fontSize: '0.6rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>{totalSets} sets</span>
                            <span style={{ fontSize: '0.6rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>{totalVol.toLocaleString('en-IN',{maximumFractionDigits:0})} kg</span>
                            <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '1px 7px', borderRadius: '20px' }}>{sess.exercises.length} exercises</span>
                            {displayCalories != null && (
                              <span style={{ fontSize: '0.6rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>🔥 {displayCalories} kcal</span>
                            )}
                          </div>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 800, marginLeft: '8px', paddingTop: '2px' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px' }}>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                            <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>⏱ Duration</div>
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'#fff', marginTop:'2px' }}>{displayDuration || '—'}</div>
                            </div>
                            <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>🏋️ Lifted</div>
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--primary-accent-light)', marginTop:'2px' }}>{totalVol.toLocaleString('en-IN',{maximumFractionDigits:0})} kg</div>
                            </div>
                            <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>✓ Sets</div>
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'#60a5fa', marginTop:'2px' }}>{totalSets}</div>
                            </div>
                            {displayCalories != null && (
                              <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                                <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>🔥 Calories</div>
                                <div style={{ fontSize:'0.88rem', fontWeight:800, color:'#fbbf24', marginTop:'2px' }}>{displayCalories} kcal</div>
                              </div>
                            )}
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                            {sess.exercises.map((ex, exIdx) => {
                              const exIsTimed = isTimedExercise(ex.name);
                              const exIsCardioHist = isCardioExercise(ex.name);
                              const exIsLoadedCarryHist = isLoadedCarryExercise(ex.name);
                              const exIsBodyweightHist = isBodyweightExercise(ex.name);
                              return (
                              <div key={exIdx} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'8px', padding:'10px 12px' }}>
                                <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#fff', marginBottom:'8px' }}>{ex.name}</div>
                                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                  <thead><tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                                    <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Set</th>
                                    {exIsTimed ? (
                                      <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Time</th>
                                    ) : exIsCardioHist ? (
                                      <>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Km</th>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Time</th>
                                      </>
                                    ) : exIsLoadedCarryHist ? (
                                      <>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Weight</th>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Meters</th>
                                      </>
                                    ) : (
                                      <>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Weight</th>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Reps</th>
                                        <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Vol</th>
                                      </>
                                    )}
                                  </tr></thead>
                                  <tbody>
                                    {ex.sets.map((set, sIdx) => {
                                      // Sequential number among normal working sets only —
                                      // matches the logger's own Warmup/Dropset/Failure badges.
                                      const workingNum = ex.sets.slice(0, sIdx + 1)
                                        .filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                                      const visual = getSetTypeVisual(set, workingNum);
                                      return (
                                        <tr key={sIdx} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                                          <td style={{ padding:'4px 0', fontSize:'0.72rem' }}>
                                            <span style={{
                                              display:'inline-flex', alignItems:'center', justifyContent:'center', width:'17px', height:'17px', borderRadius:'50%',
                                              background: visual.color ? `${visual.color}22` : 'rgba(255,255,255,0.08)',
                                              fontSize:'0.62rem', fontWeight:800,
                                              color: visual.color || '#fff'
                                            }}>{visual.label}</span>
                                          </td>
                                          {exIsTimed ? (
                                            <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff', fontWeight:600 }}>{set.time || '00:00'}</td>
                                          ) : exIsCardioHist ? (
                                            <>
                                              <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff', fontWeight:600 }}>{set.distanceKm} km</td>
                                              <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff' }}>{set.time || '00:00'}</td>
                                            </>
                                          ) : (
                                            <>
                                              {/* Bodyweight exercises log weight: 0 when no plate/vest was
                                                  added — show "BW" like the live logger does, instead of
                                                  the raw "0 kg" which reads as a logging error. */}
                                              <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff', fontWeight:600 }}>{exIsBodyweightHist && !(Number(set.weight) > 0) ? 'BW' : `${set.weight} kg`}</td>
                                              <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff' }}>{set.reps} reps</td>
                                              <td style={{ padding:'4px 0', fontSize:'0.7rem', color:'var(--text-muted)' }}>{((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)).toFixed(0)} kg</td>
                                            </>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TEMPLATES VIEW ─── */}
      {activeView === 'templates' && (
        <div className="wt-templates-outer">

          {/* Coach's Plan section (only if client has a coach plan). isAssigned
              excludes coach-only records (e.g. a plan auto-saved from Live
              Log) that haven't actually been assigned to this client — see
              TrainerDashboard's "Assign to client" action. */}
          {(() => {
            const coachPlansTpl = clientPlans.filter(p => p.createdBy === 'coach' && p.isAssigned !== false);
            const visibleCoachPlansTpl = showAllCoachPlans ? coachPlansTpl : coachPlansTpl.slice(0, 3);
            return coachPlansTpl.length > 0 && (
              <div className="wt-picker-section">
                <div className="wt-picker-section-header">
                  <span className="wt-picker-section-title">📋 Coach Plans <span className="wt-count-badge">{coachPlansTpl.length} available</span></span>
                  {coachPlansTpl.length > 3 && (
                    <button type="button" className="wt-view-all-btn" onClick={() => setShowAllCoachPlans(v => !v)}>
                      {showAllCoachPlans ? 'Show less' : 'View all'}
                    </button>
                  )}
                </div>
                <div className="wt-plan-list">
                  {visibleCoachPlansTpl.map(plan => (
                    <PlanCard
                      key={plan.id || plan.planName}
                      plan={plan}
                      source="coach"
                      // Was routed through handleStartFromTemplate, which was
                      // built for the older flat {sets: <count>, reps: '<n>'}
                      // shape — it discarded each set's real weight (always
                      // reset to '0') and reps (always defaulted to 10),
                      // wiping out whatever the coach entered when assigning
                      // the plan. startPlan preserves the actual per-set data.
                      onStart={() => { startPlan(plan, 'coach'); setActiveView('log'); }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Workout Library — Beginner / Intermediate / Advanced */}
          <div className="wt-section">
            <div className="wt-library-header">
              <div>
                <h3 className="wt-library-title">Workout Library</h3>
                <p className="wt-library-sub">Structured programs for every level</p>
              </div>
            </div>

            <div className="wt-level-tabs" data-tour="wt-level-tabs">
              {['beginner', 'intermediate', 'advanced'].map(level => (
                <button
                  key={level}
                  className={`wt-level-tab wt-level-tab--${level}${genericLevel === level ? ' active' : ''}`}
                  onClick={() => { setGenericLevel(level); setShowAllLevelWorkouts(false); tour.advanceIfStep(3, 4); }}
                >
                  {level === 'beginner' && '🌱 '}
                  {level === 'intermediate' && '⚡ '}
                  {level === 'advanced' && '🔥 '}
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>

            {loadingLevelWorkouts ? (
              <div className="wt-empty-state">
                <span>⏳</span> Loading {genericLevel} workouts…
              </div>
            ) : levelWorkouts.length === 0 ? (
              <div className="wt-empty-state">
                <span>📭</span> No {genericLevel} workouts available yet.
              </div>
            ) : (
              <div className="wt-library-grid">
                {(showAllLevelWorkouts ? levelWorkouts : levelWorkouts.slice(0, 4)).map(workout => {
                  const exList = Array.isArray(workout.exercises) ? workout.exercises : [];
                  return (
                    <button
                      key={workout.id}
                      type="button"
                      className={`wt-program-card wt-program-card--${genericLevel}`}
                      onClick={() => handleStartFromTemplate({ name: workout.name, exercises: exList })}
                    >
                      <div className={`wt-program-tile wt-program-tile--${genericLevel}`}>
                        {programTileWords(workout.name).map((word, i) => (
                          <span key={i} className={i === 0 ? 'wt-program-tile-accent' : undefined}>{word}</span>
                        ))}
                      </div>
                      <div className="wt-program-info">
                        <div className="wt-program-name">{workout.name}</div>
                        <div className="wt-program-meta">
                          <span className={`wt-program-dot wt-program-dot--${genericLevel}`} />
                          {exList.length} exercise{exList.length === 1 ? '' : 's'}
                        </div>
                        {exList.length > 0 && (
                          <div className="wt-program-preview">
                            {exList.slice(0, 3).map(e => e.name).join(' · ')}{exList.length > 3 ? ` +${exList.length - 3}` : ''}
                          </div>
                        )}
                      </div>
                      <span className="wt-program-chevron">›</span>
                    </button>
                  );
                })}
                {!showAllLevelWorkouts && levelWorkouts.length > 4 && (
                  <button
                    type="button"
                    className="wt-show-all-btn"
                    onClick={() => setShowAllLevelWorkouts(true)}
                  >
                    Show all {levelWorkouts.length} programs
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick empty start CTA */}
          <div className="wt-blank-cta">
            <button
              className="wt-blank-btn"
              onClick={() => {
                setLogExercises(getDefaultWarmupExercises());
                setTemplateName('Custom Session');
                setLogClient(loggedInUser);
                setLogDate(getLocalDateString());
                resetWorkoutTimer();
                setIsLoggingWorkout(true);
                setActiveView('log');
              }}
            >
              + Start empty workout
            </button>
          </div>
        </div>
      )}

      {activeView === 'log' && !isLoggingWorkout && (() => {
        // startPlan is defined at component scope (see above) — shared with
        // the Coach Plans card in the Templates view.
        const templatePlans = clientPlans.filter(p => p.createdBy === 'client');
        const visibleTemplatePlans = showAllTemplates ? templatePlans : templatePlans.slice(0, 3);

        const handleDeleteTemplate = async (plan) => {
          if (confirm('Are you sure you want to delete this template?')) {
            await databaseService.deleteWorkoutPlan(plan.id, getPlanOwnerId());
            fetchPlans();
          }
        };

        return (
          <div className="routines-launcher-wrapper glass-panel" style={{ padding: '20px', width: '100%' }}>
            <div className="launcher-header" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 800 }}>🏋️‍♂️ Start Workout Session</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select a coach plan, a saved template, or start empty.</p>
            </div>

            <button
              type="button"
              data-tour="wt-start-empty-card"
              className="wt-start-empty-card"
              onClick={() => {
                setLogClient(selectedClient);
                setLogDate(getLocalDateString());
                setLogExercises(getDefaultWarmupExercises());
                setTemplateName('');
                setIsLoggingWorkout(true);
                resetWorkoutTimer();
              }}
            >
              <span className="wt-start-empty-icon">+</span>
              <div className="wt-start-empty-text">
                <strong>Start Empty Workout</strong>
                <span>Create a workout from scratch</span>
              </div>
              <span className="wt-start-empty-chevron">›</span>
            </button>

            {/* My Saved Templates */}
            <div className="wt-picker-section">
              <div className="wt-picker-section-header">
                <span className="wt-picker-section-title">👤 Saved Templates <span className="wt-count-badge">{templatePlans.length} templates</span></span>
                {templatePlans.length > 3 && (
                  <button type="button" className="wt-view-all-btn" onClick={() => setShowAllTemplates(v => !v)}>
                    {showAllTemplates ? 'Show less' : 'View all'}
                  </button>
                )}
              </div>
              {loadingPlans ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading templates...</p>
              ) : templatePlans.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No custom templates saved yet. Log a workout and check "Save as template" to create one.</p>
              ) : (
                <div className="wt-plan-list">
                  {visibleTemplatePlans.map(plan => <PlanCard key={plan.id} plan={plan} source="self" onStart={() => startPlan(plan, 'self')} onDelete={() => handleDeleteTemplate(plan)} />)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {activeView === 'log' && isLoggingWorkout && (
        <form onSubmit={handleFinishWorkoutPress} className="coach-log-form-wrapper glass-panel hevy-logger-wrapper">
          <div className="form-header">
            <div className="form-header-title-row">
              <h3>🏋️ Today's Workout</h3>
              <input
                type="date"
                className="session-date-tiny"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
            </div>
            <div className="form-double-col form-header-namerow">
              <div className="input-group">
                <label>Workout Name</label>
                <input
                  id="workoutNameInputTop"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Push Day, Leg Day, Custom Session…"
                />
              </div>
              {clientPlans.length > 0 && (
                <div className="input-group">
                  <label>Existing Plan</label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const plan = clientPlans.find(p => p.id === e.target.value);
                      // Same empty/malformed guard as startPlan above — loading
                      // an empty plan here used to wipe the current exercise
                      // list and replace it with nothing.
                      if (plan && !(plan.exercises || []).length) {
                        triggerToast('⚠️ This plan has no exercises saved.');
                        e.target.value = '';
                        return;
                      }
                      if (plan) {
                        setTemplateName(plan.planName);
                        setWorkoutSource(plan.createdBy === 'coach' ? 'coach' : 'self');
                        setLogExercises(plan.exercises.map(ex => ({
                          name: ex.name,
                          sets: ex.sets.map(s => isCardioExercise(ex.name)
                            ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
                            : isTimedExercise(ex.name)
                            ? { time: s.time ?? '', isCompleted: false }
                            // s.reps/s.weight can genuinely be missing (e.g. a loaded-carry
                // exercise like Farmer Walk saved from a source that didn't fill
                // both fields) — String(undefined) renders as the literal text
                // "undefined" in the input box instead of leaving it blank, same
                // bug the cardio/timed branches above already guard against with
                // `?? ''`. This branch never got that guard.
                : { reps: String(s.reps ?? ''), weight: String(s.weight ?? ''), isCompleted: false })
                        })));
                        // See startPlan's comment above — setTimers is keyed
                        // positionally, not by exercise identity, so switching
                        // plans mid-session leaves a previous plan's timed-set
                        // stopwatch state attached to whatever lands at the
                        // same index in the new one.
                        setSetTimers({});
                        triggerToast(`📋 Loaded exercises from "${plan.planName}"!`);
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="" disabled>Select template</option>
                    {clientPlans.map(p => (
                      <option key={p.id} value={p.id}>{p.planName}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Hevy Stopwatch Header — same idle/running/paused bar as the coach's
              Live Log: stays idle (no clock, no Pause button) until the first
              set is marked done, then ticks and shows live calories. */}
          <div className="hevy-stopwatch-banner">
            <div className="timer-display">
              {workoutTimerStatus === 'idle' ? (
                <span className="live-timer-idle-hint">Timer starts when you log your first set</span>
              ) : (
                <>
                  <strong className={`stopwatch-time ${workoutTimerStatus === 'paused' ? 'is-paused' : ''}`}>
                    {formatStopwatchTime(workoutActiveSeconds)}
                  </strong>
                  <span className="live-kcal-badge">🔥 {liveOwnWorkoutKcal} kcal</span>
                </>
              )}
            </div>
            <div className="timer-controls">
              {workoutTimerStatus !== 'idle' && (
                <>
                  <button
                    type="button"
                    className="btn-timer-stopwatch"
                    onClick={() => setShowClockTimer(true)}
                    title="Timer / Stopwatch"
                  >
                    <StopwatchIcon size={22} />
                  </button>
                  <button
                    type="button"
                    className="btn-timer-toggle"
                    onClick={workoutTimerStatus === 'running' ? handlePauseWorkoutTimer : handleResumeWorkoutTimer}
                    title={workoutTimerStatus === 'running' ? 'Pause' : 'Resume'}
                  >
                    {workoutTimerStatus === 'running' ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Package status is only relevant to a connected client when their
              sessions are nearly used up — surface it (with the renewal action)
              only at ≤3 remaining, otherwise keep the logger clean. */}
          {hasCoachAssigned && hasAssignedSessions && remainingSessionsCount <= 3 && (
            <div className="coach-billing-status-box">
              <div className="status-meta">
                <strong>⚠️ Only {remainingSessionsCount} session{remainingSessionsCount === 1 ? '' : 's'} left</strong>
                <p>You've completed {completedSessionsCount} of {activeProfile.totalSessions}. Renew to keep training with your coach.</p>
              </div>
              <button type="button" className="btn-renew-action-sm" onClick={renewSessionPackage}>
                💳 Renew Package (+12 Sessions)
              </button>
            </div>
          )}


          <div className="exercises-form-section">
            <div className="section-title-row" style={{ position: 'relative' }}>
              <p className="workout-log-instructions">Enter your reps and weights, then tick each set as you complete it.</p>
            </div>

            <div className="exercises-input-list">
              {logExercises.map((ex, exIdx) => {
                const unit = getExerciseUnit(ex.name);
                const exIsCardio = isCardioExercise(ex.name);
                const exIsBodyweight = isBodyweightExercise(ex.name);
                const exBwMode = exIsBodyweight ? getLogExBwMode(ex) : false;
                const exIsWarmup = isWarmupExercise(ex.name);
                return (
                  <div key={exIdx} className="form-exercise-card hevy-exercise-card" data-tour={exIdx === 0 ? 'wt-log-exercise-card' : undefined}>
                    <div className="ex-card-header">
                      <div className="ex-card-title-group">
                        <span className="ex-indicator-dot"></span>
                        <h5
                          className="ex-name-clickable"
                          role="button"
                          tabIndex={0}
                          title="View exercise history"
                          onClick={() => setHistoryModalExercise(ex.name)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryModalExercise(ex.name); } }}
                        >
                          {ex.name}
                        </h5>
                        <button
                          type="button"
                          className="btn-form-guide-sm"
                          onClick={() => {
                            const matched = findExerciseGuideMatch(exercisesList, ex.name) ||
                                            findExerciseGuideMatch(allExerciseOptions, ex.name);
                            if (matched) {
                              setActiveGuideExercise(normalizeExerciseForGuide(matched));
                            } else {
                              setActiveGuideExercise({
                                name: ex.name,
                                category: 'Custom',
                                videoFile: '',
                                guide: {
                                  target: 'Primary Muscle Group',
                                  setup: 'Position yourself comfortably with stable support and check alignment.',
                                  execution: 'Control the weights through a full range of motion. Keep core tight.',
                                  tip: 'Focus on mind-muscle connection and avoid using momentum.'
                                }
                              });
                            }
                          }}
                        >
                          🎬 Form Guide
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn-delete-exercise-card"
                        onClick={() => setLogExercises(prev => prev.filter((_, idx) => idx !== exIdx))}
                        title="Remove Exercise"
                        style={{ display: 'flex', alignItems: 'center' }}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>

                    {exIsBodyweight && (
                      <div className="bw-toggle-row">
                        <button
                          type="button"
                          className={`bw-toggle-btn ${exBwMode ? 'active' : ''}`}
                          onClick={() => { if (!exBwMode) handleToggleLogBodyweightMode(exIdx); }}
                        >
                          Bodyweight
                        </button>
                        <button
                          type="button"
                          className={`bw-toggle-btn ${!exBwMode ? 'active' : ''}`}
                          onClick={() => { if (exBwMode) handleToggleLogBodyweightMode(exIdx); }}
                        >
                          + Add Weight
                        </button>
                      </div>
                    )}

                    <div className="hevy-sets-table">
                      <div className={`hevy-table-header ${exIsCardio ? 'hevy-set-row--cardio' : ''}`}>
                        <span className="col-set">SET</span>
                        <span className="col-prev">PREV</span>
                        {exIsCardio ? (
                          <>
                            <span className="col-weight">KM</span>
                            <span className="col-reps">TIME</span>
                          </>
                        ) : isTimedExercise(ex.name) ? (
                          <>
                            <span className="col-weight">TIME</span>
                            <span className="col-reps"></span>
                          </>
                        ) : isLoadedCarryExercise(ex.name) ? (
                          <>
                            <span className="col-weight">🏋️ {unit}</span>
                            <span className="col-reps">METERS</span>
                          </>
                        ) : exIsWarmup ? (
                          <>
                            <span className="col-weight"></span>
                            <span className="col-reps">REPS</span>
                          </>
                        ) : exIsBodyweight ? (
                          <>
                            <span className="col-weight">{exBwMode ? 'BODYWEIGHT' : `🏋️ ${unit}`}</span>
                            <span className="col-reps">REPS</span>
                          </>
                        ) : (
                          <>
                            <span className="col-weight">🏋️ {unit}</span>
                            <span className="col-reps">REPS</span>
                          </>
                        )}
                        <span className="col-check" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            title="Mark all sets done"
                            onClick={() => setLogExercises(prev => prev.map((e, i) => i === exIdx
                              ? { ...e, sets: e.sets.map(s => ({ ...s, isCompleted: true })) }
                              : e
                            ))}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: ex.sets.every(s => s.isCompleted) ? '#10b981' : 'rgba(148,163,184,0.5)',
                              fontSize: '0.85rem', padding: '2px 4px', lineHeight: 1
                            }}
                          >✓ all</button>
                        </span>
                      </div>
                      <div className="hevy-table-body">
                        {ex.sets.map((set, sIdx) => {
                          const prevStats = getPreviousSessionSet(ex.name, sIdx);
                          // Warm-up sets show "W"; failure = "F"; drop = "D"; others get a working-set number.
                          const workingSetNumber = ex.sets.slice(0, sIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                          const setDisplayLabel = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.isWarmup ? 'W' : workingSetNumber;
                          return (
                            <div
                              key={sIdx}
                              className={`hevy-set-row ${exIsCardio ? 'hevy-set-row--cardio' : ''} ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}
                            >
                              <span className="col-set set-type-menu-wrapper">
                                <span
                                  className={`set-num-lbl ${set.isWarmup ? 'warmup' : ''} ${set.setType === 'failure' ? 'failure' : ''} ${set.setType === 'drop' ? 'drop' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSetTypeMenu(prev => (prev?.exIdx === exIdx && prev?.sIdx === sIdx) ? null : { exIdx, sIdx });
                                  }}
                                  role="button"
                                  title="Change set type"
                                >
                                  {setDisplayLabel}
                                </span>
                                {setTypeMenu?.exIdx === exIdx && setTypeMenu?.sIdx === sIdx && (
                                  <SetTypeMenu onSelect={(type) => handleChangeSetType(exIdx, sIdx, type)} />
                                )}
                              </span>
                              <span className="col-prev set-prev-lbl">{prevStats}</span>
                              {exIsCardio ? (() => {
                                const cardioTimerKey = getSetTimerKey(exIdx, sIdx);
                                const cardioTimer = setTimers[cardioTimerKey];
                                const cardioRunning = cardioTimer?.isRunning || false;
                                // While running, show the live-ticking value; once paused/stopped,
                                // set.time is the source of truth again and stays freely editable
                                // (e.g. to correct a time typed before the client hit play).
                                const liveSeconds = cardioRunning ? getSetElapsedSeconds(exIdx, sIdx) : (parseTimeStringToSeconds(set.time) || 0);
                                // No GPS/sensor behind this — while running (and until the client
                                // types their own number), KM shows an estimate from a typical pace
                                // for this exercise, ticking up alongside the live time instead of
                                // sitting frozen at whatever it was when they hit play.
                                const cardioAutoKm = cardioRunning && cardioTimer?.autoKm !== false;
                                const displayKm = cardioAutoKm ? estimateCardioDistanceKm(ex.name, liveSeconds) : set.distanceKm;
                                const kmKey = `km-${exIdx}-${sIdx}`;
                                const timeKey = `time-${exIdx}-${sIdx}`;
                                registerSetField(kmKey, {
                                  value: displayKm,
                                  mode: 'decimal',
                                  label: `${ex.name} · Km`,
                                  onValue: (v) => handleCardioKmEdit(exIdx, sIdx, v),
                                  onNext: () => openSetField(timeKey),
                                });
                                registerSetField(timeKey, {
                                  value: set.time,
                                  mode: 'time',
                                  label: `${ex.name} · Time`,
                                  onValue: (v) => handleCardioTimeEdit(exIdx, sIdx, v),
                                  onPrev: () => openSetField(kmKey),
                                });
                                return (
                                  <>
                                    <div className="col-weight set-input-field">
                                      <SetValueField
                                        value={displayKm}
                                        placeholder="0"
                                        disabled={set.isCompleted}
                                        active={activeSetKey === kmKey}
                                        onOpen={() => openSetField(kmKey)}
                                      />
                                    </div>
                                    <div className="col-reps cardio-time-field">
                                      <button
                                        type="button"
                                        className="btn-cardio-stopwatch"
                                        style={{ color: cardioRunning ? '#e5e7eb' : '#fb923c' }}
                                        onClick={() => (cardioRunning ? handleCardioStopwatchPause(exIdx, sIdx) : handleCardioStopwatchStart(exIdx, sIdx))}
                                        disabled={set.isCompleted}
                                        title={cardioRunning ? 'Pause' : 'Start'}
                                      >
                                        {cardioRunning ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                                      </button>
                                      {cardioRunning ? (
                                        // Same idea as the timed-exercise stopwatch: while running,
                                        // swap the editable input for compact live text — that's
                                        // what frees up room to show time + calories together on
                                        // one line instead of the calorie readout getting pushed to
                                        // a second line underneath.
                                        <span className="cardio-live-time">{formatSecondsToTimeString(liveSeconds)}</span>
                                      ) : (
                                        <SetValueField
                                          value={set.time}
                                          placeholder="mm:ss"
                                          disabled={set.isCompleted}
                                          active={activeSetKey === timeKey}
                                          onOpen={() => openSetField(timeKey)}
                                          className="cardio-time-input"
                                        />
                                      )}
                                    </div>
                                  </>
                                );
                              })() : isTimedExercise(ex.name) ? (
                                <>
                                  <div className="col-weight" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 8px' }}>
                                    {(() => {
                                      // Once the set is completed, its time is frozen in set.time —
                                      // the live timer entry is deleted on completion (see
                                      // handleSetStopwatchComplete), so reading from setTimers here
                                      // would show 00:00 instead of the saved duration.
                                      if (set.isCompleted) {
                                        return (
                                          <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: '#fff' }}>
                                            {set.time || formatSecondsToTimeString(0)}
                                          </span>
                                        );
                                      }
                                      const timerKey = getSetTimerKey(exIdx, sIdx);
                                      const timer = setTimers[timerKey];
                                      const isRunning = timer?.isRunning || false;
                                      const elapsedSeconds = getSetElapsedSeconds(exIdx, sIdx);
                                      const timeStr = formatSecondsToTimeString(elapsedSeconds);
                                      return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                                          <button
                                            type="button"
                                            onClick={() => isRunning ? handleSetStopwatchPause(exIdx, sIdx) : handleSetStopwatchStart(exIdx, sIdx)}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: 'rgba(148,163,184,0.7)',
                                              fontSize: '1.1rem',
                                              cursor: 'pointer',
                                              padding: '2px 4px',
                                              display: 'flex',
                                              alignItems: 'center'
                                            }}
                                            title={isRunning ? 'Pause' : 'Start'}
                                          >
                                            {isRunning ? '⏸' : '▶'}
                                          </button>
                                          {isRunning ? (
                                            <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: '#fff' }}>
                                              {timeStr}
                                            </span>
                                          ) : (
                                            // Not running — editable directly, same as the cardio time
                                            // field, instead of only settable by running the stopwatch
                                            // live. Pressing Start again resumes from whatever's typed
                                            // here (see handleSetStopwatchStart's fallback).
                                            (() => {
                                              const timedKey = `timed-${exIdx}-${sIdx}`;
                                              registerSetField(timedKey, {
                                                value: set.time || '',
                                                mode: 'time',
                                                label: `${ex.name} · Time`,
                                                onValue: (v) => handleTimedSetTimeEdit(exIdx, sIdx, v),
                                              });
                                              return (
                                                <SetValueField
                                                  value={set.time || ''}
                                                  placeholder="mm:ss"
                                                  active={activeSetKey === timedKey}
                                                  onOpen={() => openSetField(timedKey)}
                                                  className="cardio-time-input"
                                                />
                                              );
                                            })()
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="col-reps"></div>
                                </>
                              ) : (() => {
                                const weightKey = `w-${exIdx}-${sIdx}`;
                                const repsKey = `r-${exIdx}-${sIdx}`;
                                registerSetField(weightKey, {
                                  value: set.weight,
                                  mode: 'decimal',
                                  label: `${ex.name} · Kg`,
                                  onValue: (v) => handleSetChange(exIdx, sIdx, 'weight', v),
                                  onNext: () => openSetField(repsKey),
                                });
                                registerSetField(repsKey, {
                                  value: set.reps,
                                  mode: 'integer',
                                  label: `${ex.name} · Reps`,
                                  onValue: (v) => handleSetChange(exIdx, sIdx, 'reps', v),
                                  ...(exIsWarmup || (exIsBodyweight && exBwMode) ? {} : { onPrev: () => openSetField(weightKey) }),
                                });
                                return (
                                  <>
                                    {exIsWarmup ? (
                                      <div className="col-weight" />
                                    ) : exIsBodyweight && exBwMode ? (
                                      <div className="col-weight bw-static-label">BW</div>
                                    ) : (
                                      <div className="col-weight set-input-field">
                                        <SetValueField
                                          value={set.weight}
                                          placeholder="0"
                                          disabled={set.isCompleted}
                                          active={activeSetKey === weightKey}
                                          onOpen={() => openSetField(weightKey)}
                                        />
                                      </div>
                                    )}
                                    <div className="col-reps set-input-field">
                                      <SetValueField
                                        value={set.reps}
                                        placeholder={set.targetReps || '0'}
                                        disabled={set.isCompleted}
                                        active={activeSetKey === repsKey}
                                        onOpen={() => openSetField(repsKey)}
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                              <div className="col-check set-actions-field">
                                <button
                                  type="button"
                                  className={`btn-hevy-check ${set.isCompleted ? 'completed' : ''}`}
                                  onClick={() => (isTimedExercise(ex.name) || exIsCardio) && !set.isCompleted ? (exIsCardio ? handleCardioSetComplete(exIdx, sIdx) : handleSetStopwatchComplete(exIdx, sIdx)) : handleToggleSetCompleted(exIdx, sIdx)}
                                  title={(isTimedExercise(ex.name) || exIsCardio) && !set.isCompleted ? "Save time and complete" : "Toggle Complete"}
                                >
                                  {set.isCompleted ? '✓' : ''}
                                </button>
                                
                                {ex.sets.length > 1 && (
                                  <button 
                                    type="button" 
                                    className="btn-hevy-row-delete"
                                    onClick={() => handleRemoveSet(exIdx, sIdx)}
                                    title="Delete Set"
                                  >
                                    <TrashIcon size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="ex-card-actions">
                      <button
                        type="button"
                        className="btn-add-set-link"
                        onClick={() => handleAddSet(exIdx)}
                      >
                        ➕ Add Set
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Exercise — picker button kept at the bottom of the list. */}
            <div className="live-add-ex-box">
              <button
                type="button"
                data-tour="wt-add-exercise-btn"
                className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth"
                onClick={() => setShowExerciseDbModal(true)}
              >
                ➕ Add Exercise
              </button>
            </div>

            {/* Primary session action lives all the way at the bottom (same
                submit flow the old top "Finish" button used), with a direct
                discard escape hatch beside it for a session the client
                doesn't want to keep. */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                style={{
                  width: 'auto', flex: '0 0 auto', background: 'transparent', border: 'none',
                  color: '#ef4444', padding: '0 8px', display: 'flex', alignItems: 'center', cursor: 'pointer'
                }}
                onClick={() => setShowDiscardConfirmModal(true)}
                title="Discard this workout session"
              >
                <TrashIcon size={28} />
              </button>
              <button type="submit" data-tour="wt-save-workout-btn" className="btn-save-workout-session" style={{ width: 'auto', flex: 1 }}>
                💾 Save Workout Session
              </button>
            </div>
          </div>
        </form>
      )}
      </div>

      {showClockTimer && (
        <ClockTimerModal onClose={() => setShowClockTimer(false)} />
      )}

      {/* Direct discard confirmation — reachable without needing to hit
          Finish first (that path is the "empty sets" modal above). */}
      {showDiscardConfirmModal && (
        <div className="payment-gateway-backdrop warning-modal-backdrop" onClick={() => setShowDiscardConfirmModal(false)}>
          <div className="payment-gateway-modal warning-modal-card animate-scale-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="payment-modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
              <div className="modal-title-box">
                <span className="secure-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️ DISCARD SESSION</span>
                <h3 style={{ marginTop: '8px', fontSize: '1.2rem', color: 'var(--text-main)' }}>Discard this workout?</h3>
              </div>
              <button
                type="button"
                className="btn-close-modal-x"
                onClick={() => setShowDiscardConfirmModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div className="warning-modal-body" style={{ padding: '20px 4px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.6', margin: 0 }}>
                All sets logged in this session will be permanently deleted. This can't be undone.
              </p>
            </div>

            <div className="summary-actions-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn-cancel-summary"
                onClick={() => setShowDiscardConfirmModal(false)}
                style={{ flex: 1, padding: '12px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}
              >
                Keep Logging
              </button>
              <button
                type="button"
                className="btn-confirm-save-hevy"
                style={{
                  flex: 1, padding: '12px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onClick={() => {
                  handleDiscardWorkout();
                  setShowDiscardConfirmModal(false);
                }}
              >
                <TrashIcon size={16} /> Discard Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Invoice Amount Details Modal */}
      {showPaymentModal && paymentProgram && (() => {
        const breakdown = getAmountBreakdown(paymentProgram.price);
        return (
          <div className="payment-gateway-backdrop">
            <div className="payment-gateway-modal invoice-modal animate-scale-in">
              <div className="payment-modal-header">
                <div className="modal-title-box">
                  <span className="secure-badge">🧾 BILLING INVOICE</span>
                  <h3>Payment Amount Details</h3>
                </div>
                <button 
                  type="button" 
                  className="btn-close-modal"
                  onClick={() => setShowPaymentModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="invoice-client-card">
                <div className="client-meta-row">
                  <span>Client Name:</span>
                  <strong>{selectedClient}</strong>
                </div>
                <div className="client-meta-row">
                  <span>Coaching Course:</span>
                  <strong>{paymentProgram.name}</strong>
                </div>
                <div className="client-meta-row">
                  <span>Sessions Package:</span>
                  <strong>{paymentProgram.sessions} Sessions</strong>
                </div>
              </div>

              <div className="invoice-breakdown-details">
                <div className="invoice-row">
                  <span>Subtotal (Base Price)</span>
                  <span>{breakdown.base}</span>
                </div>
                <div className="invoice-row">
                  <span>Integrated GST (18%)</span>
                  <span>{breakdown.gst}</span>
                </div>
                <div className="invoice-row total-row">
                  <span>Grand Total Payable</span>
                  <strong>{breakdown.total}</strong>
                </div>
              </div>

              <div className="secure-payment-notice">
                <span>🔒</span>
                <p>Fitengineers Secure Billing request. The program track will be activated instantly on payment success.</p>
              </div>

              <form onSubmit={handlePaymentSubmit} className="payment-gateway-form">
                <button 
                  type="submit" 
                  className="btn-pay-submit" 
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <span className="pay-loader-row">
                      <span className="spinner-dot"></span>
                      Processing Payment of {breakdown.total}...
                    </span>
                  ) : (
                    `Pay Grand Total ${breakdown.total}`
                  )}
                </button>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Shared Hevy-style exercise picker (same component as the coach side) */}
      <ExercisePickerModal
        open={showExerciseDbModal}
        onClose={() => setShowExerciseDbModal(false)}
        addedNames={logExercises.map(le => le.name)}
        onAdd={(name) => {
          const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === name.toLowerCase());
          if (alreadyAdded) { triggerToast(`"${name}" is already in your active workout.`); return; }
          let newSet;
          const bodyweight = isBodyweightExercise(name);
          if (isCardioExercise(name)) {
            newSet = { distanceKm: '', time: '', isCompleted: false };
          } else if (isTimedExercise(name)) {
            newSet = { time: '', isCompleted: false };
          } else if (bodyweight || isWarmupExercise(name)) {
            newSet = { reps: 10, weight: '0', isCompleted: false };
          } else {
            newSet = { reps: 10, weight: '5.0', isCompleted: false };
          }
          setLogExercises(prev => [...prev, bodyweight ? { name, sets: [newSet], bodyweightMode: true } : { name, sets: [newSet] }]);
          triggerToast(`Added ${name} to active workout!`);
        }}
        onRemove={(name) => {
          setLogExercises(prev => prev.filter(le => le.name.toLowerCase() !== name.toLowerCase()));
          triggerToast(`Removed ${name}.`);
        }}
        onShowFormGuide={(name) => {
          const matched = findExerciseGuideMatch(exercisesList, name) ||
                          findExerciseGuideMatch(allExerciseOptions, name);
          if (matched) {
            setActiveGuideExercise(normalizeExerciseForGuide(matched));
          } else {
            setActiveGuideExercise({
              name,
              category: 'Custom',
              videoFile: '',
              guide: {
                target: 'Primary Muscle Group',
                setup: 'Position yourself comfortably with stable support and check alignment.',
                execution: 'Control the weights through a full range of motion. Keep core tight.',
                tip: 'Focus on mind-muscle connection and avoid using momentum.'
              }
            });
          }
        }}
      />

      {/* Hevy-Style Finish Workout PR & Volume Analytics Modal */}
      {showFinishSummary && summaryStats && (
        <div className="payment-gateway-backdrop summary-modal-backdrop">
          <div className="payment-gateway-modal summary-modal-card animate-scale-in" style={{ maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="payment-modal-header">
              <div className="modal-title-box">
                <span className="secure-badge">🏆 WORKOUT SUMMARY</span>
                <h3>Session Finished!</h3>
              </div>
            </div>

            <div className="summary-stats-grid">
              <div className="stat-card">
                <span>⏱️ TIME COMPLETED</span>
                <strong>{summaryStats.duration}</strong>
              </div>
              <div className="stat-card">
                <span>🏋️‍♂️ TOTAL LIFTED</span>
                <strong>{summaryStats.volume} kg</strong>
              </div>
              <div className="stat-card">
                <span>✓ SETS COMPLETED</span>
                <strong>{summaryStats.totalSets}</strong>
              </div>
            </div>

            <div className="secure-payment-notice summary-notice-emerald" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', borderLeft: '3px solid var(--primary-accent-light)', padding: '10px 12px' }}>
              <p style={{ fontSize: '0.78rem', lineHeight: '1.45', color: 'var(--text-main)', margin: 0 }}>
                <strong>{templateName || 'Workout'}</strong> completed in <strong>{summaryStats.duration}</strong>. A total of <strong>{summaryStats.volume} kg</strong> lifted across <strong>{summaryStats.totalSets} active sets</strong> — great work!
              </p>
            </div>

            {summaryStats.prs.length > 0 && (
              <div className="summary-prs-section" style={{ marginTop: '12px' }}>
                <h4>🔥 Personal Records (PRs) Broken!</h4>
                <div className="prs-list">
                  {summaryStats.prs.map((pr, idx) => (
                    <div key={idx} className="pr-item-card">
                      <span className="pr-trophy">🏆</span>
                      <div className="pr-details">
                        <strong>{pr.exerciseName}</strong>
                        <span>New Peak: {pr.newRecord}{pr.unit} (Prev: {pr.oldRecord}{pr.unit})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="template-save-option-box" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '12px', textAlign: 'left', width: '100%' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={saveAsTemplate} 
                  onChange={(e) => setSaveAsTemplate(e.target.checked)} 
                />
                <span>💾 Save this session as a repeat template</span>
              </label>
              {saveAsTemplate && (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(148,163,184,0.8)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '4px' }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={customTemplateName}
                    onChange={(e) => setCustomTemplateName(e.target.value)}
                    placeholder={templateName || 'e.g. Push Day, My Leg Routine…'}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'rgba(9,14,23,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 'var(--radius-sm)', padding: '9px 11px', color: '#fff',
                      fontSize: '16px', outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>

            <div className="summary-actions-row">
              <button 
                type="button" 
                className="btn-cancel-summary"
                onClick={() => setShowFinishSummary(false)}
              >
                Go Back
              </button>
              <button 
                type="button" 
                className="btn-confirm-save-hevy"
                onClick={handleConfirmSaveWorkout}
              >
                Confirm Save
              </button>
            </div>
          </div>
        </div>
      )}

      {shareCardData && (
        <WorkoutShareCard session={shareCardData} onClose={() => setShareCardData(null)} />
      )}

      {/* Floating Hevy Rest Timer Overlay. Both the rest-started moment and the
          rest-finished moment used to interrupt with a toast; now the card
          itself blinks (key={restPulseKey} forces a remount so the CSS blink
          animation replays every time, since re-applying the same class
          wouldn't restart an animation already in progress).

          Portaled to .app-container (not rendered in place) so it's a
          sibling of .main-content instead of a descendant — sitting inside
          .main-content, its position:absolute still scrolled away with
          that container's own scroll even though its containing block
          (.app-container) never moves; a scrollable ancestor between an
          absolutely-positioned element and its containing block still
          drags it along. Portaling out fixes it at the bottom of the
          screen regardless of scroll position, matching Hevy's own
          behavior. */}
      {restTimerActive && (restSecondsRemaining > 0 || restJustFinished) && createPortal(
        <div
          key={restPulseKey}
          className={`rest-timer-floating-card ${restJustFinished ? 'rest-timer-pulse-finish' : 'rest-timer-pulse-start'}`}
        >
          <div className="rest-timer-header-row">
            <span className="rest-icon">{restJustFinished ? '✅' : '⏱️'}</span>
            <span className="rest-timer-label">{restJustFinished ? 'REST OVER' : 'REST TIMER'}</span>
          </div>

          {restJustFinished ? (
            <strong className="rest-timer-finished-msg">Time for your next set!</strong>
          ) : (
            <>
              <div className="rest-timer-big-time">{formatSecondsToTimeString(restSecondsRemaining)}</div>
              <div className="rest-timer-actions">
                <button
                  type="button"
                  className="btn-rest-adjust"
                  onClick={() => setRestSecondsRemaining(prev => Math.max(0, prev - 15))}
                >
                  -15
                </button>
                <button
                  type="button"
                  className="btn-rest-adjust"
                  onClick={() => setRestSecondsRemaining(prev => prev + 15)}
                >
                  +15
                </button>
                <button
                  type="button"
                  className="btn-rest-skip"
                  onClick={() => {
                    setRestTimerActive(false);
                    setRestSecondsRemaining(0);
                    setRestJustFinished(false);
                  }}
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>,
        document.querySelector('.app-container') || document.body
      )}

      {/* Form Guide — Hevy-style bottom sheet, shared with the exercise
          picker's clickable thumbnail icon (and the coach side) */}
      <ExerciseGuideModal exercise={activeGuideExercise} onClose={() => setActiveGuideExercise(null)} />

      {/* Tap an exercise's name in the log card → full Daily/Weekly/Monthly/
          Yearly history for that exercise, scoped to the active client. */}
      <ExerciseHistoryModal
        exerciseName={historyModalExercise}
        sessions={sessions}
        clientName={selectedClient}
        onClose={() => setHistoryModalExercise(null)}
      />

      {/* Unticked Finish Warning Dialog Modal */}
      {showUntickedFinishModal && (
        <div className="payment-gateway-backdrop warning-modal-backdrop" onClick={() => setShowUntickedFinishModal(false)}>
          <div className="payment-gateway-modal warning-modal-card animate-scale-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="payment-modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
              <div className="modal-title-box">
                <span className="secure-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️ EMPTY LIFT LOGS</span>
                <h3 style={{ marginTop: '8px', fontSize: '1.2rem', color: 'var(--text-main)' }}>Empty Workout Session</h3>
              </div>
              <button 
                type="button" 
                className="btn-close-modal-x" 
                onClick={() => setShowUntickedFinishModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div className="warning-modal-body" style={{ padding: '20px 4px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                Please do finish the sets and then press finish button.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: '1.5', margin: 0 }}>
                Alternatively, do you want to discard the workout session?
              </p>
            </div>

            <div className="summary-actions-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button 
                type="button" 
                className="btn-cancel-summary"
                onClick={() => setShowUntickedFinishModal(false)}
                style={{ flex: 1, padding: '12px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}
              >
                ✍️ Keep Logging
              </button>
              <button 
                type="button" 
                className="btn-confirm-save-hevy"
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onClick={() => {
                  handleDiscardWorkout();
                  setShowUntickedFinishModal(false);
                }}
              >
                <TrashIcon size={16} /> Discard Session
              </button>
            </div>
          </div>
        </div>
      )}
      <SetNumberPad active={getActiveSetField()} activeKey={activeSetKey} onClose={closeSetField} />
    </>
  );
};

export default WorkoutTracker;
