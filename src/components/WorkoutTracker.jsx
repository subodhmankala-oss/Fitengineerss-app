import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './WorkoutTracker.css';
import databaseService, { isTrainer } from '../services/databaseService';
import { getLocalDateString } from '../utils/dateUtils';
import SetTypeMenu from './SetTypeMenu';
import ExerciseCardMenu from './ExerciseCardMenu';
import ExercisePickerModal from './ExercisePickerModal';
import { EXERCISE_LIBRARY, isCardioExercise, isTimedExercise, isLoadedCarryExercise, isBodyweightExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { presetExercises } from '../data/presetExercises';
import { computeElapsedSeconds, computeRestSecondsRemaining, computeLiveCalories, formatSecondsToTimeString, maskDigitsToTimeString, parseTimeStringToSeconds, estimateCardioKcal, estimateCardioDistanceKm, estimateTimedHoldKcal, DEFAULT_BODY_WEIGHT_KG, remapSetTimersForReorder, remapSetTimersForExerciseRemoval, remapSetTimersForSetRemoval, rankTemplatesByPerformance } from '../utils/liveWorkoutTimer';
import { normalizeExerciseForGuide, findExerciseGuideMatch, getYouTubeEmbedUrl } from '../utils/videoUtils';
import ExerciseGuideModal from './ExerciseGuideModal';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import { notifyEvent } from '../utils/pushNotify';
import { getMuscleGroupsForExercise, MUSCLE_TO_PPLC, MUSCLE_BODY_VIEW } from '../utils/muscleGroups';
import WorkoutShareCard from './WorkoutShareCard';
import './WorkoutShareCard.css';
import MuscleThumbnail, { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { useTour } from '../context/useTour';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import ClockTimerModal from './ClockTimerModal';
import { StopwatchIcon, PlayIcon, PauseIcon, DragHandleIcon } from './TimerIcons';
import { useReorderableList } from '../hooks/useReorderableList';
import { useWakeLock } from '../hooks/useWakeLock';
import { useLiveTick } from '../hooks/useLiveTick';
import { keepSetTimersForSameExercises, readSavedSetTimers, restoreSavedSetTimers } from '../utils/setTimerRestore';
import { playAlarmBeeps, unlockAudio } from '../utils/alarmSound';
import { checkForPendingPWAUpdate, applyPWAUpdate } from '../pwa/registerPWA';
import { useSetNumberPad } from '../utils/setInputUtils';
import SetNumberPad from './SetNumberPad';
import SetValueField from './SetValueField';
import { scrollFieldClearOfPad } from '../utils/numberPadScroll';
import { animateNewSetRow } from '../utils/animateNewSetRow';
import { useExitingSetRow } from '../hooks/useExitingSetRow';
import { findPreviousLoggedSetIn, findPreviousExerciseSetsIn, applyPrevValues, applyPrevRepsAndWeight, fillPendingPrevSets, setsFromPreviousExercise, buildProgressiveOverloadHint } from '../utils/prevSets';
import { markPlanOpened } from '../utils/openedCoachPlans';
import PlanCard, { TrashIcon } from './PlanCard';
import { getPlanCardMeta, PPLC_COLOR } from '../utils/planCardMeta';
import { getProgramTags } from '../utils/programCardTags';
import LibraryProgramPreview from './LibraryProgramPreview';

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

// presetExercises moved to src/data/presetExercises.js — this file (a React
// component module) was exporting it inline, which disables Vite Fast
// Refresh for the whole file (any non-component export forces a full
// module reload/remount on every edit instead of a state-preserving hot
// update). That was silently resetting the client's dashboard state back
// to a fresh "0 sessions" load on every edit made to this file. See that
// module's own comment for the full writeup.

// Form-guide lookup order: DB-sourced exercises (if loaded) take precedence,
// then the 16 rich presets (with video/guide), then the shared
// EXERCISE_LIBRARY for muscle info. The picker itself uses the shared
// library via <ExercisePickerModal>.
const allExerciseOptions = [...presetExercises, ...EXERCISE_LIBRARY]
  .filter((ex, idx, arr) => arr.findIndex(e => e.name.toLowerCase() === ex.name.toLowerCase()) === idx)
  .sort((a, b) => a.name.localeCompare(b.name));

// onWorkoutSaved: App.jsx sends the client to Home → Muscle Balance Overview
// once a workout is saved (after the summary card is closed, if one shows).
const WorkoutTracker = ({ onWorkoutSaved } = {}) => {
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
  // Remembers which top-level tab (Progress/Log Sets/Workouts) and which
  // Workout Library level (Beginner/Intermediate/Advanced) the client had
  // open, so a fresh mount of this component — e.g. switching away and back,
  // or a workout draft getting cleared from the Home screen's own "discard"
  // button (a separate component that has no way to reach this one's state) —
  // restores where they were instead of always resetting to Progress/
  // Beginner. Intentionally separate from workoutDraftKey: this is UI
  // navigation state, not session data, so it's never cleared on discard.
  const lastTabKey = `workoutTrackerLastTab_${localStorage.getItem('userId') || loggedInUser}`;
  const lastLevelKey = `workoutTrackerLastLevel_${localStorage.getItem('userId') || loggedInUser}`;
  const lastCategoryKey = `workoutTrackerLastCategory_${localStorage.getItem('userId') || loggedInUser}`;
  const loadLastTab = () => {
    try { return localStorage.getItem(lastTabKey) || null; } catch { return null; }
  };
  const loadLastLevel = () => {
    try {
      const saved = localStorage.getItem(lastLevelKey);
      return ['beginner', 'intermediate', 'advanced'].includes(saved) ? saved : null;
    } catch { return null; }
  };
  const loadLastCategory = () => {
    try {
      const saved = localStorage.getItem(lastCategoryKey);
      return ['gym', 'home'].includes(saved) ? saved : null;
    } catch { return null; }
  };
  const loadWorkoutDraft = () => {
    try {
      const raw = localStorage.getItem(workoutDraftKey);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      return draft && draft.isLoggingWorkout ? draft : null;
    } catch {
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

  // Drives the delete-set collapse animation through React state, keyed to
  // the CURRENT exIdx/setIdx every render — see useExitingSetRow's own
  // comment for why the old direct-DOM-mutation approach (animateRemoveSetRow)
  // left a permanently invisible "ghost" row behind whenever the deleted set
  // wasn't the last one in its exercise.
  const { isExitingSet, beginExit, handleAnimationEnd: handleExitAnimationEnd, registerRow } = useExitingSetRow();

  const [activeView, setActiveView] = useState(savedWorkoutDraft ? 'log' : (loadLastTab() || 'analytics')); // 'analytics', 'log', or 'programs'
  const [sessions, setSessions] = useState([]);
  const [clientProfiles, setClientProfiles] = useState([]);
  const [selectedClient, setSelectedClient] = useState(loggedInUser);
  const [selectedExercise, setSelectedExercise] = useState('Shoulders Press');

  // Custom templates and plans state
  const [isLoggingWorkout, setIsLoggingWorkout] = useState(!!savedWorkoutDraft);

  // Keep the screen from auto-locking/dimming only while an in-progress
  // session is actually open — not the whole app — most noticeable during a
  // live cardio set where the client's hands are on a treadmill/bike, not
  // the phone. Releases (via the hook's own unmount/visibilitychange
  // handling) the moment the session ends or the tab is hidden.
  useWakeLock(isLoggingWorkout);

  // SetNumberPad is rendered once, unconditionally, at the bottom of this
  // component's JSX — it isn't scoped inside the `activeView === 'log' &&
  // isLoggingWorkout` block that's the only place Kg/Reps/Km/Time fields
  // actually call registerSetField. Switching to the Progress or Workouts
  // tab (or discarding/saving the in-progress session) while the pad is
  // open used to leave it floating over whatever's now on screen: nothing
  // ever closed it, and its registry entry stops being refreshed the moment
  // the row that owns it stops rendering, so the pad also shows a frozen
  // value while any typing still silently mutates the (now invisible) set
  // in the background — the exact "always fresh, never stale" guarantee
  // documented in utils/setInputUtils.js broken by simply switching tabs.
  // Confirmed 2026-08-25.
  useEffect(() => {
    if (activeView !== 'log' || !isLoggingWorkout) closeSetField();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, isLoggingWorkout]);

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
  const [activeTemplateName, setActiveTemplateName] = useState(savedWorkoutDraft?.activeTemplateName ?? '');

  // Generic workout library, filtered by difficulty level (Beginner/Intermediate/Advanced)
  // and category (Gym/Home — Home is bodyweight/no-equipment-only programs).
  const [genericLevel, setGenericLevel] = useState(loadLastLevel() || 'beginner');
  const [genericCategory, setGenericCategory] = useState(loadLastCategory() || 'gym');
  const [levelWorkouts, setLevelWorkouts] = useState([]);
  // Difficulty level of the workout currently being logged, set only when the
  // session was started from the generic Workout Library (null for empty/
  // saved-template/coach-plan starts). Beginner-only exercises get an inline
  // form video next to their name in the logger — intermediate/advanced and
  // every other entry point stay exactly as they were (Form Guide button only).
  const [loggingLevel, setLoggingLevel] = useState(savedWorkoutDraft?.loggingLevel ?? null);
  const [loadingLevelWorkouts, setLoadingLevelWorkouts] = useState(false);
  // Library list is collapsed to the first few programs with a "Show all N"
  // expander (resets when switching level tabs).
  const [showAllLevelWorkouts, setShowAllLevelWorkouts] = useState(false);
  // Library card tapped -> { workout, level } shown in LibraryProgramPreview
  // (exercise list + Start), instead of starting the workout straight away.
  const [previewProgram, setPreviewProgram] = useState(null);
  const closeProgramPreview = useCallback(() => setPreviewProgram(null), []);
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

  // Load the difficulty-leveled generic workout library whenever the selected
  // level or category (Gym/Home) changes.
  useEffect(() => {
    let cancelled = false;
    const loadLevelWorkouts = async () => {
      setLoadingLevelWorkouts(true);
      try {
        const workouts = await databaseService.getGenericWorkoutsByLevel(genericLevel, genericCategory);
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
  }, [genericLevel, genericCategory]);

  // Persist the Workout Library level so the next mount restores it — see
  // lastLevelKey above. (activeView itself is NOT mirrored on every change:
  // it's 'log' for the whole duration of an active session, and blindly
  // persisting that would make a discard land back on the Log Sets picker
  // instead of the Workout Library. lastTabKey is written explicitly to
  // 'templates' only at the moments that should return there — see
  // handleDiscardWorkout above and the matching write in
  // WorkoutProgressDashboard's own discard button.)
  useEffect(() => {
    try { localStorage.setItem(lastLevelKey, genericLevel); } catch { /* ignore quota/serialization errors */ }
  }, [genericLevel, lastLevelKey]);

  // Same for the Gym/Home category — see lastCategoryKey above.
  useEffect(() => {
    try { localStorage.setItem(lastCategoryKey, genericCategory); } catch { /* ignore quota/serialization errors */ }
  }, [genericCategory, lastCategoryKey]);

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

  useEffect(() => {
    fetchPlans();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when the client changes; fetchPlans reads selectedClient from that same render
  }, [selectedClient]);

  useEffect(() => {
    if (!setTypeMenu) return;
    const close = () => setSetTypeMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [setTypeMenu]);
  const [chartMetric, setChartMetric] = useState('weight'); // 'weight' or 'volume'
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(4);
  // The strength-progression chart is now wider than its card once there are
  // more than ~7 sessions (fixed per-point spacing — see the chart's width
  // calc below) and scrolls horizontally instead of squeezing every point
  // together. This keeps whichever point the slider/date-ticks select
  // scrolled into view instead of leaving it off-screen.
  const chartScrollRef = useRef(null);
  const [timeframe, setTimeframe] = useState('monthly'); // 'weekly' or 'monthly'
  const [toastMessage, setToastMessage] = useState('');

  // Hevy Workout Tracker States — timer state machine matches the coach Live
  // Log exactly: idle until the first set is marked done, then running/paused
  // via explicit control. Duration and calories are always recomputed fresh
  // from these timestamps (never an incrementing counter), same as the coach.
  const [workoutTimerStatus, setWorkoutTimerStatus] = useState(savedWorkoutDraft?.workoutTimerStatus ?? 'idle'); // 'idle' | 'running' | 'paused'
  const [workoutTimerStartedAt, setWorkoutTimerStartedAt] = useState(savedWorkoutDraft?.workoutTimerStartedAt ?? null);
  const [workoutPauseIntervals, setWorkoutPauseIntervals] = useState(savedWorkoutDraft?.workoutPauseIntervals ?? []); // [{ pausedAt, resumedAt }]
  // Derived, not stored — every read site below (Finish summary, live badge,
  // billing, stopwatch display) keeps using this name/shape unchanged.
  const workoutActiveSeconds = computeElapsedSeconds(workoutTimerStartedAt, workoutPauseIntervals);
  const [showExerciseDbModal, setShowExerciseDbModal] = useState(false);
  const [showFinishSummary, setShowFinishSummary] = useState(false);
  // A rest that was still counting down when the page reloaded (or the
  // browser evicted the backgrounded tab) picks up where it left off —
  // restEndAt is a wall-clock timestamp, so the remaining time is simply
  // recomputed. Only alongside a restored session, and only if the rest
  // hasn't already run out.
  const restKey = `workoutRestEndAt_${localStorage.getItem('userId') || loggedInUser}`;
  const loadRestoredRestEndAt = () => {
    if (!savedWorkoutDraft) return null;
    try {
      const endAt = Number(localStorage.getItem(restKey));
      return endAt && computeRestSecondsRemaining(endAt) > 0 ? endAt : null;
    } catch {
      return null;
    }
  };
  const [restoredRestEndAt] = useState(loadRestoredRestEndAt);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(() => restoredRestEndAt ? computeRestSecondsRemaining(restoredRestEndAt) : 0);
  const [restTimerActive, setRestTimerActive] = useState(!!restoredRestEndAt);
  // Wall-clock timestamp the current rest ends at — the actual source of
  // truth restSecondsRemaining is recomputed from (see computeRestSecondsRemaining
  // in liveWorkoutTimer.js for why this needs to be a timestamp, not a
  // decremented counter).
  const [restEndAt, setRestEndAt] = useState(restoredRestEndAt);
  // Guards the "rest hit 0 naturally" alarm so it only ever fires once
  // per rest (a visibilitychange tick and the next setInterval tick can both
  // observe remaining<=0 for the same rest otherwise).
  const restFinishHandledRef = useRef(false);
  // True for a short window right after the countdown hits 0 — swaps the
  // card to "Rest over" instead of vanishing instantly.
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
  // Kept in localStorage alongside the restored session, so a stopwatch
  // running when the phone reloaded the page carries on — see
  // setTimerRestore.js.
  const setTimersKey = `workoutSetTimers_${localStorage.getItem('userId') || loggedInUser}`;
  const loadRestoredSetTimers = () => {
    // A draft from an earlier day restarts the session clock (see the
    // staleness effect below), so a stopwatch "running" since then is dropped.
    if (!savedWorkoutDraft || (savedWorkoutDraft.logDate && savedWorkoutDraft.logDate !== getLocalDateString())) return {};
    return restoreSavedSetTimers(readSavedSetTimers(setTimersKey), savedWorkoutDraft.workoutTimerStartedAt, savedWorkoutDraft.logExercises);
  };
  const [setTimers, setSetTimers] = useState(loadRestoredSetTimers);
  // Whether this session's "workout started" notification has gone to the
  // coach (see startSessionClockIfIdle). A restored session that already
  // has a ticked set or a started stopwatch has had it.
  const workStartNotifiedRef = useRef(
    !!savedWorkoutDraft?.logExercises?.some(ex => ex.sets?.some(s => s.isCompleted)) || Object.keys(setTimers).length > 0
  );
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

  // A draft resumed on a LATER calendar day than it was started (app closed
  // mid-workout and reopened a day+ later, or a device that sat offline)
  // used to stay silently pinned to the original day forever: logDate and
  // workoutTimerStartedAt both came straight from the stale draft with no
  // freshness check, so finishing it saved the session under the OLD date
  // (invisible in "today's log") with an elapsed duration spanning the whole
  // real-world gap since the original start (e.g. a week later reads as a
  // ~161-hour "workout"). Confirmed 2026-08-25: a client's Aug 18 draft,
  // resumed and finished Aug 25, logged under log_date 2026-08-18 with
  // duration_seconds ~582316 (6.7 days) instead of showing up today.
  // Fix: on mount, if the restored draft's date isn't today, bump logDate to
  // today and restart the timer clock from now — already-completed sets are
  // kept (still counted toward the session), only the date/duration window
  // moves to reflect that the session is actually finishing today.
  useEffect(() => {
    if (!savedWorkoutDraft || !savedWorkoutDraft.logDate) return;
    if (savedWorkoutDraft.logDate === getLocalDateString()) return;
    setLogDate(getLocalDateString());
    if (savedWorkoutDraft.workoutTimerStatus && savedWorkoutDraft.workoutTimerStatus !== 'idle') {
      setWorkoutTimerStartedAt(Date.now());
      setWorkoutPauseIntervals([]);
    }
    triggerToast("↩️ Resumed an unfinished session from earlier — logged as today, timer restarted.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // False until the client's workout history (below) has loaded. A session
  // started before then — always the case for the Home banner's auto-start,
  // which runs on mount — can't see PREV yet, so its sets are flagged
  // prevPending and filled in by fillPendingPrev once the history arrives.
  // Without this every kg box of such a session read 0 and had to be typed.
  const prevHistoryReadyRef = useRef(false);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('userName') || 'Warrior';
    const loggedInKey = loggedInUser.toLowerCase().replace(/\s+/g, '');

    const fillPendingPrev = (history) => {
      prevHistoryReadyRef.current = true;
      setLogExercises(prev => fillPendingPrevSets(prev, (exName, setIdx) =>
        findPreviousLoggedSetIn(history, loggedInUser, exName, setIdx)));
    };

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
      try { allSessions = JSON.parse(stored); } catch { allSessions = []; }
    }
    // 2. Merge client-specific coach-logged sessions for logged-in user
    const clientSpecificRaw = localStorage.getItem(`client_${loggedInKey}_workoutSessions`);
    if (clientSpecificRaw) {
      try {
        const clientSpecific = JSON.parse(clientSpecificRaw);
        allSessions = mergeAndDedupeSessions(allSessions, clientSpecific);
      } catch { /* unreadable client session cache — nothing extra to merge */ }
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
        } catch { /* skip an unreadable cached session list; keep merging the rest */ }
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
      // Only ever overwrite the seeded/cached values once the connection read
      // is actually confirmed (conn.resolved) — an unresolved read is "we
      // don't know yet", not proof the coach unassigned everything (see
      // getOwnCoachConnection's own comment on this). Clearing the cache on
      // an unresolved read previously reset this screen to "no package" —
      // and immediately went stale relative to the home card, which already
      // guards the same way — right on the moment this read was most likely
      // to fail (right after login/reopen, competing with other requests).
      if (!conn.resolved) return;
      if (conn.connected && Number.isFinite(conn.totalSessions) && conn.totalSessions > 0) {
        localStorage.setItem('userSessionsLimit', String(conn.totalSessions));
      } else {
        localStorage.removeItem('userSessionsLimit');
      }
      if (conn.connected && conn.programStartedOn) {
        localStorage.setItem('userProgramStartedOn', conn.programStartedOn);
      } else {
        localStorage.removeItem('userProgramStartedOn');
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
      const dbDates = new Set(rows.map(l => l.log_date));

      if (rows.length > 0) {
        // Group flat log rows into one session per date → { exercises:[{name,sets}] }
        const byDate = {};
        rows.forEach(l => {
          const d = l.log_date;
          if (!byDate[d]) byDate[d] = { id: `db-${d}`, clientName: loggedInUser, date: d, planName: l.plan_name || 'Logged Session', durationSeconds: null, caloriesBurned: null, avgHeartRate: null, maxHeartRate: null, exMap: {} };
          // Session duration/calories/heart-rate are duplicated onto every
          // row of the session (workout_logs has no session-level row) —
          // take the first non-null value seen for this date so the history
          // card can show them.
          if (l.duration_seconds != null && byDate[d].durationSeconds == null) byDate[d].durationSeconds = l.duration_seconds;
          if (l.calories_burned != null && byDate[d].caloriesBurned == null) byDate[d].caloriesBurned = l.calories_burned;
          if (l.avg_heart_rate_bpm != null && byDate[d].avgHeartRate == null) byDate[d].avgHeartRate = l.avg_heart_rate_bpm;
          if (l.max_heart_rate_bpm != null && byDate[d].maxHeartRate == null) byDate[d].maxHeartRate = l.max_heart_rate_bpm;
          const ex = l.exercise_name;
          if (!byDate[d].exMap[ex]) byDate[d].exMap[ex] = [];
          // distance_km present = real cardio; cardio_duration_seconds present
          // without distance_km = a timed hold (plank etc.) reusing that column
          // (see databaseService.saveWorkoutSession) — else a normal reps/weight set.
          byDate[d].exMap[ex].push(
            l.distance_km != null
              ? { distanceKm: l.distance_km, time: formatSecondsToTimeString(l.cardio_duration_seconds), setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
              : l.cardio_duration_seconds != null
              // Foot Fires keeps a real weight_kg alongside the duration (see
              // databaseService.saveWorkoutSession) — everything else timed
              // (Plank etc.) has it forced to 0, which is harmless to carry
              // along here since isTimedExercise's own UI ignores weight.
              ? { time: formatSecondsToTimeString(l.cardio_duration_seconds), weight: l.weight_kg, setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
              : { reps: l.reps, weight: l.weight_kg, setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
          );
        });
        const dbSessions = Object.values(byDate).map(s => ({
          id: s.id, clientName: s.clientName, date: s.date, planName: s.planName,
          durationSeconds: s.durationSeconds, caloriesBurned: s.caloriesBurned,
          avgHeartRate: s.avgHeartRate, maxHeartRate: s.maxHeartRate,
          exercises: Object.entries(s.exMap).map(([name, sets]) => ({ name, sets }))
        }));
        // DB is authoritative per date; keep any local-only (unsynced) dates too.
        const localOnly = allSessions.filter(s => !dbDates.has(s.date));
        const merged = [...localOnly, ...dbSessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        setSessions(merged);
        setSelectedSessionIndex(merged.length - 1);
        fillPendingPrev(merged);
      } else {
        fillPendingPrev(allSessions);
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
      //
      // This resync was also the main source of duplicate workouts in
      // workout_logs (see utils/workoutLogDedupe.js): the history read was
      // capped at 1000 rows, so every older date looked "absent" and was
      // uploaded again on every app open. Three guards now:
      // - rows.length > 0: only trust "absent" when the read demonstrably
      //   worked. An empty read is just as often RLS/token timing as a
      //   genuinely empty history, and re-uploading everything on a bad
      //   read is how whole histories got copied in one go.
      // - no 'db-' ids: those sessions were REBUILT from workout_logs
      //   (dbSessions above) and only reached localStorage because
      //   saveSessionsToLocal persists the merged list. They are already in
      //   the DB by definition — and a rebuild from duplicated rows carries
      //   every set twice, so re-uploading one doubled the workout.
      // - saveWorkoutSession is idempotent per session id, so any repeat that
      //   still slips through is rejected by the DB instead of stored.
      if (ownKey && rows.length > 0) {
        allSessions
          .filter(s =>
            !String(s.id || '').startsWith('db-') &&
            s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === loggedInKey &&
            !dbDates.has(s.date) &&
            (s.exercises || []).some(ex => (ex.sets || []).length > 0)
          )
          .forEach(s => {
            databaseService.saveWorkoutSession({ ...s, clientId: ownKey }).catch(() => {});
          });
      }
    }).catch(() => fillPendingPrev(allSessions));

    fetchPlans();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial load
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
  // elapsed time / calories stay current, and at once when the app comes
  // back on screen (see useLiveTick). Values are always recomputed fresh
  // from timestamps above (never an incrementing counter), matching the
  // coach's live timer bar exactly. No more force-starting the clock just
  // from being on the Log Sets tab — it now only starts on the first
  // completed set (see handleToggleSetCompleted), same as the coach.
  useLiveTick(workoutTimerStatus === 'running', 1000);

  // Set timers for timed exercises — re-render every 100ms for smooth UI
  useLiveTick(Object.values(setTimers).some(t => t.isRunning), 100);

  const resetWorkoutTimer = () => {
    setWorkoutTimerStatus('idle');
    setWorkoutTimerStartedAt(null);
    setWorkoutPauseIntervals([]);
  };

  // A new workout's clock starts the moment the client starts it — a coach
  // plan, a template or the Home banner's pick, or an empty session — not at
  // the first ticked set. Waiting for the first tick left out everything
  // before it (warm-up, an exercise done before ticking anything), and a
  // session ticked at the end saved almost no duration: 26 of 147 September
  // sessions saved under 30 s per set (one client session: 22 sets, 77 s).
  // A clock that isn't running for any other reason still starts on the
  // first tick (startSessionClockIfIdle).
  const startWorkoutClock = () => {
    workStartNotifiedRef.current = false;
    setWorkoutTimerStartedAt(Date.now());
    setWorkoutPauseIntervals([]);
    setWorkoutTimerStatus('running');
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
    deleteDraftAfterPendingSave();
    setLogExercises([
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
    ]);
    setSetTimers({});
    // Land back on the Workouts tab (where the Workout Library lives),
    // not Progress — discarding is almost always "let me pick a different
    // program", and bouncing to Progress made the client re-navigate every
    // time. The Beginner/Intermediate/Advanced sub-tab (genericLevel) isn't
    // touched here, so whichever level they were browsing stays selected.
    // Also written straight to localStorage (not just React state) so a
    // remount picks it up too — the Home screen's own discard button lives
    // in a separate component (WorkoutProgressDashboard) that can't reach
    // this state directly and writes the same key itself.
    setActiveView('templates');
    try { localStorage.setItem(lastTabKey, 'templates'); } catch { /* ignore quota/serialization errors */ }
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
      databaseService.getWorkoutDraft(id, 'self').then(dbDraft => {
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
          // Same staleness check as the local-draft mount effect above — this
          // DB draft may be from a previous calendar day (different device,
          // or the local mirror was cleared). Never resume it pinned to that
          // old date/timer window, or the finished session lands invisibly
          // on the old day with a multi-day "duration".
          const draftIsStale = dbDraft.logDate && dbDraft.logDate !== getLocalDateString();
          // The DB copy is usually this same session, saved from this phone
          // just before the page went away (its server timestamp is later
          // than the local copy's) — keep a restored stopwatch wherever the
          // same exercise is still at that position (see setTimerRestore.js)
          // instead of always dropping it. Not for an earlier day's draft,
          // whose clock restarts below, or a different session.
          const restoredExercises = dbDraft.exercises && dbDraft.exercises.length > 0 ? dbDraft.exercises : savedWorkoutDraft?.logExercises;
          const sameSession = Number(dbDraft.timerStartedAt) === Number(savedWorkoutDraft?.workoutTimerStartedAt);
          setSetTimers(prev => (draftIsStale || !sameSession ? {} : keepSetTimersForSameExercises(prev, savedWorkoutDraft?.logExercises, restoredExercises)));
          if ((dbDraft.exercises || []).some(ex => ex.sets?.some(s => s.isCompleted))) workStartNotifiedRef.current = true;
          setLogDate(draftIsStale ? getLocalDateString() : (dbDraft.logDate || getLocalDateString()));
          setTemplateName(dbDraft.planName || '');
          setWorkoutSource(dbDraft.source === 'coach' ? 'coach' : 'self');
          // The DB draft doesn't carry loggingLevel (not persisted server-side) —
          // reset it rather than leave a stale value from a previous session.
          setLoggingLevel(null);
          setWorkoutTimerStatus(dbDraft.timerStatus || 'idle');
          if (draftIsStale && dbDraft.timerStatus && dbDraft.timerStatus !== 'idle') {
            setWorkoutTimerStartedAt(Date.now());
            setWorkoutPauseIntervals([]);
            triggerToast("↩️ Resumed an unfinished session from earlier — logged as today, timer restarted.");
          } else {
            setWorkoutTimerStartedAt(dbDraft.timerStartedAt ?? null);
            setWorkoutPauseIntervals(dbDraft.pauseIntervals || []);
          }
          setIsLoggingWorkout(true);
          setActiveView('log');
        }
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftSaveTimerRef = useRef(null);
  // The draft waiting out the debounce below, if any.
  const pendingDraftRef = useRef(null);
  // The last workout_drafts request sent. Each save (and the final delete)
  // is chained after it, so requests always land in the order they were
  // made — an older upsert can't overwrite a newer one, or recreate the row
  // after Finish/Discard deleted it (the "Resume Workout" banner that won't
  // go away).
  const draftSaveInFlightRef = useRef(null);
  // Set by a completed set: the next draft save skips the debounce, so every
  // ticked set reaches the DB copy right away (workout_logs itself is still
  // only written on Finish).
  const saveDraftNowRef = useRef(false);

  const sendPendingDraft = useCallback(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const draft = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (!draft) return;
    draftSaveInFlightRef.current = Promise.resolve(draftSaveInFlightRef.current)
      .then(() => databaseService.saveWorkoutDraft(draft))
      .catch(() => {});
  }, []);

  // Drops any draft save still waiting, then deletes the DB draft once the
  // save already sent (if any) has finished — see draftSaveInFlightRef.
  const deleteDraftAfterPendingSave = () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    pendingDraftRef.current = null;
    if (!ownUserId) return;
    const userId = ownUserId;
    draftSaveInFlightRef.current = Promise.resolve(draftSaveInFlightRef.current)
      .then(() => databaseService.deleteWorkoutDraft(userId, 'self'))
      .catch(() => {});
  };

  // Locking the phone between sets (or switching apps) freezes timers, so a
  // debounced save would sit unsent until the app is opened again — send it
  // the moment the page is hidden instead.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') sendPendingDraft(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', sendPendingDraft);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', sendPendingDraft);
    };
  }, [sendPendingDraft]);

  // Mirror the active logging session into localStorage on every change so it
  // survives an unmount (tab switch / reload / logout), and clear it the moment
  // the session ends (finish or discard sets isLoggingWorkout back to false).
  // Also push the same session to workout_drafts in the DB — that copy is
  // what survives being away from the device entirely (backgrounded for
  // 15-20 min, different device) and what the Home tab's "Resume Workout"
  // banner reads. Debounced so typing a weight/rep doesn't fire a request per
  // keystroke; a completed-set tick is sent immediately (saveDraftNowRef).
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
          loggingLevel,
          saveAsTemplate,
          workoutTimerStatus,
          workoutTimerStartedAt,
          workoutPauseIntervals,
          savedAt: Date.now()
        }));
      } catch {
        // Quota/serialization failure shouldn't break the live session.
      }

      if (ownUserId) {
        pendingDraftRef.current = {
          userId: ownUserId,
          coachId: null,
          // Always 'self' here, never workoutSource: this component only
          // ever renders for the logged-in client logging their own
          // session (coach live-logging is a separate path in
          // TrainerDashboard.jsx that saves source: 'coach' explicitly).
          // workoutSource instead tracks who *authored the plan* being
          // followed ('coach' for a coach-assigned template) and is used
          // for the saved session's source field, not for who's live-
          // logging. Reusing it here made picking a coach-assigned plan
          // mislabel the draft as coach-logged, so a client logging their
          // own workout from a coach's plan saw "Your coach is logging a
          // session for you" on their dashboard. BUG FIX (2026-08-24).
          source: 'self',
          planName: templateName,
          logDate,
          exercises: logExercises,
          timerStatus: workoutTimerStatus,
          timerStartedAt: workoutTimerStartedAt,
          pauseIntervals: workoutPauseIntervals
        };
        if (saveDraftNowRef.current) {
          saveDraftNowRef.current = false;
          sendPendingDraft();
        } else {
          if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = setTimeout(sendPendingDraft, 1200);
        }
      }
    } else {
      localStorage.removeItem(workoutDraftKey);
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      pendingDraftRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggingWorkout, logExercises, logClient, logDate, templateName, activeTemplateName, loggingLevel, saveAsTemplate, workoutTimerStatus, workoutTimerStartedAt, workoutPauseIntervals, ownUserId, workoutSource]);

  const handlePauseWorkoutTimer = () => {
    if (workoutTimerStatus !== 'running') return;
    setWorkoutPauseIntervals(prev => [...prev, { pausedAt: Date.now(), resumedAt: null }]);
    setWorkoutTimerStatus('paused');
    // Pausing the whole session should also freeze any cardio OR timed
    // (Plank, Wall Sit, Air Rowing, Battle Rope, Side Hops, Foot Fires, ...)
    // set actively running underneath it — otherwise that stopwatch (and its
    // live calories) kept ticking on its own even though the session clock
    // itself had stopped. The cardio half of this was fixed already; the
    // isTimedExercise half was missed — same symptom, reproducible any time
    // a hold/timed set's Play is running when Pause is hit on the top
    // banner: that row's mm:ss and kcal kept climbing after "paused".
    // Confirmed 2026-08-25.
    logExercises.forEach((ex, exIdx) => {
      const isCardio = isCardioExercise(ex.name);
      const isTimed = isTimedExercise(ex.name);
      if (!isCardio && !isTimed) return;
      ex.sets.forEach((set, sIdx) => {
        const timer = setTimers[getSetTimerKey(exIdx, sIdx)];
        if (!timer?.isRunning) return;
        if (isCardio) handleCardioStopwatchPause(exIdx, sIdx);
        else handleSetStopwatchPause(exIdx, sIdx);
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
    if (!restTimerActive || !restEndAt) return undefined;

    const tick = () => {
      const remaining = computeRestSecondsRemaining(restEndAt);
      setRestSecondsRemaining(remaining);
      if (remaining <= 0 && !restFinishHandledRef.current) {
        restFinishHandledRef.current = true;
        // Swap to "Rest over" instead of a toast, then let the card linger
        // just long enough to be seen before it clears itself.
        setRestJustFinished(true);
        playAlarmBeeps(1);
        setTimeout(() => {
          setRestTimerActive(false);
          setRestJustFinished(false);
        }, 2200);
      }
    };

    tick(); // sync immediately (covers restEndAt changing via +15/-15)
    const interval = setInterval(tick, 1000);
    // setInterval is throttled or fully suspended while the screen is
    // locked/tab is backgrounded, so a countdown driven only by tick counts
    // visibly "lags" once the screen comes back on — it kept counting the
    // ticks that actually ran, not the real time that passed. Recomputing
    // from the wall-clock restEndAt the instant the page becomes visible
    // again corrects the display immediately instead of waiting for
    // however many missed 1s ticks to catch up (they never do — see
    // computeRestSecondsRemaining's comment).
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [restTimerActive, restEndAt]);

  // Remember the running rest's end time so a reload mid-rest restores it
  // (see loadRestoredRestEndAt). Local only — the rest belongs to the phone
  // in the client's hand, not to the cross-device draft.
  useEffect(() => {
    try {
      if (isLoggingWorkout && restTimerActive && restEndAt) localStorage.setItem(restKey, String(restEndAt));
      else localStorage.removeItem(restKey);
    } catch { /* ignore quota/serialization errors */ }
  }, [isLoggingWorkout, restTimerActive, restEndAt, restKey]);

  // Same for the per-set stopwatches (see loadRestoredSetTimers), with the
  // exercise names they're keyed against so a restore can check they still
  // line up, and the session they belong to (its clock start) so they can
  // never reappear in a later session.
  useEffect(() => {
    try {
      if (isLoggingWorkout && Object.keys(setTimers).length > 0) {
        localStorage.setItem(setTimersKey, JSON.stringify({
          sessionStartedAt: workoutTimerStartedAt,
          timers: setTimers,
          names: logExercises.map(ex => ex.name)
        }));
      } else {
        localStorage.removeItem(setTimersKey);
      }
    } catch { /* ignore quota/serialization errors */ }
  }, [isLoggingWorkout, setTimers, logExercises, workoutTimerStartedAt, setTimersKey]);

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

  // Raw lookup shared by getPreviousSessionSet (display) and
  // handleStartFromTemplate (pre-fill) — walks the client's history newest
  // first and returns the actual logged set for this exercise/set index, or
  // null when nothing's ever been logged for it.
  const findPreviousLoggedSet = (exName, setIdx) =>
    findPreviousLoggedSetIn(sessions, selectedClient, exName, setIdx);

  // Marks sets created before the history has loaded, so fillPendingPrev
  // can give them this same pre-fill once it arrives (see
  // prevHistoryReadyRef). `kind` is which pre-fill: 'plan' (withPrevWeight)
  // or 'template' (reps + weight, handleStartFromTemplate).
  const markPrevPending = (set, kind) => (prevHistoryReadyRef.current ? set : { ...set, prevPending: kind });

  // A plan's kg/BW box AND reps box start from what the PREV column shows,
  // not from whatever's stored in the plan (a leftover editor default, a
  // weight duplicated in from another week, a reps target written weeks
  // ago, ...) — same rule as the coach side's applyPrevWeights in
  // TrainerDashboard. Reported 2026-09-23 as "random numbers in kg and
  // bodyweight"; extended to reps 2026-09-28 so a completed set is a single
  // tap instead of needing the reps retyped every time. Sets the client has
  // never logged, and cardio / plain timed sets (no weight/reps at all),
  // are returned unchanged. Bodyweight exercises also get a per-set
  // bodyweightMode so a set PREV logged as BW shows "BW" even when a
  // sibling set carries a plate (see getSetLogBwMode).
  const withPrevValues = (exName, setIdx, set) =>
    markPrevPending(applyPrevValues(exName, set, findPreviousLoggedSet(exName, setIdx)), 'plan');

  const getPreviousSessionSet = (exName, setIdx) => {
    const set = findPreviousLoggedSet(exName, setIdx);
    if (!set) return '—';

    if (isCardioExercise(exName)) {
      if (!set.distanceKm) return '—';
      return `${set.distanceKm}km${set.time ? ` · ${set.time}` : ''}`;
    }
    if (isTimedExercise(exName)) {
      return set.time || '—';
    }
    // Bodyweight exercises log weight: 0 when no plate/vest was added —
    // show "BW" like the live logger's own column does, instead of the
    // raw "0kg" which reads as a logging error.
    const weightLabel = isBodyweightExercise(exName) && !(Number(set.weight) > 0)
      ? 'BW'
      : `${set.weight}${getExerciseUnit(exName)}`;
    return `${weightLabel} x ${set.reps}`;
  };

  // "Last: 40kg×8 → try 42.5kg×8" shown under each exercise card — see
  // buildProgressiveOverloadHint's own comment for the progression rule.
  const getExerciseProgressionHint = (exName) =>
    buildProgressiveOverloadHint(exName, findPreviousExerciseSetsIn(sessions, selectedClient, exName));

  // Shared by every action that represents "the client has started doing
  // real work" — ticking a set complete, but also now pressing Play on a
  // cardio/timed exercise's stopwatch (see handleCardioStopwatchStart /
  // handleSetStopwatchStart below). Notifies the coach once and starts the
  // session clock, but only on the idle→running transition — calling this
  // again later (e.g. Play, then tick) is a harmless no-op since
  // workoutTimerStatus is already 'running' by then.
  const startSessionClockIfIdle = () => {
    const now = Date.now();
    const clientId = ownUserId || localStorage.getItem('userId');
    // The coach hears about it on the first real work, not the moment a
    // plan is opened (the clock now starts then — see startWorkoutClock), so
    // opening a plan just to look at it and discarding it doesn't ping them.
    if (!workStartNotifiedRef.current) {
      workStartNotifiedRef.current = true;
      if (clientId && workoutSource !== 'coach') {
        // Same workoutName field the "completed" notification already sends
        // (see handleConfirmSaveWorkout below) — the server just wasn't using
        // it for either event until now (see api/push.js).
        notifyEvent('workout_started', { clientUserId: clientId, workoutName: templateName?.trim() || null });
      }
    }
    // Ticking a set or pressing Play while the session is PAUSED (not idle)
    // is the same "real work just happened" signal, and needs the same
    // response: the top banner was left reading "Paused" while that set's
    // own stopwatch ran and its live kcal fed straight into the displayed
    // total (liveRunningCardioKcal doesn't check workoutTimerStatus) — the
    // exact inverse of the gap handlePauseWorkoutTimer had (that one left a
    // running stopwatch ticking after Pause; this one lets a fresh one start
    // without ever un-pausing the banner). Confirmed 2026-08-25.
    if (workoutTimerStatus === 'paused') {
      handleResumeWorkoutTimer();
      return;
    }
    setWorkoutTimerStatus(prevStatus => {
      if (prevStatus === 'idle') {
        setWorkoutTimerStartedAt(now);
        return 'running';
      }
      return prevStatus;
    });
  };

  // Reordering permutes logExercises without touching setTimers, which is
  // keyed purely by array position — remap alongside every reorder so a
  // running cardio/timed stopwatch stays attached to the set it actually
  // belongs to instead of silently reattaching to whatever now sits at its
  // old index. See remapSetTimersForReorder's comment in liveWorkoutTimer.js.
  const handleLogExercisesReordered = useCallback((newOrder) => {
    setSetTimers(prev => remapSetTimersForReorder(logExercises, newOrder, prev));
    setLogExercises(newOrder);
  }, [logExercises]);

  const {
    isReordering: isLogReordering,
    dragIndex: logDragIndex,
    getRowStyle: getLogRowStyle,
    startReorderDrag: startLogExerciseDrag,
    measureRowHeight: measureLogRowHeight,
    moveByKeyboard: moveLogExerciseByKeyboard,
    getItemKey: getLogItemKey,
  } = useReorderableList(logExercises, handleLogExercisesReordered);

  const handleToggleSetCompleted = (exerciseIndex, setIndex) => {
    // Real click, right here — unlocks audio for the rest timer's alarm,
    // which fires later from a setInterval tick (see alarmSound.js).
    unlockAudio();
    const now = Date.now();
    // First completed set of an idle session = the client has started working
    // out — same signal startSessionClockIfIdle already checks for, so this
    // call also covers the "notify coach once" side effect.
    const ex = logExercises[exerciseIndex];
    const togglingSetOn = !ex?.sets[setIndex]?.isCompleted;
    if (togglingSetOn) {
      startSessionClockIfIdle();
      // A completed set is worth saving right now, not after the debounce.
      saveDraftNowRef.current = true;
      // The set's fields lock once it's done — a number pad left open on
      // one of them would keep editing a completed set out of sight.
      if (activeSetKey && activeSetKey.endsWith(`-${exerciseIndex}-${setIndex}`)) closeSetField();
    }
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx === setIndex) {
              const { prevPending: _prevPending, ...set } = s;
              const nextState = !set.isCompleted;
              // completedAt is what the live calorie calc's rest-interval math
              // uses — never cleared retroactively except when this exact set
              // is unchecked, so re-checking it later is timed fresh. Ghost
              // styling clears too — once completed the field is disabled and
              // its shown value is what got saved, not an unconfirmed guess.
              return {
                ...set,
                isCompleted: nextState,
                completedAt: nextState ? now : null,
                ...(nextState ? { weightFromPrev: false, repsFromPrev: false } : {})
              };
            }
            return s;
          })
        };
      }
      return ex;
    }));
  };

  // Rest timer is manual — completing a set no longer starts it on its own
  // (see handleToggleSetCompleted above). This is the one path that (re)arms
  // it, from the "⏱️ Start Rest" link on whichever exercise card the client
  // just worked. Same 60s default and state shape the old auto-start used.
  const handleStartRestTimer = () => {
    unlockAudio();
    restFinishHandledRef.current = false;
    setRestEndAt(Date.now() + 60000);
    setRestSecondsRemaining(60);
    setRestTimerActive(true);
    setRestJustFinished(false);
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

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Sessions count calculations
  const clientSessions = sessions
    .filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // "Best Lift" — every exercise's own personal-best weight (heaviest set
  // ever logged for that exercise, any session), not just a single overall
  // number. The card shows the true all-time top PR first (highlighted —
  // ties included, since a client can genuinely max out two exercises at
  // the same weight), then every other exercise's own PR underneath.
  const prsByExercise = {}; // exercise name -> { weight, date } of its own best set
  clientSessions.forEach(s => {
    (s.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(set => {
        const w = parseFloat(set.weight) || 0;
        if (w <= 0) return;
        if (!prsByExercise[ex.name] || w > prsByExercise[ex.name].weight) {
          prsByExercise[ex.name] = { weight: w, date: s.date };
        }
      });
    });
  });
  const prList = Object.entries(prsByExercise)
    .map(([name, v]) => ({ name, weight: v.weight, date: v.date }))
    .sort((a, b) => b.weight - a.weight);

  const bestWeight = prList[0]?.weight || 0;
  const topPRs = prList.filter(p => p.weight === bestWeight);
  const otherPRs = prList.filter(p => p.weight !== bestWeight);

  const bestLiftLabel = topPRs.length > 0
    ? `${topPRs.map(p => p.name).join(', ')} ${bestWeight}kg`
    : 'No sessions yet';
  // Only unambiguous when exactly one exercise holds the top record — with
  // a tie, one date would misleadingly look like it applies to all of them.
  const bestSessionDateLabel = topPRs.length === 1
    ? new Date(topPRs[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  // ─── Skill level: Beginner / Intermediate / Advanced / Elite ───
  // A LIFETIME journey, not a recent-activity snapshot — a client who's only
  // been training for two weeks cannot reach Advanced/Elite no matter how
  // perfect those two weeks were; those tiers have to be earned with real
  // calendar time, the same way an actual training journey works. Two parts:
  //
  //   1. A tenure gate — minimum weeks since their FIRST ever logged session
  //      — that caps which tier is reachable at all, regardless of score:
  //      Beginner (0-4wk) → Intermediate (4-12wk) → Advanced (12-26wk) →
  //      Elite (26wk+).
  //   2. A 0-100 score computed from their WHOLE history (not a 30-day/
  //      6-session window), which decides where within that tenure-allowed
  //      range they actually land — someone eligible for Advanced by tenure
  //      but who trains erratically still sits at Beginner/Intermediate.
  //      - Consistency (50%): distinct days logged, lifetime, against an
  //        expected ~3x/week cadence for however many weeks they've been
  //        active. A quiet stretch still pulls this down over time (more
  //        weeks active with the same session count = lower rate), it just
  //        can't swing the whole score in 30 days the way a rolling window
  //        did.
  //      - Progressive overload (50%): across their ENTIRE session history,
  //        what fraction of exercise-to-exercise comparisons (each exercise
  //        vs its own most recent prior occurrence) held steady or went
  //        heavier.
  //
  // Final tier = min(tenure-gate tier, score-based tier) — both have to
  // agree; neither alone is enough.
  const skillLevel = (() => {
    const tiers = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];
    if (clientSessions.length === 0) {
      return { score: 0, tier: tiers[0], tierIndex: 0, withinTierPct: 0 };
    }

    const firstDate = new Date(`${clientSessions[0].date}T00:00:00`);
    // Floored to 1 so it's never a divide-by-zero denominator below —
    // `realWeeksActive` (unfloored) is what the marker's own tenure
    // progress is measured against, since flooring THAT to 1 would make a
    // day-one client's marker jump straight to 25% of the way through
    // Beginner before they've trained at all.
    const weeksActive = Math.max(1, (Date.now() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const realWeeksActive = Math.max(0, (Date.now() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

    const distinctDays = new Set(clientSessions.map(s => s.date)).size;
    const consistencyPct = Math.min(1, distinctDays / (weeksActive * 3));

    let comparisons = 0;
    let maintainedOrUp = 0;
    clientSessions.forEach((session, idx) => {
      if (idx === 0) return; // nothing earlier to compare against
      (session.exercises || []).forEach(ex => {
        const maxWeight = Math.max(0, ...(ex.sets || []).map(s => parseFloat(s.weight) || 0));
        if (maxWeight <= 0) return; // bodyweight/cardio — no weight to compare
        // Most recent EARLIER session (anywhere in their history) that also
        // logged this exercise with a real weight.
        for (let back = idx - 1; back >= 0; back--) {
          const prevEx = (clientSessions[back].exercises || []).find(e => e.name.toLowerCase() === ex.name.toLowerCase());
          if (!prevEx) continue;
          const prevMax = Math.max(0, ...prevEx.sets.map(s => parseFloat(s.weight) || 0));
          if (prevMax <= 0) break;
          comparisons += 1;
          if (maxWeight >= prevMax) maintainedOrUp += 1;
          break;
        }
      });
    });
    const overloadPct = comparisons > 0 ? maintainedOrUp / comparisons : 0;

    const score = consistencyPct * 50 + overloadPct * 50; // 0–100
    const scoreTierIndex = Math.min(3, Math.floor(score / 25));
    const tenureTierIndex = weeksActive >= 26 ? 3 : weeksActive >= 12 ? 2 : weeksActive >= 4 ? 1 : 0;
    const tierIndex = Math.min(scoreTierIndex, tenureTierIndex);
    // Position within the active tier's own slice, for the marker — driven
    // by whichever of the two axes (score or tenure) is the actual
    // bottleneck holding them at this tier, not always the score one. A
    // tenure-capped client (score would already place them higher) used to
    // show flat at the START of their tier for their entire time in it —
    // weeks of real training with zero visible movement — because the old
    // formula only ever looked at score. Taking the TIGHTER of the two
    // percentages means whichever axis hasn't caught up yet is what's
    // reflected, so a tenure-capped client still sees the marker creep
    // forward as calendar weeks pass, and a score-capped client (tenure
    // already qualifies them higher) still sees it driven by score.
    const TIER_WEEK_BOUNDS = [[0, 4], [4, 12], [12, 26], [26, Infinity]];
    const [bandStart, bandEnd] = TIER_WEEK_BOUNDS[tierIndex];
    const tenureWithinPct = bandEnd === Infinity ? 1 : Math.min(1, Math.max(0, (realWeeksActive - bandStart) / (bandEnd - bandStart)));
    const scoreWithinPct = Math.min(1, Math.max(0, (score - tierIndex * 25) / 25));
    const withinTierPct = Math.min(scoreWithinPct, tenureWithinPct);
    return { score, tier: tiers[tierIndex], tierIndex, withinTierPct };
  })();

  const displayedSessions = timeframe === 'weekly'
    ? clientSessions.slice(-3)
    : clientSessions;

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

  // `selectedSessionIndex` is a position in `graphData` (the plotted, filtered
  // list — same thing the slider's own min/max is defined against), NOT a
  // raw index into `displayedSessions`. Sessions with no data for the
  // selected exercise are filtered out above, so raw session-history
  // position and plotted position diverge — e.g. "session 2 overall" and
  // "session 2 among the ones with Shoulders Press data" can be completely
  // different dates. Indexing graphData directly (rather than searching it
  // by raw `.index`) keeps the slider, the header label below, and the
  // highlighted dot all pointing at the same point.
  const activeSessionData = graphData[selectedSessionIndex] || graphData[graphData.length - 1] || null;

  // Sync selected index boundaries — against graphData (what the slider
  // actually scrubs through), not displayedSessions (see note above).
  useEffect(() => {
    if (graphData.length > 0 && selectedSessionIndex >= graphData.length) {
      setSelectedSessionIndex(graphData.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- graphData is a new array every render; depend on its length instead so this only re-runs when the count actually changes
  }, [graphData.length, selectedSessionIndex]);

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
  // Calendar-day based x-axis instead of fixed spacing per point — spacing
  // every point equally (regardless of the real gap between session dates)
  // made a workout on the 12th and another on the 28th sit right next to
  // each other, 16 real days apart but one uniform "step" on the chart. Each
  // x pixel now represents a real day, so the line/gradient between two
  // points stretches the actual distance between their dates. The axis also
  // runs out to the end of the last plotted month rather than stopping dead
  // at the final workout, so it reads as one continuous month strip instead
  // of a chart that just ends.
  const PIXELS_PER_DAY = 14;
  const parseLocalDate = (dateStr) => new Date(dateStr + 'T00:00:00');
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));

  // Anchored to the FIRST PLOTTED SESSION's actual date, not the 1st of its
  // month — the timeline slider below (and its date-tick labels) always
  // treats "session 1" as position zero, so starting the axis at the
  // calendar month's start instead left an empty lead-in before the first
  // dot, stranding it away from the left edge the slider's own first handle
  // sits at. Only the far end still extends past the last real session, out
  // to that month's last day, so the strip still reads as running through
  // to month-end.
  const axisStartDate = graphData.length > 0 ? parseLocalDate(graphData[0].date) : new Date();
  const axisEndDate = graphData.length > 0 ? endOfMonth(parseLocalDate(graphData[graphData.length - 1].date)) : endOfMonth(new Date());
  const totalAxisDays = Math.max(daysBetween(axisStartDate, axisEndDate), 1);

  // Vertical margin (room for value labels above points, date labels below)
  // and horizontal margin (just breathing room before the first/after the
  // last point) used to share one `padding` value — there's no Y-axis text
  // that actually needs 35px on the left/right, so that shared value read as
  // a big dead gap before the first point once scrolled all the way to the
  // start. Split them: paddingX stays tight, padding (vertical) unchanged.
  const padding = 35;
  const paddingX = 14;
  // Roughly a month's worth of days visible in the card at once before
  // .svg-container-box's horizontal scroll kicks in (see svg-scroll-wrap
  // /hint below).
  const VISIBLE_DAYS = 30;
  const chartWidth = totalAxisDays * PIXELS_PER_DAY;
  const width = Math.max(paddingX * 2 + VISIBLE_DAYS * PIXELS_PER_DAY, paddingX * 2 + chartWidth);
  const height = 200;
  const chartHeight = height - padding * 2;

  const getPointX = (dateStr) => paddingX + daysBetween(axisStartDate, parseLocalDate(dateStr)) * PIXELS_PER_DAY;

  let pathPoints = '';
  let areaPoints = '';
  const yValues = graphData.map(d => chartMetric === 'weight' ? d.weight : d.volume);
  const maxY = Math.max(...yValues, 5) * 1.15;
  const minY = Math.min(...yValues, 0) * 0.9;

  const getPointY = (val) => padding + chartHeight - ((val - minY) / Math.max(maxY - minY, 1)) * chartHeight;

  if (graphData.length > 0) {
    graphData.forEach((d, idx) => {
      const val = chartMetric === 'weight' ? d.weight : d.volume;
      const x = getPointX(d.date);
      const y = getPointY(val);

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

  // Keep the slider/date-tick-selected session scrolled into view when the
  // chart is wider than its card (see width calc above).
  useEffect(() => {
    const el = chartScrollRef.current;
    if (!el || !activeSessionData) return;
    const targetX = getPointX(activeSessionData.date);
    // SVG viewBox units → actual rendered pixels (the container may be
    // narrower than `width`, but the SVG itself renders at `width`px — see
    // the inline style on the <svg> — so this is a 1:1 unit match).
    const targetScroll = targetX - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeSessionData is a new object every render; listing it would re-scroll on every render
  }, [selectedSessionIndex, chartMetric, selectedExercise]);

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
        } else if (isTimedExercise(ex.name) && isBodyweightExercise(ex.name)) {
          // Foot Fires: keeps a weight alongside the time field (see the
          // Bodyweight/+Add Weight toggle in the render logic below).
          newSet = { time: lastSet?.time || '', weight: lastSet?.weight || '0', isCompleted: false, isWarmup };
        } else if (isTimedExercise(ex.name)) {
          newSet = { time: lastSet?.time || '', isCompleted: false, isWarmup };
        } else if (isWarmupExercise(ex.name)) {
          newSet = { reps: lastSet?.reps || 10, weight: '0', isCompleted: false, isWarmup };
        } else if (isBodyweightExercise(ex.name) && getLogExBwMode(ex)) {
          // Bodyweight mode means exactly that — a new set shouldn't invent a
          // weight the client never chose. suggestNextWeight below is a
          // straight/pyramid-style plate-increment suggestion meant for
          // loaded exercises; applying it here silently turned "BW" (set 1)
          // into "2.5 kg" (set 2), "5 kg" (set 3), etc. for an exercise
          // logged with no weight at all. Reported 2026-08-14 for Steppers.
          newSet = { reps: lastSet?.reps || 10, weight: '0', isCompleted: false, isWarmup };
        } else {
          // Reps stay fixed at the last set's target; weight carries over the
          // last set's weight as-is (previously auto-incremented by one plate
          // via suggestNextWeight — removed per coach feedback: the guessed
          // next weight was routinely wrong and had to be backspaced out
          // every time anyway, so just repeat the last set's actual weight).
          newSet = { reps: lastSet?.reps || 10, weight: lastSet?.weight || '', isCompleted: false, isWarmup };
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
    // Remap first — see remapSetTimersForSetRemoval's comment in
    // liveWorkoutTimer.js. Without this a running stopwatch on any LATER
    // set in this exercise silently reattached to whatever set shifted
    // into its old index.
    setSetTimers(prev => remapSetTimersForSetRemoval(exerciseIndex, setIndex, prev));
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
              // Edited by hand (or by its own stopwatch) — the late PREV
              // pre-fill must not overwrite it (see fillPendingPrevSets),
              // and the field the client just typed into is no longer
              // "what PREV showed" — it's confirmed, so its ghost styling
              // clears (see SetValueField's isGhost prop).
              const { prevPending: _prevPending, ...set } = s;
              const clearedGhost = field === 'weight' ? { weightFromPrev: false }
                : field === 'reps' ? { repsFromPrev: false }
                : {};
              return { ...set, [field]: value, ...clearedGhost };
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

  // Per-set override — a set explicitly toggled on its own row (the BW cell /
  // the inline ⇄ icon) carries its own bodyweightMode independent of its
  // siblings, so switching set 2 to added weight doesn't drag set 1 along
  // with it. A set that's never been touched this way falls back to the
  // exercise-level mode above, same as before this per-set control existed.
  const getSetLogBwMode = (ex, set) =>
    set.bodyweightMode !== undefined ? set.bodyweightMode : getLogExBwMode(ex);

  const handleToggleSetLogBodyweightMode = (exIdx, sIdx) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, i) => {
          if (i !== sIdx) return s;
          const nextMode = !getSetLogBwMode(ex, s);
          const { prevPending: _prevPending, ...set } = s;
          return { ...set, bodyweightMode: nextMode, weight: nextMode ? '0' : '' };
        })
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
    // A countdown never runs past its target — a tab that was backgrounded
    // past 00:00 would otherwise log more time than the interval prescribed.
    return timer.targetSeconds > 0 ? Math.min(elapsed, timer.targetSeconds) : elapsed;
  };

  // A countdown (interval with a target time) that reaches 00:00 stops itself
  // and beeps, same as pressing Pause at that instant — the time saved is the
  // target, and Play afterwards starts a fresh countdown (see the
  // pausedDuration >= target guard in the two Start handlers below). Runs
  // after every render; the 100ms tick above keeps re-rendering while
  // anything is running, and pausing flips isRunning off so it fires once.
  useEffect(() => {
    Object.entries(setTimers).forEach(([key, timer]) => {
      if (!timer.isRunning || !timer.startedAt || !(timer.targetSeconds > 0)) return;
      const rawElapsed = Math.floor((Date.now() - timer.startedAt) / 1000) + (timer.pausedDuration || 0);
      if (rawElapsed < timer.targetSeconds) return;
      const [exIdx, sIdx] = key.split(',').map(Number);
      if (isCardioExercise(logExercises[exIdx]?.name)) handleCardioStopwatchPause(exIdx, sIdx);
      else handleSetStopwatchPause(exIdx, sIdx);
      playAlarmBeeps();
    });
  });

  const handleSetStopwatchStart = (exIdx, sIdx) => {
    unlockAudio();
    // Pressing Play on a timed exercise (Plank, Side Hops, ...) is real work
    // starting, same as ticking a set — the top banner's clock + live kcal
    // should already be climbing while the hold is in progress, not wait
    // until it's ticked complete.
    startSessionClockIfIdle();
    const key = getSetTimerKey(exIdx, sIdx);
    const set = logExercises[exIdx]?.sets[sIdx];
    // Resume from the set's own saved `time` ONLY when it's actually a real,
    // previously-run elapsed value (set.timeIsLive, written by
    // handleSetStopwatchPause/Complete whenever a live timer really produced
    // it) — e.g. completing a set then unchecking it and pressing Play again
    // should pick up where it left off. A set that's never genuinely been
    // run has no such guarantee: its `time` could be a template/plan default,
    // an "+Add Set" suggestion copied from the previous set, or any other
    // prefill — starting the stopwatch from that silently baked a phantom
    // head start into both the displayed time and the live calorie total
    // before the client did anything. Reported repeatedly for Plank/Air
    // Rowing, including on a session that had already been open since before
    // the hydration paths themselves were fixed to leave `time` blank — an
    // in-progress session keeps whatever it was hydrated with, so a never-
    // completed set could still be carrying the old stale value.
    const existingPausedDuration = setTimers[key]?.pausedDuration;
    const resumeFrom = existingPausedDuration != null
      ? existingPausedDuration
      : (set?.timeIsLive ? (parseTimeStringToSeconds(set.time) || 0) : 0);
    // The coach's prescribed hold (startPlan's targetTime) makes the live
    // display count DOWN to 00:00, same as a cardio interval — see
    // handleCardioStopwatchStart. Kept on the timer entry so it survives
    // pause/resume; only targetTime counts, never a typed/prefilled `time`.
    const targetSeconds = setTimers[key]?.targetSeconds != null
      ? setTimers[key].targetSeconds
      : (parseTimeStringToSeconds(set?.targetTime) || 0);
    // Already at/past the target (countdown finished earlier) — start over
    // instead of instantly finishing again.
    const pausedDuration = targetSeconds > 0 && resumeFrom >= targetSeconds ? 0 : resumeFrom;
    setSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration, targetSeconds }
    }));
  };

  const handleSetStopwatchPause = (exIdx, sIdx) => {
    const key = getSetTimerKey(exIdx, sIdx);
    const elapsed = getSetElapsedSeconds(exIdx, sIdx);
    // Sync into set.time on pause (not just on Complete) — without this the
    // time field had no manually-editable value to show while paused, since
    // the live count only ever lived in setTimers, not on the set itself.
    handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
    // This value just came from a real running timer, so it's safe for a
    // later Play (this pause, or after a complete/uncomplete round trip) to
    // resume from — see handleSetStopwatchStart's timeIsLive check.
    handleSetChange(exIdx, sIdx, 'timeIsLive', true);
    // Keep whatever else was on the entry (autoKm, a cardio set's
    // targetSeconds) — a bare replace here used to drop them on every pause,
    // which happened not to matter before autoKm/targetSeconds existed (both
    // are only read while running, and this always sets isRunning: false)
    // but would otherwise reset a cardio countdown back to plain count-up
    // the moment it's resumed.
    setSetTimers(prev => ({
      ...prev,
      [key]: { ...prev[key], isRunning: false, startedAt: null, pausedDuration: elapsed }
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
  //
  // Only applies once a timer entry already exists (i.e. the set has been
  // played/paused at least once this session) — typing into a set that's
  // never been played does NOT mark it resumable (see set.timeIsLive in
  // handleSetStopwatchStart): a typed-but-never-run number is otherwise
  // indistinguishable from a stale template/plan default or an "+Add Set"
  // suggestion, and letting Play resume from it reproduced exactly that bug.
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
    // Same as the timed-exercise Play button — starting a cardio set is real
    // work starting, so the top banner's clock + live kcal should start
    // ticking right away instead of waiting for a tick/complete.
    startSessionClockIfIdle();
    unlockAudio();
    const key = getSetTimerKey(exIdx, sIdx);
    const set = logExercises[exIdx]?.sets[sIdx];
    // A normal pause leaves the timer entry in place with its pausedDuration
    // — but ticking a set complete deletes the entry entirely (see
    // handleCardioSetComplete), so un-ticking and pressing Start again found
    // no entry here and always restarted from 0, discarding the time/km
    // that had already accumulated. Falling back to the set's own saved
    // `time` field (which survives both complete and un-complete) instead
    // of a bare 0 makes Start always resume from wherever it was actually
    // left, not just within the same uninterrupted run — but ONLY when
    // set.timeIsLive confirms that saved value really came from a live timer
    // (see handleSetStopwatchStart's identical guard for the full reasoning);
    // otherwise it could be a template/plan default or an "+Add Set"
    // suggestion, and resuming from it would bake a phantom head start into
    // the displayed time and live calorie total.
    const existingTimer = setTimers[key];
    const existingPausedDuration = existingTimer?.pausedDuration;
    const resumeFrom = existingPausedDuration != null
      ? existingPausedDuration
      : (set?.timeIsLive ? (parseTimeStringToSeconds(set.time) || 0) : 0);
    // The coach's suggested duration (e.g. a 00:30 interval), captured only
    // on the very first Start — pausing overwrites set.time with the ticked
    // elapsed value (see handleCardioStopwatchPause below), so re-reading
    // set.time on a later resume would mistake "how far we'd gotten" for
    // "how long we're meant to go". Once captured it rides along in the
    // timer entry itself across pause/resume instead. Same
    // set.timeIsLive guard as pausedDuration above: a value that's actually
    // a live-recorded elapsed time (post-uncomplete) isn't a target either,
    // so that case just falls back to 0 — plain count-up, same as today.
    //
    // `targetTime` (set by startPlan, see its own comment) is checked FIRST
    // — it's the coach's saved duration surviving the deliberate `time: ''`
    // wipe above, and is the real-world source for a set actually sent to a
    // client via a plan. Falling back to `set.time` covers the other path:
    // an exercise added ad hoc straight into this Live Log, with no
    // separate `targetTime` ever set, where a typed-but-never-run `time` IS
    // the target.
    const targetSeconds = existingTimer?.targetSeconds != null
      ? existingTimer.targetSeconds
      : set?.targetTime
      ? (parseTimeStringToSeconds(set.targetTime) || 0)
      : (set?.timeIsLive ? 0 : (parseTimeStringToSeconds(set.time) || 0));
    // Already at/past the target (countdown finished earlier) — start over
    // instead of instantly finishing again.
    const pausedDuration = targetSeconds > 0 && resumeFrom >= targetSeconds ? 0 : resumeFrom;
    setSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration, autoKm: true, targetSeconds }
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
      // Real elapsed time from a running timer — safe for a later Play (after
      // an uncomplete) to resume from. See handleCardioStopwatchStart's
      // timeIsLive guard.
      handleSetChange(exIdx, sIdx, 'timeIsLive', true);
      if (timer.autoKm) {
        const exName = logExercises[exIdx]?.name;
        handleSetChange(exIdx, sIdx, 'distanceKm', String(estimateCardioDistanceKm(exName, elapsed)));
      }
      setSetTimers(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    } else {
      // Ticked with no time run or typed: log the coach's target (and a KM
      // estimate for it, if KM is blank too) instead of a blank time — same
      // as handleSetStopwatchComplete does for timed holds.
      const set = logExercises[exIdx]?.sets[sIdx];
      const targetSeconds = !set?.time ? parseTimeStringToSeconds(set?.targetTime) : null;
      if (targetSeconds) {
        handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(targetSeconds));
        if (!set.distanceKm) {
          handleSetChange(exIdx, sIdx, 'distanceKm', String(estimateCardioDistanceKm(logExercises[exIdx].name, targetSeconds)));
        }
      }
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
    // Ticked with nothing timed or typed at all: log the coach's target
    // (targetTime) instead of 00:00 — the client did the prescribed hold,
    // they just didn't run the stopwatch for it.
    const hadRealTimer = !!setTimers[key];
    const set = logExercises[exIdx]?.sets[sIdx];
    const elapsed = hadRealTimer
      ? getSetElapsedSeconds(exIdx, sIdx)
      : (parseTimeStringToSeconds(set?.time || set?.targetTime) || 0);
    handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
    // Only mark it "live" (safe for a later Play, after an uncomplete, to
    // resume from — see handleSetStopwatchStart) when it actually came from
    // a real running timer just now. A typed-then-ticked value stays
    // untrusted for that purpose, same as any other prefill.
    if (hadRealTimer) handleSetChange(exIdx, sIdx, 'timeIsLive', true);
    handleToggleSetCompleted(exIdx, sIdx);
    setSetTimers(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
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

  const handleConfirmSaveWorkout = async () => {
    // A stale tab doesn't fail this save — it SUCCEEDS, but with wrong data:
    // the pre-fix duration/calories logic reads workoutTimerStartedAt raw (no
    // "totalCompleted === 0" fallback), so a client whose session finished
    // through the check-all button or the zero-ticked safeguard silently
    // gets durationSeconds/caloriesBurned: null again, with nothing to throw
    // and no error path to catch it. Same gap closed on the coach's Live Log
    // save — see its handleSaveLiveSession for the fuller writeup. The draft
    // is autosaved continuously, so it's safe to reload right now — reopening
    // lands back on this same in-progress session with every set still there,
    // on the fixed build.
    const staleTab = await checkForPendingPWAUpdate();
    if (staleTab) {
      triggerToast('⚠️ Your app was out of date — updating now. Your sets are safe; tap Save again once it reloads.');
      setTimeout(applyPWAUpdate, 1500);
      return;
    }
    let activeExercises = [...logExercises];
    const totalCompleted = activeExercises.reduce(
      (sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length,
      0
    );

    // Duration is read from workoutTimerStartedAt further below, but that's
    // React state — calling startSessionClockIfIdle() in this same
    // synchronous handler won't update it in time for that read (state
    // updates apply on the next render). Track the effective start time
    // locally so a session finished entirely through the safeguard below
    // still gets a real duration/calories instead of null.
    let effectiveTimerStartedAt = workoutTimerStartedAt;

    // Safeguard: if no sets are marked completed in state yet (due to async updates), auto-complete them
    if (totalCompleted === 0) {
      const now = Date.now();
      // Same as the per-set toggle and the "✓ all" bulk button — without
      // this, a session finished entirely through this safeguard path never
      // starts the session clock, so it saves with durationSeconds/
      // caloriesBurned: null despite every set being marked done below.
      startSessionClockIfIdle();
      if (!effectiveTimerStartedAt) effectiveTimerStartedAt = now;
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
                : isTimedExercise(ex.name) && isBodyweightExercise(ex.name)
                ? { time: s.time || '', weight: parseFloat(s.weight) || 0 }
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
    const finalDurationSeconds = effectiveTimerStartedAt ? computeElapsedSeconds(effectiveTimerStartedAt, workoutPauseIntervals) : null;
    const clientBodyWeightKg = parseFloat(localStorage.getItem('userWeight')) || DEFAULT_BODY_WEIGHT_KG;
    const finalCalories = effectiveTimerStartedAt ? computeLiveCalories(activeExercises, effectiveTimerStartedAt, workoutPauseIntervals, clientBodyWeightKg).totalKcal : null;

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
            : isTimedExercise(ex.name) && isBodyweightExercise(ex.name)
            ? { time: s.time, weight: s.weight }
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
    // Confirmed 2026-08-11 for a real client (Mahalsa). A save already SENT
    // (the last ticked set goes out immediately) has the same effect if it
    // lands after the delete, so the delete also waits for it.
    // Session is finished and saved to workout_logs — the open draft is done.
    deleteDraftAfterPendingSave();

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
    // Self-logged saves show the summary/share card first and redirect when
    // it's closed (see WorkoutShareCard's onClose below).
    let redirectAfterSave = false;
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
      // No summary card on this path, so nothing to wait for.
      redirectAfterSave = true;
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
    if (redirectAfterSave) onWorkoutSaved?.();
  };

  // ─── Start a workout from a generic template ───
  // `level` ('beginner' | 'intermediate' | 'advanced' | undefined) is only
  // passed when starting from the difficulty-leveled Workout Library — see
  // loggingLevel above.
  const handleStartFromTemplate = (template, level = null) => {
    const exercises = template.exercises.map(ex => {
      const targetReps = parseInt(String(ex.reps).split('–')[0]) || 10;
      return {
        name: ex.name,
        // Pre-fill each set with what the client actually lifted last time
        // instead of a flat 0 — set 1 gets set 1's last weight/reps, set 3
        // gets set 3's, etc., so PREV and the editable fields agree instead
        // of looking unrelated. Falls back to the template's target reps
        // and 0 weight when nothing's been logged for that set before.
        // (Started from the Home banner, this runs on mount — before the
        // history has loaded — so markPrevPending has the pre-fill applied
        // once it arrives.)
        sets: Array.from({ length: ex.sets || 3 }, (_, setIdx) => markPrevPending(applyPrevRepsAndWeight({
          reps: targetReps,
          weight: '0',
          isCompleted: false,
          // Kept so the reps input can show the plan's target range as a
          // placeholder hint once the lifter clears the pre-filled number.
          targetReps: ex.reps ? String(ex.reps) : null
        }, findPreviousLoggedSet(ex.name, setIdx)), 'template'))
      };
    });
    setLogExercises(exercises);
    setSetTimers({});
    setTemplateName(template.name);
    setActiveTemplateName(template.name);
    setLoggingLevel(level);
    setLogClient(loggedInUser);
    setLogDate(getLocalDateString());
    startWorkoutClock();
    setIsLoggingWorkout(true);
    setActiveView('log');
    triggerToast(`Starting ${template.name} — fill in your weights and mark sets done!`);
  };

  // ─── Deep-link auto-start from the Home screen's guidance banner ───
  // NextWorkoutBanner writes workoutTrackerAutoStart_<userId> (see its
  // goToProgram) with the exact program it recommended, then switches to
  // this tab — so the client lands straight in the logger with that program
  // pre-loaded instead of landing on the Workout Library and having to tap
  // the card themselves. A ref guard, not a dependency array, since this
  // must run exactly once per mount regardless of what else changes right
  // after; silently drops the request instead of clobbering a session
  // that's already in progress.
  const autoStartConsumedRef = useRef(false);
  const pendingCoachPlanIdRef = useRef(null);
  useEffect(() => {
    if (autoStartConsumedRef.current) return;
    autoStartConsumedRef.current = true;
    const key = `workoutTrackerAutoStart_${localStorage.getItem('userId') || loggedInUser}`;
    let payload = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) payload = JSON.parse(raw);
    } catch { /* ignore malformed payload */ }
    if (!payload) return;
    try { localStorage.removeItem(key); } catch { /* ignore quota/serialization errors */ }
    if (savedWorkoutDraft) return; // already mid-session — don't clobber it
    // Home's "New plan from your coach" card sends just the plan id — the
    // plan itself arrives with clientPlans, so the effect below starts it.
    if (payload.coachPlanId) {
      pendingCoachPlanIdRef.current = payload.coachPlanId;
      setActiveView('log');
      return;
    }
    if (!payload.name || !Array.isArray(payload.exercises)) return;
    handleStartFromTemplate({ name: payload.name, exercises: payload.exercises }, payload.level || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // `time` is deliberately NOT carried over from the saved plan, unlike
        // reps/weight/distanceKm which are legitimate reusable targets. A
        // saved mm:ss is the actual duration a PAST session's stopwatch ran
        // for, not a target — starting a template with it pre-filled made
        // the set look already-timed, and liveRunningCardioKcal below reads
        // any non-empty, non-running set.time as a frozen elapsed value, so
        // the calorie total silently included that stale time before the
        // client had touched the stopwatch. Reported 2026-08-28 for Plank/
        // Air Rowing. Always start these blank; only an explicit "resume"
        // flow should ever restore a real in-progress time.
        sets: ex.sets.map((s, setIdx) => withPrevValues(ex.name, setIdx, isCardioExercise(ex.name)
          // targetTime carries the coach's saved duration through as a
          // reusable TARGET (read by handleCardioStopwatchStart to drive the
          // countdown display) without reintroducing the stale-elapsed-time
          // bug above — `time` itself still always starts blank.
          ? { distanceKm: s.distanceKm ?? '', time: '', targetTime: s.time || '', isCompleted: false }
          // Timed holds (Plank, Side Hops, ...) get the same targetTime —
          // only cardio had it, so a coach's prescribed mm:ss never reached
          // the client and the field just read "mm:ss".
          : isTimedExercise(ex.name) && isBodyweightExercise(ex.name)
          ? { time: '', targetTime: s.time || '', weight: String(s.weight ?? '0'), isCompleted: false }
          : isTimedExercise(ex.name)
          ? { time: '', targetTime: s.time || '', isCompleted: false }
          // s.reps/s.weight can genuinely be missing (e.g. a loaded-carry
          // exercise like Farmer Walk saved from a source that didn't fill
          // both fields) — String(undefined) renders as the literal text
          // "undefined" in the input box instead of leaving it blank, same
          // bug the cardio/timed branches above already guard against with
          // `?? ''`. This branch never got that guard.
          : { reps: String(s.reps ?? ''), weight: String(s.weight ?? ''), isCompleted: false }))
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
    setLoggingLevel(null);
    setIsLoggingWorkout(true);
    startWorkoutClock();
  };

  // Second half of the Home coach-plan deep link (see the auto-start effect
  // above): start the plan once clientPlans has loaded it. Stays pending
  // until the plan shows up — the first renders run with an empty list.
  useEffect(() => {
    const planId = pendingCoachPlanIdRef.current;
    if (!planId || loadingPlans) return;
    const plan = clientPlans.find(p => p.id === planId);
    if (!plan) return;
    pendingCoachPlanIdRef.current = null;
    markPlanOpened(plan.id);
    startPlan(plan, 'coach');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startPlan is recreated every render; only a plans refresh should re-run this
  }, [clientPlans, loadingPlans]);

  // Live calorie readout for the client's own "Log Sets" stopwatch banner —
  // identical mechanism to the coach Live Log: each completed set's own
  // completedAt timestamp drives the work + rest-interval calc, recomputed
  // fresh every render so it climbs live as sets get checked off.
  //
  // computeLiveCalories only counts COMPLETED sets, so an in-progress cardio
  // or timed-hold (Plank, Side Hops, ...) set contributed nothing here — the
  // per-row time/kcal and the top banner disagreed. This adds each
  // not-yet-completed cardio/timed set's own live estimate on top, driven by
  // elapsed time regardless of running/paused:
  // - RUNNING: elapsed climbs live off the timer, same as the per-row clock
  //   (and, since Play now also starts the session clock — see
  //   startSessionClockIfIdle — the top banner switches out of idle at the
  //   same moment this starts counting).
  // - PAUSED (not completed): elapsed reads the frozen set.time value that
  //   pausing already synced there, so the total holds steady instead of
  //   dropping to 0 and then jumping back up on resume. Gated on
  //   set.timeIsLive (see handleSetStopwatchStart) — a never-actually-run
  //   set's `time` could be a template/plan default or an "+Add Set"
  //   suggestion rather than real elapsed time, and counting calories from
  //   that reproduced the exact "calories calculated before I did anything"
  //   bug this whole mechanism was meant to avoid.
  // - COMPLETED: excluded here on purpose — computeLiveCalories's own
  //   completed-set branch already counts it from the same final
  //   time/distanceKm, so nothing is double-counted or lost when a set gets
  //   ticked or un-ticked.
  const bodyWeightKgForLiveKcal = parseFloat(localStorage.getItem('userWeight')) || DEFAULT_BODY_WEIGHT_KG;
  const liveRunningCardioKcal = logExercises.reduce((sum, ex, exIdx) => {
    // Same "not yet completed but the stopwatch has time on it" live
    // estimate as the cardio branch below, just for timed holds (Plank,
    // Side Hops, Wall Sit, ...) — no distance/pace, duration alone drives
    // estimateTimedHoldKcal.
    if (isTimedExercise(ex.name)) {
      return sum + ex.sets.reduce((s, set, sIdx) => {
        if (set.isCompleted) return s;
        const timer = setTimers[getSetTimerKey(exIdx, sIdx)];
        const isRunning = timer?.isRunning || false;
        const elapsed = isRunning ? getSetElapsedSeconds(exIdx, sIdx) : (set.timeIsLive ? (parseTimeStringToSeconds(set.time) || 0) : 0);
        if (elapsed <= 0) return s;
        return s + estimateTimedHoldKcal(elapsed, bodyWeightKgForLiveKcal, ex.name);
      }, 0);
    }
    if (!isCardioExercise(ex.name)) return sum;
    return sum + ex.sets.reduce((s, set, sIdx) => {
      if (set.isCompleted) return s;
      const timer = setTimers[getSetTimerKey(exIdx, sIdx)];
      const isRunning = timer?.isRunning || false;
      const elapsed = isRunning ? getSetElapsedSeconds(exIdx, sIdx) : (set.timeIsLive ? (parseTimeStringToSeconds(set.time) || 0) : 0);
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
          data-tour="wt-tab-log"
          className={`tab-item-btn ${activeView === 'log' ? 'active' : ''}`}
          onClick={() => setActiveView('log')}
        >
          📝 Log Sets
        </button>
        <button
          data-tour="wt-tab-templates"
          className={`tab-item-btn ${activeView === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveView('templates')}
        >
          🏋️ Library
        </button>
      </div>

      {activeView === 'analytics' && (
        <div className="analytics-view-wrapper">
          {/* Header area */}
          <div className="tracker-top-summary glass-panel">
            {/* Only rendered for a coach/trainer — for a client, this used to
                render an empty wrapper (name-group had nothing inside, since
                the select is trainer-only) that still took up its own
                padding/margin as visible dead space above Training Level. */}
            {isTrainer(localStorage.getItem('userEmail')) && (
              <div className="profile-details-group">
                <div className="name-group">
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
                </div>
              </div>
            )}

            {/* Skill-level progress bar — based purely on the client's own
                session history (see skillLevel above), not on any coaching
                relationship. Previously gated behind hasCoachAssigned
                because it replaced a coaching-program accounting display
                (Completed/Remaining session counts, still computed above,
                just no longer shown here — that accounting still lives on
                the Home dashboard's own progress card) that WAS legitimately
                coach-only; this bar inherited that gate by copy-paste even
                though it has no coach dependency, which hid it completely
                for self-guided clients. Now shown unconditionally. Best Lift
                moved below the Strength Progression chart (see further
                down). */}
            <span className="skill-level-heading">🏆 Training Level</span>
            <div className="sessions-accounting-split">
              <div className="skill-level-bar" title={`${Math.round(skillLevel.score)}/100 — earned from consistency and progressive overload over your whole training history, not just recent activity`}>
                <div className="skill-level-track">
                  {['Beginner', 'Intermediate', 'Advanced', 'Elite'].map((tier, i) => (
                    <div key={tier} className={`skill-level-segment ${i < skillLevel.tierIndex ? 'filled' : ''}`}>
                      {/* Past tiers render fully solid. The CURRENT tier
                          fills only up to withinTierPct — otherwise the
                          whole segment looked 100% filled regardless of
                          actual progress within it, while the dot sat
                          somewhere in the middle implying otherwise. Now
                          the dot always sits exactly at the filled/empty
                          edge of its own segment. */}
                      {i === skillLevel.tierIndex && (
                        <div className="skill-level-segment-fill" style={{ width: `${skillLevel.withinTierPct * 100}%` }} />
                      )}
                      {i === skillLevel.tierIndex && (
                        <div className="skill-level-marker" style={{ left: `${skillLevel.withinTierPct * 100}%` }} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="skill-level-labels">
                  {[
                    ['Beginner', '0-4wk'],
                    ['Intermediate', '4-12wk'],
                    ['Advanced', '12-26wk'],
                    ['Elite', '26wk+']
                  ].map(([tier, weeks], i) => (
                    <span key={tier} className={`skill-level-label-item ${i === skillLevel.tierIndex ? 'active' : ''}`}>
                      {tier}
                      <em>{weeks}</em>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SVG Graph block — the exercise picker/Guide/timeframe row now
              lives in this same card (was previously a separate section in
              .tracker-top-summary above), so the picker and the strength
              progression chart it controls read as one section instead of
              two stacked ones. */}
          <div className="overload-chart-card glass-panel">
            <div className="progression-heading-row">
              <div className="progression-section-heading">
                <h3>📈 Strength Progression</h3>
                <p>Track progressive overload metrics</p>
              </div>
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

              <div className="metric-switch">
                <button
                  className={`metric-btn ${chartMetric === 'weight' ? 'active' : ''}`}
                  onClick={() => setChartMetric('weight')}
                  title="Peak Weight"
                >
                  Weight
                </button>
                <button
                  className={`metric-btn ${chartMetric === 'volume' ? 'active' : ''}`}
                  onClick={() => setChartMetric('volume')}
                  title="Workload Volume"
                >
                  Volume
                </button>
              </div>
            </div>

            {graphData.length === 0 ? (
              <div className="empty-chart-state">
                <span>⚠️</span> No sessions logged yet for this client/exercise combinative.
              </div>
            ) : (
              <div className="chart-body">
                {/* Nothing in the UI previously hinted this chart is
                    horizontally draggable once there are more sessions than
                    fit — a client had no way to know there was more to see.
                    Edge fade (CSS) + this small caption only appear when the
                    chart is actually wider than its box. */}
                <div className={`svg-scroll-wrap ${totalAxisDays > VISIBLE_DAYS ? 'scrollable' : ''}`}>
                  <div className="svg-container-box" ref={chartScrollRef}>
                  <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="analytics-svg-graph"
                    style={{ width: `${width}px` }}
                  >
                    <line x1={paddingX} y1={padding} x2={width - paddingX} y2={padding} stroke="rgba(var(--fg-rgb), 0.02)" strokeWidth="1" />
                    <line x1={paddingX} y1={padding + chartHeight / 2} x2={width - paddingX} y2={padding + chartHeight / 2} stroke="rgba(var(--fg-rgb), 0.02)" strokeWidth="1" />
                    <line x1={paddingX} y1={padding + chartHeight} x2={width - paddingX} y2={padding + chartHeight} stroke="rgba(var(--fg-rgb), 0.06)" strokeWidth="1" />

                    {/* Gradient fill under the line — was gated to only the
                        Volume metric before, so the Weight chart (the one in
                        the reference design) never got it. Shows for both
                        now, tinted to match whichever metric's line color. */}
                    {areaPoints && (
                      <path
                        d={areaPoints}
                        fill={chartMetric === 'weight' ? 'url(#weightGradient)' : 'url(#volumeGradient)'}
                      />
                    )}
                    <defs>
                      {/* Extra stop partway down so the color carries further
                          toward the bottom instead of fading out by the
                          halfway point — opacity now lives on the stops
                          themselves (not a flat opacity on the whole shape),
                          so this curve is the actual visible spread. */}
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
                        <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary-accent-light)" stopOpacity="0.55" />
                        <stop offset="65%" stopColor="var(--primary-accent-light)" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="var(--primary-accent-light)" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {pathPoints && (
                      <path 
                        d={pathPoints} 
                        fill="none" 
                        stroke={chartMetric === 'weight' ? '#3b82f6' : 'var(--accent-text)'}
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    )}

                    {activeSessionData && (
                      <line 
                        x1={getPointX(activeSessionData.date)}
                        y1={padding}
                        x2={getPointX(activeSessionData.date)}
                        y2={padding + chartHeight} 
                        stroke="rgba(var(--fg-rgb), 0.1)" 
                        strokeWidth="1.5" 
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Per-point date labels — safe to show one per point
                        now that x-position is calendar-day based instead of
                        every session being squeezed into a constant-width
                        chart; extra points just extend the scrollable width
                        instead of crowding these together. Clickable —
                        jumps the slider straight to that session, same as
                        tapping its point on the line does. Replaces the
                        separate thinned date-tick row under the slider,
                        which was redundant with this. */}
                    {graphData.map((d, idx) => (
                      <text
                        key={`axis-${d.date}-${idx}`}
                        x={getPointX(d.date)}
                        y={padding + chartHeight + 22}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill={idx === selectedSessionIndex ? 'var(--text-main)' : 'var(--text-muted)'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedSessionIndex(idx)}
                      >
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </text>
                    ))}

                    {graphData.map((d, idx) => {
                      const val = chartMetric === 'weight' ? d.weight : d.volume;
                      const active = activeSessionData && activeSessionData.index === d.index;
                      const px = getPointX(d.date);
                      const py = getPointY(val);
                      return (
                        <g key={`${d.date}-${idx}`}>
                          {/* Plain value label for every OTHER point — the
                              active point gets the tooltip card below
                              instead, so it isn't shown twice. */}
                          {!active && (
                            <text
                              x={px}
                              y={Math.max(py - 14, 14)}
                              textAnchor="middle"
                              fontSize="13"
                              fontWeight="800"
                              stroke="var(--bg-card)"
                              strokeWidth="3"
                              strokeLinejoin="round"
                              paintOrder="stroke"
                              fill="rgba(var(--fg-rgb), 0.85)"
                            >
                              {chartMetric === 'weight' ? `${val}${getExerciseUnit(selectedExercise)}` : val}
                            </text>
                          )}
                          {/* Soft halo ring behind the active point, matching
                              the reference design's highlighted dot. */}
                          {active && (
                            <circle
                              cx={px}
                              cy={py}
                              r="11"
                              fill={chartMetric === 'weight' ? 'rgba(59,130,246,0.18)' : 'rgba(var(--accent-rgb), 0.18)'}
                            />
                          )}
                          <circle
                            cx={px}
                            cy={py}
                            r={active ? "6" : "4"}
                            fill={chartMetric === 'weight' ? '#3b82f6' : 'var(--accent-text)'}
                            stroke="var(--bg-card)"
                            strokeWidth={active ? "2" : "1.5"}
                            style={{ transition: 'all 0.2s ease-in-out' }}
                          />
                        </g>
                      );
                    })}

                    {/* Tooltip card above the active (slider-selected) point —
                        "Jul 3 | Weight: 22.5kg" style, replaces the plain
                        number label for that one point. foreignObject so it
                        can use real HTML/CSS (rounded card, border) instead
                        of hand-building it out of SVG rect/text primitives. */}
                    {activeSessionData && (() => {
                      const val = chartMetric === 'weight' ? activeSessionData.weight : activeSessionData.volume;
                      const label = chartMetric === 'weight'
                        ? `Weight: ${val}${getExerciseUnit(selectedExercise)}`
                        : `Volume: ${val}kg`;
                      const dateLabel = new Date(activeSessionData.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      const boxWidth = 118;
                      const boxHeight = 40;
                      const px = getPointX(activeSessionData.date);
                      const py = getPointY(val);
                      const boxX = Math.min(Math.max(px - boxWidth / 2, 2), width - boxWidth - 2);
                      const boxY = Math.max(py - boxHeight - 16, 2);
                      return (
                        <foreignObject x={boxX} y={boxY} width={boxWidth} height={boxHeight} style={{ overflow: 'visible' }}>
                          <div className="chart-point-tooltip">
                            <span>{dateLabel} |</span> <strong>{label}</strong>
                          </div>
                        </foreignObject>
                      );
                    })()}
                  </svg>
                  </div>
                  {totalAxisDays > VISIBLE_DAYS && (
                    <span className="svg-scroll-hint">↔ Drag</span>
                  )}
                </div>

                <div className="graph-day-slider-panel">
                  <div className="slider-label-row">
                    <span>📅 Timeline Session</span>
                    <strong>
                      {/* Read off activeSessionData (already resolved from
                          `selectedSessionIndex` as a graphData position, see
                          above) instead of indexing displayedSessions
                          directly — displayedSessions is the raw,
                          unfiltered session list, so the same numeric index
                          can land on a completely different date once
                          sessions with no data for this exercise have been
                          filtered out of graphData. Reading both the number
                          and the date off the same resolved object is what
                          keeps this label in sync with the highlighted dot. */}
                      Session {activeSessionData ? activeSessionData.index + 1 : selectedSessionIndex + 1}: <span className="text-highlight">{activeSessionData?.date}</span>
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
                </div>
              </div>
            )}
          </div>

          {/* Best Lift — moved out of the top header row, below the Strength
              Progression chart instead. Top PR highlighted, every other
              exercise's own PR listed underneath. */}
          {(hasCoachAssigned || isTrainer(localStorage.getItem('userEmail'))) && (
            <div className="best-lift-card glass-panel">
              <span className="acc-lbl" style={{ color: '#f59e0b' }}>Best Lift</span>
              <strong>{bestLiftLabel}</strong>
              {bestSessionDateLabel && <span className="acc-sub-date">{bestSessionDateLabel}</span>}
              {otherPRs.length > 0 && (
                // Hard cap, full stop — top 10 best lifts total (the top PR
                // row above + up to 9 more here), no "+N more"/expand affordance
                // for whatever's past that. A client who's logged hundreds of
                // distinct exercises still just sees their top 10, nothing else.
                <div className="other-prs-list">
                  {otherPRs.slice(0, 9).map(p => (
                    <div key={p.name} className="other-pr-row">
                      <span>{p.name}</span>
                      <strong>{p.weight}kg</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

        </div>
      )}

      {/* ─── TEMPLATES VIEW ─── */}
      {activeView === 'templates' && (
        <div className="wt-templates-outer">

          {/* Workout Library — Gym/Home × Beginner/Intermediate/Advanced */}
          <div className="wt-section">
            <div className="wt-library-header">
              <div>
                <h3 className="wt-library-title">Workout Library</h3>
                <p className="wt-library-sub">Structured programs for every level</p>
              </div>
            </div>

            {/* Gym vs Home — every level exists in both, so this sits above
                the level tabs rather than replacing one of them. Home
                programs are bodyweight/no-equipment only. */}
            <div className="wt-category-toggle">
              {[['gym', '🏋️ Gym'], ['home', '🏠 Home']].map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  className={`wt-category-btn${genericCategory === cat ? ' active' : ''}`}
                  onClick={() => { setGenericCategory(cat); setShowAllLevelWorkouts(false); }}
                >
                  {label}
                </button>
              ))}
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
                <span>⏳</span> Loading {genericCategory} {genericLevel} workouts…
              </div>
            ) : levelWorkouts.length === 0 ? (
              <div className="wt-empty-state">
                <span>📭</span> No {genericCategory} {genericLevel} workouts available yet.
              </div>
            ) : (
              <div className="wt-library-grid">
                {(showAllLevelWorkouts ? levelWorkouts : levelWorkouts.slice(0, 4)).map(workout => {
                  const exList = Array.isArray(workout.exercises) ? workout.exercises : [];
                  const meta = getPlanCardMeta({ exercises: exList, planName: workout.name });
                  const tags = getProgramTags(exList, workout.name);
                  return (
                    <button
                      key={workout.id}
                      type="button"
                      className={`wt-program-card wt-program-card--${genericLevel}`}
                      onClick={() => setPreviewProgram({ workout, level: genericLevel })}
                    >
                      <div className="wt-program-tile">
                        {meta.muscles.length > 1 ? (
                          <FullBodyThumbnail trainedMuscles={meta.muscles} view={meta.view} size={64} />
                        ) : (
                          <MuscleThumbnail muscle={meta.primaryMuscle} color={meta.color} size={64} />
                        )}
                      </div>
                      <div className="wt-program-info">
                        <div className="wt-program-name">{workout.name}</div>
                        <div className="wt-program-meta">
                          <span className={`wt-program-dot wt-program-dot--${genericLevel}`} />
                          {exList.length} exercise{exList.length === 1 ? '' : 's'}
                        </div>
                        <div className="wt-program-tags">
                          <span className={`wt-program-tag wt-program-tag--${genericLevel}`}>
                            {genericLevel.charAt(0).toUpperCase() + genericLevel.slice(1)}
                          </span>
                          <span className="wt-program-tag">⏱ ~{tags.minutes} min</span>
                          {tags.equipment.map(e => <span key={e} className="wt-program-tag">{e}</span>)}
                        </div>
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

          {previewProgram && (
            <LibraryProgramPreview
              workout={previewProgram.workout}
              level={previewProgram.level}
              onClose={closeProgramPreview}
              onStart={(w, lvl) => {
                setPreviewProgram(null);
                handleStartFromTemplate({ name: w.name, exercises: Array.isArray(w.exercises) ? w.exercises : [] }, lvl);
              }}
            />
          )}

          {/* Quick empty start CTA */}
          <div className="wt-blank-cta">
            <button
              className="wt-blank-btn"
              onClick={() => {
                setLogExercises(getDefaultWarmupExercises());
                setTemplateName('Custom Session');
                setLogClient(loggedInUser);
                setLogDate(getLocalDateString());
                setLoggingLevel(null);
                startWorkoutClock();
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
        // the Home screen's coach-plan deep link.
        // "Top 10" means best-PERFORMED, not most recent: ranked by each
        // template's own average calories burned, session duration, and
        // weight volume across its past completed sessions (see
        // rankTemplatesByPerformance) — a template never actually performed
        // sorts last. Anything beyond the top 10 isn't shown at all, even
        // via "View all".
        const ownSessions = sessions.filter(s => (s.clientName || '').toLowerCase() === selectedClient.toLowerCase());
        const templatePlans = rankTemplatesByPerformance(clientPlans.filter(p => p.createdBy === 'client'), ownSessions, 10);
        const visibleTemplatePlans = showAllTemplates ? templatePlans : templatePlans.slice(0, 3);
        const coachPlans = clientPlans.filter(p => p.createdBy === 'coach' && p.isAssigned !== false);
        const visibleCoachPlans = showAllCoachPlans ? coachPlans : coachPlans.slice(0, 3);

        const handleDeleteTemplate = async (plan) => {
          if (confirm('Are you sure you want to delete this template?')) {
            await databaseService.deleteWorkoutPlan(plan.id, getPlanOwnerId());
            fetchPlans();
          }
        };

        return (
          <div className="routines-launcher-wrapper glass-panel" style={{ padding: '20px', width: '100%' }}>
            <div className="launcher-header" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: 800 }}>🏋️‍♂️ Start Workout Session</h3>
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
                setLoggingLevel(null);
                setIsLoggingWorkout(true);
                startWorkoutClock();
              }}
            >
              <span className="wt-start-empty-icon">+</span>
              <div className="wt-start-empty-text">
                <strong>Start Empty Workout</strong>
                <span>Create a workout from scratch</span>
              </div>
              <span className="wt-start-empty-chevron">›</span>
            </button>

            {/* Coach Plans — every plan the coach has assigned (isAssigned
                excludes coach-only records, e.g. a plan auto-saved from Live
                Log that was never assigned to this client). A brand-new one
                is also surfaced on the Home screen until it's started (see
                CoachPlanHomeCard); once started it lives here only. */}
            {coachPlans.length > 0 && (
              <div className="wt-picker-section">
                <div className="wt-picker-section-header">
                  <span className="wt-picker-section-title">📋 Coach Assigned <span className="wt-count-badge">{coachPlans.length} available</span></span>
                  {coachPlans.length > 3 && (
                    <button type="button" className="wt-view-all-btn" onClick={() => setShowAllCoachPlans(v => !v)}>
                      {showAllCoachPlans ? 'Show less' : 'View all'}
                    </button>
                  )}
                </div>
                <div className="wt-plan-list">
                  {visibleCoachPlans.map(plan => (
                    <PlanCard
                      key={plan.id || plan.planName}
                      plan={plan}
                      source="coach"
                      onStart={() => startPlan(plan, 'coach')}
                    />
                  ))}
                </div>
              </div>
            )}

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
                        setLoggingLevel(null);
                        setLogExercises(plan.exercises.map(ex => ({
                          name: ex.name,
                          // See startPlan's identical comment above: `time` is
                          // never carried over from the saved plan — it's a
                          // past session's real duration, not a target, and a
                          // stale non-empty value here silently fed straight
                          // into liveRunningCardioKcal's calorie total before
                          // the client touched anything.
                          sets: ex.sets.map(s => isCardioExercise(ex.name)
                            // targetTime: see startPlan — keeps the coach's
                            // prescribed duration as a hint/countdown target.
                            ? { distanceKm: s.distanceKm ?? '', time: '', targetTime: s.time || '', isCompleted: false }
                            : isTimedExercise(ex.name) && isBodyweightExercise(ex.name)
                            ? { time: '', targetTime: s.time || '', weight: String(s.weight ?? '0'), isCompleted: false }
                            : isTimedExercise(ex.name)
                            ? { time: '', targetTime: s.time || '', isCompleted: false }
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
                    {/* Top 10 by actual performance (avg calories/duration/
                        volume from past sessions logged under each plan's
                        name) — see rankTemplatesByPerformance — not just the
                        10 most recent. */}
                    {rankTemplatesByPerformance(
                      clientPlans,
                      sessions.filter(s => (s.clientName || '').toLowerCase() === selectedClient.toLowerCase()),
                      10
                    ).map(p => (
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

          <div className="exercises-form-section">
            <div className="section-title-row" style={{ position: 'relative' }}>
              <p className="workout-log-instructions">Enter your reps and weights, then tick each set as you complete it.</p>
            </div>

            <div className="exercises-input-list">
              {logExercises.map((ex, exIdx) => {
                const unit = getExerciseUnit(ex.name);
                const exIsCardio = isCardioExercise(ex.name);
                const exIsBodyweight = isBodyweightExercise(ex.name);
                // The BODYWEIGHT/KG column header reflects the real current
                // state of the sets (not the stale exercise-level default) —
                // it only says BODYWEIGHT when every set actually is, so it
                // never contradicts a row underneath showing a KG input.
                const allSetsLogBw = exIsBodyweight && ex.sets.every(s => getSetLogBwMode(ex, s));
                const exIsWarmup = isWarmupExercise(ex.name);
                return (
                  <div key={getLogItemKey(exIdx)} className="ex-reorder-row" style={getLogRowStyle(exIdx)}>
                  <div className={`ex-reorder-morph ${isLogReordering ? 'is-reordering' : ''}`}>
                  <div className="ex-reorder-full">
                  <div className="form-exercise-card hevy-exercise-card" data-tour={exIdx === 0 ? 'wt-log-exercise-card' : undefined}>
                    <div className="ex-card-header">
                      <div className="ex-card-title-group">
                        <h5
                          className="ex-name-clickable"
                          role="button"
                          tabIndex={0}
                          title="View exercise history"
                          onClick={() => setHistoryModalExercise(ex.name)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryModalExercise(ex.name); } }}
                          // A tap on a focusable element (role="button"
                          // tabIndex={0}) focuses it as part of the browser's
                          // *default* pointerdown action — and on iOS Safari
                          // in particular, focusing something can trigger the
                          // browser's own "scroll the newly-focused element
                          // into view" heuristic, independent of anything
                          // this app's JS does. Right after a drop, that
                          // reads as an unexplained scroll-to-top on tap.
                          // preventDefault() here only suppresses that
                          // default focus/scroll action — the click event
                          // (and onClick above) still fires normally, and
                          // Tab-key focus is untouched since keyboard focus
                          // never goes through pointerdown.
                          onPointerDown={(e) => e.preventDefault()}
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
                      <ExerciseCardMenu
                        name={ex.name}
                        onReorderPointerDown={startLogExerciseDrag(exIdx)}
                        onMoveUp={() => moveLogExerciseByKeyboard(exIdx, -1)}
                        onMoveDown={() => moveLogExerciseByKeyboard(exIdx, 1)}
                        onRemove={() => {
                          // Remap first — see remapSetTimersForExerciseRemoval's
                          // comment in liveWorkoutTimer.js. Without this a
                          // running stopwatch on any LATER exercise silently
                          // reattached to whatever exercise shifted into its
                          // old index.
                          setSetTimers(prev => remapSetTimersForExerciseRemoval(exIdx, prev));
                          setLogExercises(prev => prev.filter((_, idx) => idx !== exIdx));
                        }}
                      />
                    </div>

                    {!exIsCardio && !isTimedExercise(ex.name) && !exIsWarmup && (() => {
                      const hint = getExerciseProgressionHint(ex.name);
                      return hint ? <div className="ex-progression-hint">📈 {hint}</div> : null;
                    })()}

                    {loggingLevel === 'beginner' && (() => {
                      // Beginner-only inline form video, shown right under the
                      // exercise name without needing a tap — Intermediate/
                      // Advanced sessions (loggingLevel unset) never render this
                      // and keep the Form Guide button as their only video entry
                      // point, unchanged.
                      const matched = findExerciseGuideMatch(exercisesList, ex.name) ||
                                      findExerciseGuideMatch(allExerciseOptions, ex.name);
                      const videoUrl = matched?.video_url || matched?.videoFile || '';
                      if (!videoUrl) return null;
                      const embedUrl = getYouTubeEmbedUrl(videoUrl);
                      return (
                        <div className="beginner-ex-video">
                          {embedUrl ? (
                            <iframe
                              src={embedUrl}
                              title={`${ex.name} form video`}
                              className="beginner-ex-video-frame"
                              frameBorder="0"
                              allowFullScreen
                            />
                          ) : (
                            <video
                              src={videoUrl}
                              className="beginner-ex-video-frame"
                              muted
                              loop
                              playsInline
                              controls
                              preload="metadata"
                            />
                          )}
                        </div>
                      );
                    })()}

                    <div className="hevy-sets-table">
                      <div className={`hevy-table-header ${exIsCardio ? 'hevy-set-row--cardio' : ''}`}>
                        <span className="col-set">SET</span>
                        <span className="col-prev">PREV</span>
                        {exIsCardio ? (
                          <>
                            <span className="col-weight">KM</span>
                            <span className="col-reps">TIME</span>
                          </>
                        ) : isTimedExercise(ex.name) && exIsBodyweight ? (
                          <>
                            <span className="col-weight">{allSetsLogBw ? 'BODYWEIGHT' : `🏋️ ${unit}`}</span>
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
                            <span className="col-weight">{allSetsLogBw ? 'BODYWEIGHT' : `🏋️ ${unit}`}</span>
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
                            onClick={() => {
                              // Same "session has real work in it" signal the
                              // per-set toggle sends (see handleToggleSetCompleted)
                              // — without this, bulk-completing an exercise here
                              // never starts the session clock, so the saved
                              // session gets durationSeconds/caloriesBurned: null
                              // even though every set is checked off.
                              startSessionClockIfIdle();
                              saveDraftNowRef.current = true;
                              const now = Date.now();
                              // Same freeze-before-complete fix as
                              // handleCardioSetComplete/handleSetStopwatchComplete,
                              // just looped over every set in this exercise — "✓ all"
                              // used to set isCompleted:true directly on every set with
                              // no regard for a still-RUNNING cardio/timed stopwatch,
                              // so that set saved with whatever time.distanceKm it had
                              // BEFORE Play was pressed (often blank/0) instead of the
                              // real elapsed duration, and its setTimers entry was left
                              // orphaned (isRunning forever, ticking in the background
                              // with no visible row to show it). Confirmed 2026-08-25.
                              const runningKeysToClear = [];
                              ex.sets.forEach((set, sIdx) => {
                                const key = getSetTimerKey(exIdx, sIdx);
                                const timer = setTimers[key];
                                if (!timer?.isRunning) return;
                                const elapsed = getSetElapsedSeconds(exIdx, sIdx);
                                handleSetChange(exIdx, sIdx, 'time', formatSecondsToTimeString(elapsed));
                                // Real elapsed from a running timer — safe for a later
                                // Play (after an uncomplete) to resume from. See
                                // handleSetStopwatchStart's timeIsLive guard.
                                handleSetChange(exIdx, sIdx, 'timeIsLive', true);
                                if (exIsCardio && timer.autoKm) {
                                  handleSetChange(exIdx, sIdx, 'distanceKm', String(estimateCardioDistanceKm(ex.name, elapsed)));
                                }
                                runningKeysToClear.push(key);
                              });
                              if (runningKeysToClear.length > 0) {
                                setSetTimers(prev => {
                                  const updated = { ...prev };
                                  runningKeysToClear.forEach((k) => delete updated[k]);
                                  return updated;
                                });
                              }
                              // A timed/cardio set that was never run or typed saves
                              // the coach's target, same as handleSetStopwatchComplete
                              // / handleCardioSetComplete (cardio also gets a KM
                              // estimate for it when KM is blank).
                              const fillTarget = exIsCardio || isTimedExercise(ex.name);
                              setLogExercises(prev => prev.map((e, i) => i === exIdx
                                ? { ...e, sets: e.sets.map((s, sIdx) => {
                                    const targetSeconds = fillTarget && !s.isCompleted && !s.time
                                      && !runningKeysToClear.includes(getSetTimerKey(exIdx, sIdx))
                                      ? parseTimeStringToSeconds(s.targetTime)
                                      : null;
                                    return {
                                      ...s,
                                      ...(targetSeconds ? { time: formatSecondsToTimeString(targetSeconds) } : {}),
                                      ...(targetSeconds && exIsCardio && !s.distanceKm
                                        ? { distanceKm: String(estimateCardioDistanceKm(ex.name, targetSeconds)) }
                                        : {}),
                                      isCompleted: true,
                                      completedAt: s.completedAt || now,
                                      // Completed = confirmed, same as the per-set ✓.
                                      weightFromPrev: false,
                                      repsFromPrev: false,
                                    };
                                  }) }
                                : e
                              ));
                            }}
                            className={`btn-check-all ${ex.sets.every(s => s.isCompleted) ? 'is-all-done' : ''}`}
                          >✓ all</button>
                        </span>
                      </div>
                      <div className="hevy-table-body">
                        {ex.sets.map((set, sIdx) => {
                          const prevStats = getPreviousSessionSet(ex.name, sIdx);
                          // Warm-up sets show "W"; failure = "F"; drop = "D"; superset = "S"; others get a working-set number.
                          const workingSetNumber = ex.sets.slice(0, sIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop' && s.setType !== 'superset').length;
                          const setDisplayLabel = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.setType === 'superset' ? 'S' : set.isWarmup ? 'W' : workingSetNumber;
                          // Shared stopwatch/mm:ss control for any timed set (Plank, Foot
                          // Fires, etc.) — factored out so the plain timed-only column
                          // layout and the bodyweight+timed layout (Foot Fires, which also
                          // keeps the Bodyweight/+Add Weight toggle) can each drop it into
                          // whichever column it belongs in without duplicating the ~70
                          // lines of stopwatch/live-tick/registerSetField logic.
                          const renderTimeControl = () => {
                            if (set.isCompleted) {
                              return (
                                <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: 'var(--text-main)' }}>
                                  {set.time || formatSecondsToTimeString(0)}
                                </span>
                              );
                            }
                            const timerKey = getSetTimerKey(exIdx, sIdx);
                            const timer = setTimers[timerKey];
                            const isRunning = timer?.isRunning || false;
                            const elapsedSeconds = getSetElapsedSeconds(exIdx, sIdx);
                            // Counts down to the coach's target when there is one
                            // (clamped at 00:00); the saved time is still elapsed.
                            const timedTargetSeconds = timer?.targetSeconds || 0;
                            const timeStr = formatSecondsToTimeString(timedTargetSeconds > 0
                              ? Math.max(0, timedTargetSeconds - elapsedSeconds)
                              : elapsedSeconds);
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
                                  <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: 'var(--text-main)' }}>
                                    {timeStr}
                                  </span>
                                ) : (
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
                                        // Coach's prescribed hold time as a hint,
                                        // same as the cardio TIME field below.
                                        placeholder={set.targetTime || 'mm:ss'}
                                        active={activeSetKey === timedKey}
                                        onOpen={() => openSetField(timedKey)}
                                        className="cardio-time-input"
                                      />
                                    );
                                  })()
                                )}
                              </div>
                            );
                          };
                          return (
                            <div
                              key={sIdx}
                              className={`hevy-set-row ${exIsCardio ? 'hevy-set-row--cardio' : ''} ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''} ${set.setType === 'superset' ? 'set-row-superset' : ''} ${isExitingSet(exIdx, sIdx) ? 'set-row-exit' : ''}`}
                              onAnimationEnd={(e) => { if (e.target === e.currentTarget) handleExitAnimationEnd(exIdx, sIdx); }}
                              ref={(node) => registerRow(exIdx, sIdx, node)}
                            >
                              <span className="col-set set-type-menu-wrapper">
                                <span
                                  className={`set-num-lbl ${set.isWarmup ? 'warmup' : ''} ${set.setType === 'failure' ? 'failure' : ''} ${set.setType === 'drop' ? 'drop' : ''} ${set.setType === 'superset' ? 'superset' : ''}`}
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
                                  <SetTypeMenu onSelect={(type) => (type === 'remove' ? (setSetTypeMenu(null), beginExit(exIdx, sIdx, () => handleChangeSetType(exIdx, sIdx, type))) : handleChangeSetType(exIdx, sIdx, type))} />
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
                                // A target set in the plan editor (e.g. "Interval
                                // running" logged as 00:30) makes the live display
                                // count DOWN toward it instead of up from 0, clamped
                                // at 00:00 rather than going negative once the
                                // interval's up. No target (typical open-ended
                                // cardio like Jogging left blank) keeps the plain
                                // count-up behavior unchanged.
                                const cardioTargetSeconds = cardioTimer?.targetSeconds || 0;
                                const cardioDisplaySeconds = cardioRunning && cardioTargetSeconds > 0
                                  ? Math.max(0, cardioTargetSeconds - liveSeconds)
                                  : liveSeconds;
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
                                        style={{ color: cardioRunning ? '#e5e7eb' : 'var(--tint-orange)' }}
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
                                        <span className="cardio-live-time">{formatSecondsToTimeString(cardioDisplaySeconds)}</span>
                                      ) : (
                                        <SetValueField
                                          value={set.time}
                                          // Shows the coach's suggested duration as a hint
                                          // before Start is pressed — otherwise the target
                                          // driving the countdown (see cardioTargetSeconds
                                          // above) was invisible until the client had
                                          // already started the set.
                                          placeholder={set.targetTime || 'mm:ss'}
                                          disabled={set.isCompleted}
                                          active={activeSetKey === timeKey}
                                          onOpen={() => openSetField(timeKey)}
                                          className="cardio-time-input"
                                        />
                                      )}
                                    </div>
                                  </>
                                );
                              })() : (isTimedExercise(ex.name) && exIsBodyweight) ? (() => {
                                // Foot Fires: keeps the Bodyweight/+Add Weight toggle, but the
                                // second column is the shared time control instead of reps.
                                const weightKey = `w-${exIdx}-${sIdx}`;
                                const setBwMode = getSetLogBwMode(ex, set);
                                registerSetField(weightKey, {
                                  value: set.weight,
                                  mode: 'decimal',
                                  label: `${ex.name} · Kg`,
                                  onValue: (v) => handleSetChange(exIdx, sIdx, 'weight', v),
                                });
                                return (
                                  <>
                                    {setBwMode ? (
                                      set.isCompleted ? (
                                        <div className="col-weight bw-static-label">BW</div>
                                      ) : (
                                        <div
                                          className="col-weight bw-static-label bw-static-label--tappable"
                                          role="button"
                                          tabIndex={0}
                                          title="Tap to add weight"
                                          onClick={() => {
                                            // The toggle below doesn't just swap this div's
                                            // content — the whole .hevy-set-row remounts (even a
                                            // reference captured before the toggle goes stale/
                                            // disconnected by the time scrollFieldClearOfPad's
                                            // rAF callback reads it), so getBoundingClientRect
                                            // reports a zero-size, detached rect and the scroll
                                            // math sees "already clear" and never moves — the
                                            // weight field opens hidden behind the pad. Deferring
                                            // to the next frame and re-querying the now-active
                                            // field's button (openSetField already marked it
                                            // active, so it's the only one on the page) picks up
                                            // the fresh node instead of a stale one.
                                            handleToggleSetLogBodyweightMode(exIdx, sIdx);
                                            openSetField(weightKey);
                                            setTimeout(() => {
                                              const freshEl = document.querySelector('.set-value-btn.is-active');
                                              if (freshEl) scrollFieldClearOfPad(freshEl);
                                            }, 60);
                                          }}
                                        >
                                          BW <span className="bw-hint-icon">⇄</span>
                                        </div>
                                      )
                                    ) : (
                                      <div className="col-weight set-input-field bw-input-with-toggle">
                                        <SetValueField
                                          value={set.weight}
                                          placeholder="0"
                                          disabled={set.isCompleted}
                                          active={activeSetKey === weightKey}
                                          isGhost={set.weightFromPrev}
                                          onOpen={() => openSetField(weightKey)}
                                        />
                                        {!set.isCompleted && (
                                          <button
                                            type="button"
                                            className="bw-inline-toggle"
                                            title="Switch back to bodyweight"
                                            onClick={(e) => { e.stopPropagation(); handleToggleSetLogBodyweightMode(exIdx, sIdx); }}
                                          >
                                            ⇄
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    <div className="col-reps" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 8px' }}>
                                      {renderTimeControl()}
                                    </div>
                                  </>
                                );
                              })() : isTimedExercise(ex.name) ? (
                                <>
                                  <div className="col-weight" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 8px' }}>
                                    {renderTimeControl()}
                                  </div>
                                  <div className="col-reps"></div>
                                </>
                              ) : (() => {
                                const weightKey = `w-${exIdx}-${sIdx}`;
                                const repsKey = `r-${exIdx}-${sIdx}`;
                                const setBwMode = exIsBodyweight ? getSetLogBwMode(ex, set) : false;
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
                                  // Farmer Walk etc. store the carried distance in this same
                                  // field (see the col-reps header above, already labeled
                                  // METERS) — the number pad's own title still said "Reps"
                                  // regardless, which read as a mismatch against the visible
                                  // column header.
                                  label: `${ex.name} · ${isLoadedCarryExercise(ex.name) ? 'Meters' : 'Reps'}`,
                                  onValue: (v) => handleSetChange(exIdx, sIdx, 'reps', v),
                                  ...(exIsWarmup || setBwMode ? {} : { onPrev: () => openSetField(weightKey) }),
                                });
                                return (
                                  <>
                                    {exIsWarmup ? (
                                      <div className="col-weight" />
                                    ) : setBwMode ? (
                                      set.isCompleted ? (
                                        <div className="col-weight bw-static-label">BW</div>
                                      ) : (
                                        <div
                                          className="col-weight bw-static-label bw-static-label--tappable"
                                          role="button"
                                          tabIndex={0}
                                          title="Tap to add weight"
                                          onClick={() => {
                                            handleToggleSetLogBodyweightMode(exIdx, sIdx);
                                            openSetField(weightKey);
                                            setTimeout(() => {
                                              const freshEl = document.querySelector('.set-value-btn.is-active');
                                              if (freshEl) scrollFieldClearOfPad(freshEl);
                                            }, 60);
                                          }}
                                        >
                                          BW <span className="bw-hint-icon">⇄</span>
                                        </div>
                                      )
                                    ) : (
                                      <div className={`col-weight set-input-field ${exIsBodyweight ? 'bw-input-with-toggle' : ''}`}>
                                        <SetValueField
                                          value={set.weight}
                                          placeholder="0"
                                          disabled={set.isCompleted}
                                          active={activeSetKey === weightKey}
                                          isGhost={set.weightFromPrev}
                                          onOpen={() => openSetField(weightKey)}
                                        />
                                        {exIsBodyweight && !set.isCompleted && (
                                          <button
                                            type="button"
                                            className="bw-inline-toggle"
                                            title="Switch back to bodyweight"
                                            onClick={(e) => { e.stopPropagation(); handleToggleSetLogBodyweightMode(exIdx, sIdx); }}
                                          >
                                            ⇄
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    <div className="col-reps set-input-field">
                                      <SetValueField
                                        value={set.reps}
                                        placeholder={set.targetReps || '0'}
                                        disabled={set.isCompleted}
                                        active={activeSetKey === repsKey}
                                        isGhost={set.repsFromPrev}
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
                                    onClick={() => beginExit(exIdx, sIdx, () => handleRemoveSet(exIdx, sIdx))}
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
                        onClick={(e) => { handleAddSet(exIdx); animateNewSetRow(e.currentTarget); }}
                      >
                        ➕ Add Set
                      </button>
                      <button
                        type="button"
                        className="btn-start-rest-link"
                        onClick={handleStartRestTimer}
                        title="Start a 60s rest timer"
                      >
                        ⏱️ Start Rest
                      </button>
                    </div>
                  </div>
                  </div>
                  <div className="ex-reorder-compact">
                    <div
                      className={`ex-reorder-compact-row ${logDragIndex === exIdx ? 'ex-reorder-dragging' : ''}`}
                      ref={exIdx === 0 ? measureLogRowHeight : undefined}
                    >
                      <button
                        type="button"
                        className="btn-drag-handle"
                        onPointerDown={startLogExerciseDrag(exIdx)}
                        aria-label={`Reorder ${ex.name}`}
                        style={{ touchAction: 'none' }}
                      ><DragHandleIcon size={16} /></button>
                      <span className="ex-reorder-compact-name">{ex.name}</span>
                    </div>
                  </div>
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

            {/* Reserve room to scroll the list fully clear of the floating
                rest timer (portaled to .app-container — see its own comment —
                so it never shrinks this list's scrollHeight on its own).
                Without this the last exercises and the Save/Discard row stay
                permanently covered by that overlay for as long as a rest is
                running, including while reordering — the exact "workout
                never comes into viewport" complaint. Sized generously above
                the card's own rendered height (~64px bottom offset for the
                client tab bar + the card itself) rather than measured, same
                as this file's other fixed-cap choices (e.g. .ex-reorder-full's
                max-height). */}
            {restTimerActive && (restSecondsRemaining > 0 || restJustFinished) && (
              <div aria-hidden="true" style={{ height: 'calc(210px + env(safe-area-inset-bottom, 0px))' }} />
            )}
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
            <div className="payment-modal-header" style={{ borderBottom: '1px solid rgba(var(--fg-rgb), 0.06)', paddingBottom: '12px' }}>
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

            <div className="summary-actions-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px', borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', paddingTop: '16px' }}>
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

      {/* Shared Hevy-style exercise picker (same component as the coach side) */}
      <ExercisePickerModal
        open={showExerciseDbModal}
        onClose={() => setShowExerciseDbModal(false)}
        addedNames={logExercises.map(le => le.name)}
        creatorMode="client"
        clientUserId={getPlanOwnerId()}
        onAdd={(name) => {
          const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === name.toLowerCase());
          if (alreadyAdded) { triggerToast(`"${name}" is already in your active workout.`); return; }
          let newSet;
          const bodyweight = isBodyweightExercise(name);
          if (isCardioExercise(name)) {
            newSet = { distanceKm: '', time: '', isCompleted: false };
          } else if (isTimedExercise(name) && bodyweight) {
            // Foot Fires: keeps a weight field alongside the time field.
            newSet = { time: '', weight: '0', isCompleted: false };
          } else if (isTimedExercise(name)) {
            newSet = { time: '', isCompleted: false };
          } else if (bodyweight || isWarmupExercise(name)) {
            newSet = { reps: 10, weight: '0', isCompleted: false };
          } else {
            newSet = { reps: 10, weight: '5.0', isCompleted: false };
          }
          // Done before? Start from exactly what the client did last time —
          // every set, ready for a single tap each — instead of one default set.
          const sets = setsFromPreviousExercise(name, findPreviousExerciseSetsIn(sessions, selectedClient, name)) || [newSet];
          setLogExercises(prev => [...prev, bodyweight ? { name, sets, bodyweightMode: true } : { name, sets }]);
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

            <div className="template-save-option-box" style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', paddingTop: '12px', marginTop: '12px', textAlign: 'left', width: '100%' }}>
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
                      background: 'rgba(var(--bg-app-rgb), 0.6)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
                      borderRadius: 'var(--radius-sm)', padding: '9px 11px', color: 'var(--text-main)',
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
        <WorkoutShareCard session={shareCardData} onClose={() => { setShareCardData(null); onWorkoutSaved?.(); }} />
      )}

      {/* Floating Hevy Rest Timer Overlay. No toast and no blink on rest
          start/finish — the card's own label switches to REST OVER.

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
        <div className="rest-timer-floating-card">
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
                  onClick={() => {
                    const newEnd = (restEndAt || Date.now()) - 15000;
                    if (newEnd <= Date.now()) {
                      // Manually dragged to/past zero — close silently, same
                      // as the original cap-at-0 behavior (no alarm/blink;
                      // that's reserved for the countdown finishing on its
                      // own).
                      setRestTimerActive(false);
                      setRestSecondsRemaining(0);
                      setRestEndAt(null);
                    } else {
                      setRestEndAt(newEnd);
                      setRestSecondsRemaining(computeRestSecondsRemaining(newEnd));
                    }
                  }}
                >
                  -15
                </button>
                <button
                  type="button"
                  className="btn-rest-adjust"
                  onClick={() => {
                    const newEnd = (restEndAt || Date.now()) + 15000;
                    setRestEndAt(newEnd);
                    setRestSecondsRemaining(computeRestSecondsRemaining(newEnd));
                  }}
                >
                  +15
                </button>
                <button
                  type="button"
                  className="btn-rest-skip"
                  onClick={() => {
                    setRestTimerActive(false);
                    setRestSecondsRemaining(0);
                    setRestEndAt(null);
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
            <div className="payment-modal-header" style={{ borderBottom: '1px solid rgba(var(--fg-rgb), 0.06)', paddingBottom: '12px' }}>
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

            <div className="summary-actions-row" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px', borderTop: '1px solid rgba(var(--fg-rgb), 0.06)', paddingTop: '16px' }}>
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
