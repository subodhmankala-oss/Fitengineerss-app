import React, { useState, useEffect, useRef } from 'react';
import './WorkoutTracker.css';
import databaseService, { isTrainer } from '../services/databaseService';
import { getLocalDateString, isLocalToday } from '../utils/dateUtils';
import SetTypeMenu, { getSetTypeVisual } from './SetTypeMenu';
import ExercisePickerModal from './ExercisePickerModal';
import { EXERCISE_LIBRARY, isCardioExercise } from '../data/exerciseLibrary';
import { formatDuration, computeElapsedSeconds, computeLiveCalories, formatSecondsToTimeString, maskDigitsToTimeString } from '../utils/liveWorkoutTimer';
import { getYouTubeEmbedUrl, normalizeExerciseForGuide } from '../utils/videoUtils';
import { notifyEvent } from '../utils/pushNotify';


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

const presetExercises = [
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
  const [activeGuideExercise, setActiveGuideExercise] = useState(null);
  const [guideTab, setGuideTab] = useState('summary');
  const [exercisesList, setExercisesList] = useState([]);

  useEffect(() => {
    databaseService.getExerciseLibrary().then(setExercisesList).catch(err => console.error(err));
  }, []);

  const [showUntickedFinishModal, setShowUntickedFinishModal] = useState(false);
  const [showDiscardConfirmModal, setShowDiscardConfirmModal] = useState(false);

  useEffect(() => {
    if (!activeGuideExercise) { setGuideTab('summary'); return; }
    setGuideTab('summary');
  }, [activeGuideExercise]);

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
        if (attemptsLeft <= 0) return [];
        await new Promise(r => setTimeout(r, 3000));
        return loadOwnDbLogs(attemptsLeft - 1);
      }
      return databaseService.getWorkoutLogsForUser(ownKey);
    };
    loadOwnDbLogs().then(logs => {
      const rows = logs || [];
      setDbCompletedSessions(new Set(rows.map(l => l.log_date)).size);

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
          byDate[d].exMap[ex].push(
            l.distance_km != null
              ? { distanceKm: l.distance_km, time: formatSecondsToTimeString(l.cardio_duration_seconds), setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
              : { reps: l.reps, weight: l.weight_kg, setType: l.set_type || null, isWarmup: l.set_type === 'warmup' }
          );
        });
        const dbSessions = Object.values(byDate).map(s => ({
          id: s.id, clientName: s.clientName, date: s.date, planName: s.planName,
          durationSeconds: s.durationSeconds, caloriesBurned: s.caloriesBurned,
          exercises: Object.entries(s.exMap).map(([name, sets]) => ({ name, sets }))
        }));
        // DB is authoritative per date; keep any local-only (unsynced) dates too.
        const dbDates = new Set(dbSessions.map(s => s.date));
        const localOnly = allSessions.filter(s => !dbDates.has(s.date));
        const merged = [...localOnly, ...dbSessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        setSessions(merged);
        setSelectedSessionIndex(merged.length - 1);
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
          return `${set.weight}${getExerciseUnit(exName)} x ${set.reps}`;
        }
      }
    }
    return '—';
  };

  const handleToggleSetCompleted = (exerciseIndex, setIndex) => {
    const now = Date.now();
    // First completed set of an idle session = the client has started working
    // out. Notify their coach once, at that transition. Only for a client
    // logging their own session (not the coach's own Live Log path). Fall back
    // to the cached userId so a not-yet-resolved ownUserId doesn't drop it.
    const togglingSetOn = !logExercises[exerciseIndex]?.sets[setIndex]?.isCompleted;
    const clientId = ownUserId || localStorage.getItem('userId');
    if (workoutTimerStatus === 'idle' && togglingSetOn && clientId && workoutSource !== 'coach') {
      notifyEvent('workout_started', { clientUserId: clientId });
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

    // Sync the completed workout session with the database
    if (newSessions.length > 0) {
      const latestSession = newSessions[newSessions.length - 1];
      databaseService.saveWorkoutSession(latestSession);
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
        const newSet = isCardioExercise(ex.name)
          ? { distanceKm: lastSet?.distanceKm || '', time: '', isCompleted: false, isWarmup }
          : { reps: 10, weight: lastSet?.weight || '2.5', isCompleted: false, isWarmup };
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

    // All sets ticked — now validate workout name
    if (!templateName || !templateName.trim()) {
      const nameInput = document.getElementById('workoutNameInput');
      if (nameInput) {
        nameInput.focus();
        nameInput.setCustomValidity('Please enter a workout name before finishing.');
        nameInput.reportValidity();
        nameInput.setCustomValidity('');
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
              // Cardio sets carry distance/time instead of reps/weight so the
              // save step (and workout_logs.distance_km/cardio_duration_seconds)
              // doesn't collapse them to zero.
              ...(exIsCardio
                ? { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' }
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
    const finalCalories = workoutTimerStartedAt ? computeLiveCalories(activeExercises, workoutTimerStartedAt, workoutPauseIntervals).totalKcal : null;

    const newSession = {
      id: `session-${Date.now()}`,
      clientName: logClient,
      date: logDate,
      exercises: formattedExercises,
      duration: summaryStats?.duration || '00:15',
      durationSeconds: finalDurationSeconds,
      caloriesBurned: finalCalories,
      planName: templateName.trim() || 'Custom Routine',
      source: workoutSource // 'self' for client self-logged, 'coach' for coach-assigned plans
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
            : { reps: s.reps, weight: s.weight })
        })),
        createdBy: 'client'
      };
      databaseService.saveWorkoutPlan(plan).then(() => {
        fetchPlans();
      });
    }

    setIsLoggingWorkout(false);
    setSaveAsTemplate(false);
    setTemplateName('');
    setCustomTemplateName('');
    setWorkoutSource('self'); // Reset to self-logged for next workout
    // Session is finished and saved to workout_logs — the open draft is done.
    if (ownUserId) databaseService.deleteWorkoutDraft(ownUserId);

    setSelectedClient(logClient);
    const newClientSessions = updated.filter(s => s.clientName.toLowerCase() === logClient.toLowerCase());
    setSelectedSessionIndex(newClientSessions.length - 1);

    const finalSetsCount = formattedExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    triggerToast(`🏋️‍♂️ Your Fitengineers Workout Saved! Completed ${summaryStats?.totalSets || finalSetsCount} sets.`);
    
    resetWorkoutTimer();
    setShowFinishSummary(false);
    
    setLogExercises([
      { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
      { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
      { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
    ]);

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
    setTemplateName(template.name);
    setActiveTemplateName(template.name);
    setLogClient(loggedInUser);
    setLogDate(getLocalDateString());
    resetWorkoutTimer();
    setIsLoggingWorkout(true);
    setActiveView('log');
    triggerToast(`Starting ${template.name} — fill in your weights and mark sets done!`);
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
  const liveOwnWorkoutKcal = isLoggingWorkout
    ? computeLiveCalories(logExercises, workoutTimerStartedAt, workoutPauseIntervals).totalKcal
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
          📈 Charts & Progress
        </button>
        <button 
          className={`tab-item-btn ${activeView === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveView('templates')}
        >
          🏋️ Workouts
        </button>
        <button 
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
              <span className="avatar-tag">🏋️‍♂️</span>
              <div className="name-group">
                <span>Client Profile</span>
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
                ) : (
                  <span className="client-display-name" style={{ fontSize: '0.9rem', fontWeight: '800', color: '#fff', marginLeft: '6px' }}>
                    {selectedClient}
                  </span>
                )}
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
                  const matched = exercisesList.find(ex => ex.name.toLowerCase() === selectedExercise.toLowerCase()) ||
                                  presetExercises.find(ex => ex.name.toLowerCase() === selectedExercise.toLowerCase());
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
                      return (
                        <g key={`${d.date}-${idx}`}>
                          <circle 
                            cx={getPointX(d.index)} 
                            cy={getPointY(val)} 
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
                            {sess.exercises.map((ex, exIdx) => (
                              <div key={exIdx} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'8px', padding:'10px 12px' }}>
                                <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#fff', marginBottom:'8px' }}>{ex.name}</div>
                                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                  <thead><tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                                    <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Set</th>
                                    <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Weight</th>
                                    <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Reps</th>
                                    <th style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', padding:'3px 0', textAlign:'left' }}>Vol</th>
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
                                          <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff', fontWeight:600 }}>{set.weight} kg</td>
                                          <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff' }}>{set.reps} reps</td>
                                          <td style={{ padding:'4px 0', fontSize:'0.7rem', color:'var(--text-muted)' }}>{((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)).toFixed(0)} kg</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ))}
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

          {/* Coach's Plan section (only if client has a coach plan) */}
          {clientPlans.filter(p => p.createdBy === 'coach').length > 0 && (
            <div className="wt-section">
              <div className="wt-section-header">
                <span className="wt-section-badge coach">🎯 Your Coach's Plan</span>
                <span className="wt-section-sub">Assigned by your coach</span>
              </div>
              <div className="wt-template-list">
                {clientPlans.filter(p => p.createdBy === 'coach').map(plan => (
                  <div key={plan.id || plan.planName} className="wt-template-card coach-card">
                    <div className="wt-tpl-info">
                      <span className="wt-tpl-icon">📋</span>
                      <div>
                        <span className="wt-tpl-name">{plan.planName}</span>
                        <span className="wt-tpl-meta">
                          {Array.isArray(plan.exercises) ? plan.exercises.length : 0} exercises
                        </span>
                      </div>
                    </div>
                    <div className="wt-tpl-exercises">
                      {(Array.isArray(plan.exercises) ? plan.exercises : []).slice(0, 4).map((ex, i) => (
                        <span key={i} className="wt-ex-pill">{ex.name}</span>
                      ))}
                    </div>
                    <button
                      className="wt-start-btn coach-start"
                      onClick={() => handleStartFromTemplate({
                        name: plan.planName,
                        exercises: (Array.isArray(plan.exercises) ? plan.exercises : []).map(ex => ({
                          ...ex,
                          sets: ex.sets ? (Array.isArray(ex.sets) ? ex.sets.length : ex.sets) : 3,
                          reps: ex.reps || '10'
                        }))
                      })}
                    >
                      ▶ Start Workout
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workout Library — Beginner / Intermediate / Advanced */}
          <div className="wt-section">
            <div className="wt-library-header">
              <div>
                <h3 className="wt-library-title">Workout Library</h3>
                <p className="wt-library-sub">Structured programs for every level</p>
              </div>
            </div>

            <div className="wt-level-tabs">
              {['beginner', 'intermediate', 'advanced'].map(level => (
                <button
                  key={level}
                  className={`wt-level-tab wt-level-tab--${level}${genericLevel === level ? ' active' : ''}`}
                  onClick={() => setGenericLevel(level)}
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
                {levelWorkouts.map(workout => (
                  <div key={workout.id} className={`wt-library-card wt-library-card--${genericLevel}`}>
                    <div className="wt-library-card-header">
                      <span className={`wt-difficulty-badge wt-difficulty-badge--${genericLevel}`}>
                        {genericLevel.charAt(0).toUpperCase() + genericLevel.slice(1)}
                      </span>
                      <span className="wt-exercise-count">
                        {Array.isArray(workout.exercises) ? workout.exercises.length : 0} exercises
                      </span>
                    </div>
                    <h4 className="wt-library-name">{workout.name}</h4>
                    <div className="wt-library-exercises">
                      {(Array.isArray(workout.exercises) ? workout.exercises : []).slice(0, 4).map((ex, i) => (
                        <span key={i} className={`wt-lib-pill wt-lib-pill--${genericLevel}`}>{ex.name}</span>
                      ))}
                      {(Array.isArray(workout.exercises) ? workout.exercises : []).length > 4 && (
                        <span className="wt-lib-pill wt-lib-pill--more">
                          +{workout.exercises.length - 4} more
                        </span>
                      )}
                    </div>
                    <button
                      className={`wt-lib-start-btn wt-lib-start-btn--${genericLevel}`}
                      onClick={() => handleStartFromTemplate({
                        name: workout.name,
                        exercises: (Array.isArray(workout.exercises) ? workout.exercises : [])
                      })}
                    >
                      Start Workout
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick empty start CTA */}
          <div className="wt-blank-cta">
            <button
              className="wt-blank-btn"
              onClick={() => {
                setLogExercises([
                  { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }] }
                ]);
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

      {activeView === 'log' && !isLoggingWorkout && (
        <div className="routines-launcher-wrapper glass-panel" style={{ padding: '20px', width: '100%' }}>
          <div className="launcher-header" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 800 }}>🏋️‍♂️ Start Workout Session</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select a coach plan, a saved template, or start empty.</p>
          </div>
          
          <button 
            type="button" 
            className="btn-start-empty-workout"
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px dashed rgba(16, 185, 129, 0.3)',
              color: 'var(--primary-accent-light)',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              marginBottom: '24px',
              transition: 'all 0.2s ease'
            }}
            onClick={() => {
              setLogClient(selectedClient);
              setLogDate(getLocalDateString());
              setLogExercises([
                { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }] }
              ]);
              setTemplateName('');
              setIsLoggingWorkout(true);
              resetWorkoutTimer();
            }}
          >
            ➕ Start Empty Workout
          </button>

          {/* Coach Assigned Plans — only relevant once a coach is actually assigned */}
          {(hasCoachAssigned || isTrainer(localStorage.getItem('userEmail'))) && (
            <div className="routines-section" style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>📋 Your Coach's Plan</h4>
              {loadingPlans ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading coach plans...</p>
              ) : clientPlans.filter(p => p.createdBy === 'coach').length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No workout plans assigned by your coach yet.</p>
              ) : (
                <div className="routines-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {clientPlans.filter(p => p.createdBy === 'coach').map(plan => (
                    <div key={plan.id} className="routine-card glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                      <div className="routine-info" style={{ flex: 1, paddingRight: '12px' }}>
                        <strong className="routine-title" style={{ display: 'block', fontSize: '0.88rem', color: '#fff' }}>{plan.planName}</strong>
                        <div className="routine-ex-summary" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {plan.exercises.map(ex => `${ex.name} (${ex.sets?.length || 0}s)`).join(', ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-start-routine"
                        style={{
                          padding: '8px 14px',
                          background: 'var(--primary-accent-light)',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setLogClient(selectedClient);
                          setLogDate(getLocalDateString());
                          setLogExercises(plan.exercises.map(ex => ({
                            name: ex.name,
                            sets: ex.sets.map(s => isCardioExercise(ex.name)
                              ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
                              : { reps: String(s.reps), weight: String(s.weight), isCompleted: false })
                          })));
                          setTemplateName(plan.planName);
                          setWorkoutSource('coach');
                          setIsLoggingWorkout(true);
                          resetWorkoutTimer();
                        }}
                      >
                        Start Routine
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My Saved Templates */}
          <div className="routines-section">
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>👤 My Saved Templates</h4>
            {loadingPlans ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading templates...</p>
            ) : clientPlans.filter(p => p.createdBy === 'client').length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No custom templates saved yet. Log a workout and check "Save as template" to create one.</p>
            ) : (
              <div className="routines-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {clientPlans.filter(p => p.createdBy === 'client').map(plan => (
                  <div key={plan.id} className="routine-card glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <div className="routine-info" style={{ flex: 1, paddingRight: '12px' }}>
                      <strong className="routine-title" style={{ display: 'block', fontSize: '0.88rem', color: '#fff' }}>{plan.planName}</strong>
                      <div className="routine-ex-summary" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        {plan.exercises.map(ex => `${ex.name} (${ex.sets?.length || 0}s)`).join(', ')}
                      </div>
                    </div>
                    <div className="routine-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-start-routine"
                        style={{
                          padding: '8px 14px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-color)',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setLogClient(selectedClient);
                          setLogDate(getLocalDateString());
                          setLogExercises(plan.exercises.map(ex => ({
                            name: ex.name,
                            sets: ex.sets.map(s => isCardioExercise(ex.name)
                              ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
                              : { reps: String(s.reps), weight: String(s.weight), isCompleted: false })
                          })));
                          setTemplateName(plan.planName);
                          setWorkoutSource('self');
                          setIsLoggingWorkout(true);
                          resetWorkoutTimer();
                        }}
                      >
                        Start
                      </button>
                      <button 
                        type="button" 
                        className="btn-delete-routine-sm" 
                        style={{
                          padding: '8px 10px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this template?')) {
                            await databaseService.deleteWorkoutPlan(plan.id, getPlanOwnerId());
                            fetchPlans();
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'log' && isLoggingWorkout && (
        <form onSubmit={handleFinishWorkoutPress} className="coach-log-form-wrapper glass-panel hevy-logger-wrapper">
          <div className="form-header form-header-with-date">
            <div>
              <h3>🏋️ Today's Workout</h3>
              <p>Enter your reps and weights, then tick each set as you complete it.</p>
            </div>
            <div className="input-group session-date-inline">
              <label>Session Date</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
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
                <button
                  type="button"
                  className="btn-timer-toggle"
                  onClick={workoutTimerStatus === 'running' ? handlePauseWorkoutTimer : handleResumeWorkoutTimer}
                >
                  {workoutTimerStatus === 'running' ? '⏸️ Pause' : '▶️ Resume'}
                </button>
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

          <div className="form-double-col">
            <div className="input-group">
              <label>Workout Name</label>
              <input
                id="workoutNameInput"
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Push Day, Leg Day, Custom Session…"
              />
            </div>
            {clientPlans.length > 0 && (
              <div className="input-group">
                <label>Load from Existing Plan</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const plan = clientPlans.find(p => p.id === e.target.value);
                    if (plan) {
                      setTemplateName(plan.planName);
                      setWorkoutSource(plan.createdBy === 'coach' ? 'coach' : 'self');
                      setLogExercises(plan.exercises.map(ex => ({
                        name: ex.name,
                        sets: ex.sets.map(s => isCardioExercise(ex.name)
                          ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
                          : { reps: String(s.reps), weight: String(s.weight), isCompleted: false })
                      })));
                      triggerToast(`📋 Loaded exercises from "${plan.planName}"!`);
                    }
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>-- Select plan template --</option>
                  {clientPlans.map(p => (
                    <option key={p.id} value={p.id}>{p.planName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="exercises-form-section">
            <div className="section-title-row" style={{ position: 'relative' }}>
              <h4>Workout Lift Logs</h4>
            </div>

            <div className="exercises-input-list">
              {logExercises.map((ex, exIdx) => {
                const unit = getExerciseUnit(ex.name);
                const exIsCardio = isCardioExercise(ex.name);
                return (
                  <div key={exIdx} className="form-exercise-card hevy-exercise-card">
                    <div className="ex-card-header">
                      <div className="ex-card-title-group">
                        <span className="ex-indicator-dot"></span>
                        <h5>{ex.name}</h5>
                        <button
                          type="button"
                          className="btn-form-guide-sm"
                          onClick={() => {
                            const matched = exercisesList.find(pe => pe.name.toLowerCase() === ex.name.toLowerCase()) ||
                                            allExerciseOptions.find(pe => pe.name.toLowerCase() === ex.name.toLowerCase());
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
                      >
                        ✕ Remove
                      </button>
                    </div>

                    <div className="hevy-sets-table">
                      <div className="hevy-table-header">
                        <span className="col-set">SET</span>
                        <span className="col-prev">PREVIOUS</span>
                        {exIsCardio ? (
                          <>
                            <span className="col-weight">KM</span>
                            <span className="col-reps">TIME</span>
                          </>
                        ) : (
                          <>
                            <span className="col-weight">WEIGHT ({unit})</span>
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
                              className={`hevy-set-row ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}
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
                              {exIsCardio ? (
                                <>
                                  <div className="col-weight set-input-field">
                                    <input
                                      type="tel"
                                      inputMode="tel"
                                      value={set.distanceKm}
                                      onChange={(e) => handleSetChange(exIdx, sIdx, 'distanceKm', e.target.value)}
                                      required
                                      placeholder="0"
                                      disabled={set.isCompleted}
                                    />
                                  </div>
                                  <div className="col-reps set-input-field">
                                    <input
                                      type="tel"
                                      inputMode="tel"
                                      value={set.time}
                                      onChange={(e) => handleSetChange(exIdx, sIdx, 'time', maskDigitsToTimeString(e.target.value))}
                                      required
                                      placeholder="mm:ss"
                                      disabled={set.isCompleted}
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="col-weight set-input-field">
                                    <input
                                      type="text"
                                      value={set.weight}
                                      onChange={(e) => handleSetChange(exIdx, sIdx, 'weight', e.target.value)}
                                      required
                                      placeholder="0"
                                      disabled={set.isCompleted}
                                    />
                                  </div>
                                  <div className="col-reps set-input-field">
                                    <input
                                      type="number"
                                      value={set.reps}
                                      onChange={(e) => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                                      required
                                      min="1"
                                      placeholder={set.targetReps || '0'}
                                      disabled={set.isCompleted}
                                    />
                                  </div>
                                </>
                              )}
                              <div className="col-check set-actions-field">
                                <button
                                  type="button"
                                  className={`btn-hevy-check ${set.isCompleted ? 'completed' : ''}`}
                                  onClick={() => handleToggleSetCompleted(exIdx, sIdx)}
                                  title="Toggle Complete"
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
                                    🗑️
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
                className="btn-save-workout-session"
                style={{
                  width: 'auto', flex: '0 0 auto', background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                  padding: '0 18px'
                }}
                onClick={() => setShowDiscardConfirmModal(true)}
                title="Discard this workout session"
              >
                🗑️
              </button>
              <button type="submit" className="btn-save-workout-session" style={{ width: 'auto', flex: 1 }}>
                💾 Save Workout Session
              </button>
            </div>
          </div>
        </form>
      )}
      </div>

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
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                }}
                onClick={() => {
                  handleDiscardWorkout();
                  setShowDiscardConfirmModal(false);
                }}
              >
                🗑️ Discard Session
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
          const newSet = isCardioExercise(name)
            ? { distanceKm: '', time: '', isCompleted: false }
            : { reps: 10, weight: '5.0', isCompleted: false };
          setLogExercises(prev => [...prev, { name, sets: [newSet] }]);
          triggerToast(`Added ${name} to active workout!`);
        }}
        onRemove={(name) => {
          setLogExercises(prev => prev.filter(le => le.name.toLowerCase() !== name.toLowerCase()));
          triggerToast(`Removed ${name}.`);
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

      {/* Floating Hevy Rest Timer Overlay. Both the rest-started moment and the
          rest-finished moment used to interrupt with a toast; now the card
          itself blinks (key={restPulseKey} forces a remount so the CSS blink
          animation replays every time, since re-applying the same class
          wouldn't restart an animation already in progress). */}
      {restTimerActive && (restSecondsRemaining > 0 || restJustFinished) && (
        <div
          key={restPulseKey}
          className={`rest-timer-floating-card ${restJustFinished ? 'rest-timer-pulse-finish' : 'rest-timer-pulse-start'}`}
        >
          <div className="rest-timer-content">
            <span className="rest-icon">{restJustFinished ? '✅' : '⏱️'}</span>
            <div className="rest-timer-info">
              {restJustFinished ? (
                <>
                  <span>REST OVER</span>
                  <strong style={{ fontSize: '0.9rem' }}>Time for your next set!</strong>
                </>
              ) : (
                <>
                  <span>REST TIMER</span>
                  <strong>{restSecondsRemaining}s</strong>
                </>
              )}
            </div>
          </div>
          {!restJustFinished && (
            <div className="rest-timer-actions">
              <button
                type="button"
                className="btn-rest-adjust"
                onClick={() => setRestSecondsRemaining(prev => prev + 30)}
              >
                +30s
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
          )}
        </div>
      )}

      {/* Form Guide — Hevy-style bottom sheet */}
      {activeGuideExercise && (
        <div className="guide-sheet-backdrop" onClick={() => setActiveGuideExercise(null)}>
          <div className="guide-sheet animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* drag handle */}
            <div className="guide-sheet-handle" />

            {/* exercise video */}
            <div className="guide-image-section">
              {activeGuideExercise.videoFile ? (
                getYouTubeEmbedUrl(activeGuideExercise.videoFile) ? (
                  <iframe
                    key={activeGuideExercise.videoFile}
                    src={getYouTubeEmbedUrl(activeGuideExercise.videoFile)}
                    title="Exercise Form Guide"
                    frameBorder="0"
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
                  />
                ) : (
                  <video
                    key={activeGuideExercise.videoFile}
                    src={activeGuideExercise.videoFile}
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )
              ) : (
                <div className="guide-image-placeholder">
                  <span className="guide-image-icon">🏋️</span>
                </div>
              )}
              {/* close button over video */}
              <button type="button" className="guide-sheet-close" onClick={() => setActiveGuideExercise(null)}>✕</button>
            </div>

            {/* tabs */}
            <div className="guide-tab-bar">
              {['summary', 'howto'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`guide-tab-btn ${guideTab === tab ? 'guide-tab-btn--active' : ''}`}
                  onClick={() => setGuideTab(tab)}
                >
                  {tab === 'summary' ? 'Summary' : 'How to'}
                </button>
              ))}
            </div>

            {/* tab content */}
            <div className="guide-tab-content">
              {guideTab === 'summary' && (
                <div className="guide-summary">
                  <h2 className="guide-ex-name">{activeGuideExercise.name}</h2>
                  <div className="guide-muscle-row">
                    <span className="guide-muscle-label">Primary:</span>
                    <span className="guide-muscle-value">{activeGuideExercise.primary || activeGuideExercise.category}</span>
                  </div>
                  {activeGuideExercise.secondary && (
                    <div className="guide-muscle-row">
                      <span className="guide-muscle-label">Secondary:</span>
                      <span className="guide-muscle-value guide-muscle-secondary">{activeGuideExercise.secondary}</span>
                    </div>
                  )}
                  <div className="guide-log-tip">
                    <span className="guide-log-tip-icon">💡</span>
                    <span>Focus on mind-muscle connection — feel the primary muscle work each rep.</span>
                  </div>
                </div>
              )}
              {guideTab === 'howto' && (
                <div className="guide-howto">
                  <div className="guide-howto-step">
                    <span className="guide-step-num">1</span>
                    <div>
                      <div className="guide-step-label">Setup</div>
                      <div className="guide-step-text">{activeGuideExercise.guide?.setup}</div>
                    </div>
                  </div>
                  <div className="guide-howto-step">
                    <span className="guide-step-num">2</span>
                    <div>
                      <div className="guide-step-label">Execution</div>
                      <div className="guide-step-text">{activeGuideExercise.guide?.execution}</div>
                    </div>
                  </div>
                  <div className="guide-howto-step">
                    <span className="guide-step-num">3</span>
                    <div>
                      <div className="guide-step-label">Coach's Tip</div>
                      <div className="guide-step-text">{activeGuideExercise.guide?.tip}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                }}
                onClick={() => {
                  handleDiscardWorkout();
                  setShowUntickedFinishModal(false);
                }}
              >
                🗑️ Discard Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WorkoutTracker;
