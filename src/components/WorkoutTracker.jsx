import React, { useState, useEffect } from 'react';
import './WorkoutTracker.css';
import databaseService, { isTrainer } from '../services/databaseService';


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
    videoId: 'qEwKCR5JCog',
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
    videoId: 'P5k8K_vX6-s',
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
    videoId: '6TSP1TRMUzs',
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
    videoId: '6f9GfW_nCWE',
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
    videoId: 'ysUTNll8JQ8',
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
    videoId: '8iPEnn-ltC8',
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
    videoId: 'kY73o1o2s88',
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
    videoId: 'b3s_0kP0s1c',
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
    videoId: '1fCg_9W7ZqE',
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
    videoId: 'YyvSfVjQeL0',
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
    videoId: '6_4Q1W47Y5s',
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
    videoId: '8XLxfXROrTo',
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
    videoId: 'p1f8_142Fys',
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
    videoId: 'b8P27J067F8',
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
    videoId: '3VcKaXtouo0',
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
    videoId: 'G-F-R_3R4pE',
    guide: {
      target: 'Latissimus Dorsi (Lats), Teres Major, Rhomboids, Biceps',
      setup: 'Hang from a bar with a wide overhand grip. Depress and retract your scapula (pull shoulders down).',
      execution: 'Pull your body upward by driving elbows down until your chest approaches the bar. Lower with control.',
      tip: 'Avoid kicking or kipping with your legs. Focus on a full range of motion from dead hang to chin over bar.'
    }
  }
];

const WorkoutTracker = () => {
  const loggedInUser = localStorage.getItem('userName') || 'Warrior';
  const [activeView, setActiveView] = useState('analytics'); // 'analytics', 'log', or 'programs'
  const [sessions, setSessions] = useState([]);
  const [clientProfiles, setClientProfiles] = useState([]);
  const [selectedClient, setSelectedClient] = useState(loggedInUser);
  const [selectedExercise, setSelectedExercise] = useState('Shoulders Press');

  // Custom templates and plans state
  const [isLoggingWorkout, setIsLoggingWorkout] = useState(false);
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Generic (non-coach) starter workout templates — always available, regardless of coach_id.
  const [defaultTemplates, setDefaultTemplates] = useState([]);
  const [loadingDefaultTemplates, setLoadingDefaultTemplates] = useState(false);
  const [selectedDefaultTemplateId, setSelectedDefaultTemplateId] = useState('');
  // Guards against legacy sessions where localStorage.setItem('userCoachId', null) was
  // called directly, which stores the literal (truthy) string "null".
  const storedCoachId = localStorage.getItem('userCoachId');
  const hasCoachAssigned = !!(storedCoachId && storedCoachId !== 'null' && storedCoachId !== 'undefined');

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
  }, [selectedClient]);
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

  // Hevy Workout Tracker States
  const [workoutActiveSeconds, setWorkoutActiveSeconds] = useState(0);
  const [workoutTimerRunning, setWorkoutTimerRunning] = useState(false);
  const [showExerciseDbModal, setShowExerciseDbModal] = useState(false);
  const [showAddExerciseDropdown, setShowAddExerciseDropdown] = useState(false);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState('');
  const [showFinishSummary, setShowFinishSummary] = useState(false);
  const [exerciseFilterTag, setExerciseFilterTag] = useState('All');
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [summaryStats, setSummaryStats] = useState(null);
  const [activeGuideExercise, setActiveGuideExercise] = useState(null);
  const [showUntickedFinishModal, setShowUntickedFinishModal] = useState(false);

  // Coach Log Form States
  const [logClient, setLogClient] = useState(loggedInUser);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logExercises, setLogExercises] = useState([
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
    fetchPlans();
  }, []);

  // Hevy stopwatch & rest timer side effects
  useEffect(() => {
    let interval = null;
    if (activeView === 'log' && workoutTimerRunning) {
      interval = setInterval(() => {
        setWorkoutActiveSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [activeView, workoutTimerRunning]);

  useEffect(() => {
    if (activeView === 'log') {
      setWorkoutTimerRunning(true);
    }
  }, [activeView]);

  useEffect(() => {
    let interval = null;
    if (restTimerActive && restSecondsRemaining > 0) {
      interval = setInterval(() => {
        setRestSecondsRemaining(prev => {
          if (prev <= 1) {
            setRestTimerActive(false);
            triggerToast('⏱️ Rest over! Time for your next set.');
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
          return `${set.weight}${getExerciseUnit(exName)} x ${set.reps}`;
        }
      }
    }
    return '—';
  };

  const handleToggleSetCompleted = (exerciseIndex, setIndex) => {
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
                triggerToast('⏱️ Rest Timer started (60 seconds). Great set!');
              }
              return { ...s, isCompleted: nextState };
            }
            return s;
          })
        };
      }
      return ex;
    }));
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
  const activeProfile = clientProfiles.find(
    p => p.clientName.toLowerCase() === selectedClient.toLowerCase()
  ) || { clientName: selectedClient, activeProgram: 'Custom Program', totalSessions: 12 };

  // Sessions count calculations
  const clientSessions = sessions
    .filter(s => s.clientName.toLowerCase() === selectedClient.toLowerCase())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const completedSessionsCount = clientSessions.length;
  const remainingSessionsCount = Math.max(0, activeProfile.totalSessions - completedSessionsCount);
  const showPaymentAlert = remainingSessionsCount <= 3;

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
  const handleAddSet = (exerciseIndex) => {
    setLogExercises(prev => prev.map((ex, idx) => {
      if (idx === exerciseIndex) {
        return {
          ...ex,
          sets: [...ex.sets, { reps: 10, weight: ex.sets[ex.sets.length - 1]?.weight || '2.5', isCompleted: false }]
        };
      }
      return ex;
    }));
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
      activeExercises = logExercises.map(ex => ({
        ...ex,
        sets: ex.sets.map(s => ({ ...s, isCompleted: true }))
      }));
    }

    const formattedExercises = activeExercises
      .map(ex => ({
        name: ex.name,
        sets: ex.sets
          .filter(s => s.isCompleted)
          .map(s => ({
            reps: parseInt(s.reps) || 0,
            weight: parseFloat(s.weight) || 0
          }))
      }))
      .filter(ex => ex.sets.length > 0);

    const newSession = {
      id: `session-${Date.now()}`,
      clientName: logClient,
      date: logDate,
      exercises: formattedExercises,
      duration: summaryStats?.duration || '00:15',
      planName: templateName.trim() || 'Custom Routine'
    };

    const updated = [...sessions, newSession];
    saveSessionsToLocal(updated);
    
    // Save as client routine template if checked
    if (saveAsTemplate && formattedExercises.length > 0) {
      const plan = {
        userId: getPlanOwnerId(),
        planName: templateName.trim() || `Custom Routine - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        exercises: formattedExercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight }))
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
    
    setSelectedClient(logClient);
    const newClientSessions = updated.filter(s => s.clientName.toLowerCase() === logClient.toLowerCase());
    setSelectedSessionIndex(newClientSessions.length - 1);

    const finalSetsCount = formattedExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    triggerToast(`🏋️‍♂️ Hevy Workout Saved! Completed ${summaryStats?.totalSets || finalSetsCount} sets.`);
    
    setWorkoutActiveSeconds(0);
    setWorkoutTimerRunning(false);
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
          className={`tab-item-btn ${activeView === 'log' ? 'active' : ''}`}
          onClick={() => setActiveView('log')}
        >
          📝 Count your Reps & Weights
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

            {/* Session counters breakdown */}
            <div className="sessions-accounting-split">
              <div className="acc-item">
                <span className="acc-lbl">Program Name</span>
                <strong>{activeProfile.activeProgram}</strong>
              </div>
              <div className="acc-item">
                <span className="acc-lbl">Completed</span>
                <strong className="text-emerald">{completedSessionsCount} / {activeProfile.totalSessions}</strong>
              </div>
              <div className="acc-item">
                <span className="acc-lbl">Remaining</span>
                <strong className={remainingSessionsCount <= 3 ? 'text-warn' : 'text-blue'}>
                  {remainingSessionsCount} left
                </strong>
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

              <button 
                type="button"
                className="video-guide-btn"
                onClick={() => {
                  const matched = presetExercises.find(ex => ex.name.toLowerCase() === selectedExercise.toLowerCase());
                  if (matched) {
                    setActiveGuideExercise(matched);
                  } else {
                    setActiveGuideExercise({
                      name: selectedExercise,
                      category: 'Custom',
                      videoId: 'P5k8K_vX6-s',
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
              const todayStr = new Date().toISOString().split('T')[0];
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
                  const isToday = sess.date === new Date().toISOString().split('T')[0];
                  const isCoachLogged = sess.loggedByCoach;
                  const planName = sess.planName || (isCoachLogged ? 'Coach Session' : 'Workout Session');

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
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'#fff', marginTop:'2px' }}>{sess.duration || '—'}</div>
                            </div>
                            <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>🏋️ Lifted</div>
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'var(--primary-accent-light)', marginTop:'2px' }}>{totalVol.toLocaleString('en-IN',{maximumFractionDigits:0})} kg</div>
                            </div>
                            <div style={{ flex:1, minWidth:'70px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'8px 10px', textAlign:'center' }}>
                              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase' }}>✓ Sets</div>
                              <div style={{ fontSize:'0.88rem', fontWeight:800, color:'#60a5fa', marginTop:'2px' }}>{totalSets}</div>
                            </div>
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
                                    {ex.sets.map((set, sIdx) => (
                                      <tr key={sIdx} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding:'4px 0', fontSize:'0.72rem' }}>
                                          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:'17px', height:'17px', borderRadius:'50%', background:'rgba(255,255,255,0.08)', fontSize:'0.62rem', fontWeight:800, color:'#fff' }}>{sIdx+1}</span>
                                        </td>
                                        <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff', fontWeight:600 }}>{set.weight} kg</td>
                                        <td style={{ padding:'4px 0', fontSize:'0.78rem', color:'#fff' }}>{set.reps} reps</td>
                                        <td style={{ padding:'4px 0', fontSize:'0.7rem', color:'var(--text-muted)' }}>{((parseFloat(set.weight)||0)*(parseInt(set.reps)||0)).toFixed(0)} kg</td>
                                      </tr>
                                    ))}
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
              setLogDate(new Date().toISOString().split('T')[0]);
              setLogExercises([
                { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }] }
              ]);
              setTemplateName('');
              setIsLoggingWorkout(true);
              setWorkoutActiveSeconds(0);
              setWorkoutTimerRunning(true);
            }}
          >
            ➕ Start Empty Workout
          </button>

          {/* Generic Workouts — baseline templates every client has, regardless of coach_id */}
          <div className="routines-section" style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🏠 Generic Workouts</h4>
            {loadingDefaultTemplates ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading starter templates...</p>
            ) : defaultTemplates.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No starter templates available.</p>
            ) : (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <select
                  className="exercise-select-dropdown"
                  style={{ flex: 1 }}
                  value={selectedDefaultTemplateId}
                  onChange={(e) => setSelectedDefaultTemplateId(e.target.value)}
                >
                  {defaultTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => {
                    const template = defaultTemplates.find(t => t.id === selectedDefaultTemplateId);
                    if (!template) return;
                    // "8-12" is a target range for display, not a loggable rep count — seed the
                    // numeric reps input with the low end so it's a valid starting number to log against.
                    const startingReps = (ex) => {
                      const match = String(ex.reps || '10').match(/\d+/);
                      return match ? match[0] : '10';
                    };
                    setLogClient(selectedClient);
                    setLogDate(new Date().toISOString().split('T')[0]);
                    setLogExercises(template.exercises.map(ex => ({
                      name: ex.name,
                      sets: Array.from({ length: ex.sets || 3 }, () => ({ reps: startingReps(ex), weight: '', isCompleted: false }))
                    })));
                    setTemplateName(template.name);
                    setIsLoggingWorkout(true);
                    setWorkoutActiveSeconds(0);
                    setWorkoutTimerRunning(true);
                  }}
                >
                  Start Workout
                </button>
              </div>
            )}
          </div>

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
                          setLogDate(new Date().toISOString().split('T')[0]);
                          setLogExercises(plan.exercises.map(ex => ({
                            name: ex.name,
                            sets: ex.sets.map(s => ({ reps: String(s.reps), weight: String(s.weight), isCompleted: false }))
                          })));
                          setTemplateName(plan.planName);
                          setIsLoggingWorkout(true);
                          setWorkoutActiveSeconds(0);
                          setWorkoutTimerRunning(true);
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
                          setLogDate(new Date().toISOString().split('T')[0]);
                          setLogExercises(plan.exercises.map(ex => ({
                            name: ex.name,
                            sets: ex.sets.map(s => ({ reps: String(s.reps), weight: String(s.weight), isCompleted: false }))
                          })));
                          setTemplateName(plan.planName);
                          setIsLoggingWorkout(true);
                          setWorkoutActiveSeconds(0);
                          setWorkoutTimerRunning(true);
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
          {/* Hevy Stopwatch Header */}
          <div className="hevy-stopwatch-banner">
            <div className="timer-display">
              <span className="stopwatch-icon">⏱️</span>
              <div className="timer-numbers">
                <strong>{formatStopwatchTime(workoutActiveSeconds)}</strong>
                <span className="active-badge">{workoutTimerRunning ? '● Active Tracker' : 'Paused'}</span>
              </div>
            </div>
            <div className="timer-controls">
              <button 
                type="button" 
                className="btn-timer-toggle"
                onClick={() => setWorkoutTimerRunning(!workoutTimerRunning)}
              >
                {workoutTimerRunning ? '⏸️ Pause' : '▶️ Resume'}
              </button>
              <button 
                type="submit" 
                className="btn-hevy-finish"
              >
                ✓ Finish
              </button>
            </div>
          </div>

          <div className="form-header">
            <h3>📝 Log New Workout Session</h3>
            <p>Input reps, weights, and sets directly from client notebooks.</p>
          </div>

          {/* Quick Package details for coach */}
          <div className="coach-billing-status-box">
            <div className="status-meta">
              <strong>Billing Tracker ({selectedClient})</strong>
              <p>Completed: {completedSessionsCount} / {activeProfile.totalSessions} sessions</p>
            </div>
            <button type="button" className="btn-renew-action-sm" onClick={renewSessionPackage}>
              💳 Renew Package (+12 Sessions)
            </button>
          </div>

          <div className="form-double-col">
            <div className="input-group">
              <label>Client Name</label>
              <input 
                type="text" 
                value={logClient} 
                onChange={(e) => setLogClient(e.target.value)} 
                required 
                placeholder={`e.g. ${loggedInUser}`}
              />
            </div>
            <div className="input-group">
              <label>Session Date</label>
              <input 
                type="date" 
                value={logDate} 
                onChange={(e) => setLogDate(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div className="exercises-form-section">
            <div className="section-title-row" style={{ position: 'relative' }}>
              <h4>Workout Lift Logs</h4>
              <div className="add-exercise-dropdown-wrapper">
                <button 
                  type="button" 
                  className="btn-secondary-sm btn-add-hevy-ex" 
                  onClick={() => setShowAddExerciseDropdown(!showAddExerciseDropdown)}
                >
                  ➕ Add Exercise
                </button>
                
                {showAddExerciseDropdown && (
                  <div className="add-exercise-dropdown-menu animate-scale-in">
                    <div className="dropdown-search-wrapper">
                      <input 
                        type="text" 
                        placeholder="Search exercises..." 
                        value={dropdownSearchQuery}
                        onChange={(e) => setDropdownSearchQuery(e.target.value)}
                        className="dropdown-search-input"
                        autoFocus
                      />
                    </div>
                    <div className="dropdown-presets-list">
                      {dropdownSearchQuery.trim() && (
                        <div 
                          className="dropdown-preset-item"
                          style={{
                            border: '1px dashed rgba(16, 185, 129, 0.4)',
                            background: 'rgba(16, 185, 129, 0.03)',
                            marginBottom: '4px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            const name = dropdownSearchQuery.trim();
                            const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === name.toLowerCase());
                            if (!alreadyAdded) {
                              setLogExercises(prev => [...prev, { name, sets: [{ reps: 10, weight: '5.0', isCompleted: false }] }]);
                              triggerToast(`Added custom exercise "${name}"!`);
                              setShowAddExerciseDropdown(false);
                              setDropdownSearchQuery('');
                            } else {
                              triggerToast(`"${name}" is already in your active workout.`);
                            }
                          }}
                        >
                          <div className="dropdown-preset-info">
                            <strong style={{ color: 'var(--primary-accent-light)' }}>Create "{dropdownSearchQuery}"</strong>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Custom Exercise</span>
                          </div>
                          <span style={{ fontSize: '0.8rem' }}>➕</span>
                        </div>
                      )}
                      
                      {(() => {
                        const filtered = presetExercises.filter(ex => 
                          ex.name.toLowerCase().includes(dropdownSearchQuery.toLowerCase())
                        );
                        
                        if (filtered.length === 0 && !dropdownSearchQuery.trim()) {
                          return (
                            <span style={{ padding: '12', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                              No exercises found.
                            </span>
                          );
                        }
                        
                        return filtered.map(ex => {
                          const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === ex.name.toLowerCase());
                          return (
                            <div 
                              key={ex.name} 
                              className="dropdown-preset-item"
                              onClick={() => {
                                if (!alreadyAdded) {
                                  setLogExercises(prev => [...prev, { name: ex.name, sets: [{ reps: 10, weight: '5.0', isCompleted: false }] }]);
                                  triggerToast(`Added ${ex.name} to active workout!`);
                                  setShowAddExerciseDropdown(false);
                                  setDropdownSearchQuery('');
                                } else {
                                  triggerToast(`${ex.name} is already in your workout log.`);
                                }
                              }}
                              style={{
                                opacity: alreadyAdded ? 0.6 : 1,
                                cursor: alreadyAdded ? 'default' : 'pointer'
                              }}
                            >
                              <div className="dropdown-preset-info">
                                <strong>{ex.name}</strong>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ex.category}</span>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: alreadyAdded ? 'var(--primary-accent-light)' : 'var(--text-muted)' }}>
                                {alreadyAdded ? '✓' : '➕'}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="exercises-input-list">
              {logExercises.map((ex, exIdx) => {
                const unit = getExerciseUnit(ex.name);
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
                            const matched = presetExercises.find(pe => pe.name.toLowerCase() === ex.name.toLowerCase());
                            if (matched) {
                              setActiveGuideExercise(matched);
                            } else {
                              setActiveGuideExercise({
                                name: ex.name,
                                category: 'Custom',
                                videoId: 'P5k8K_vX6-s',
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
                        <span className="col-weight">WEIGHT ({unit})</span>
                        <span className="col-reps">REPS</span>
                        <span className="col-check">✓</span>
                      </div>
                      <div className="hevy-table-body">
                        {ex.sets.map((set, sIdx) => {
                          const prevStats = getPreviousSessionSet(ex.name, sIdx);
                          return (
                            <div 
                              key={sIdx} 
                              className={`hevy-set-row ${set.isCompleted ? 'set-row-completed' : ''}`}
                            >
                              <span className="col-set set-num-lbl">{sIdx + 1}</span>
                              <span className="col-prev set-prev-lbl">{prevStats}</span>
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
                                  placeholder="0"
                                  disabled={set.isCompleted}
                                />
                              </div>
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
          </div>
        </form>
      )}
      </div>

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

      {/* Hevy-Style Exercise Selection Modal */}
      {showExerciseDbModal && (
        <div className="payment-gateway-backdrop exercise-modal-backdrop">
          <div className="payment-gateway-modal exercise-modal-card animate-scale-in">
            <div className="payment-modal-header">
              <div className="modal-title-box">
                <span className="secure-badge">🏋️‍♂️ EXERCISE PRESETS</span>
                <h3>Add Exercise</h3>
              </div>
              <button 
                type="button" 
                className="btn-close-modal" 
                onClick={() => setShowExerciseDbModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="payment-input-group exercise-search-box">
              <input 
                type="text" 
                placeholder="Search exercise database..." 
                value={exerciseSearchQuery}
                onChange={(e) => setExerciseSearchQuery(e.target.value)}
                className="exercise-search-input"
              />
            </div>

            <div className="exercise-filter-tags">
              {['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`filter-tag-btn ${exerciseFilterTag === tag ? 'active' : ''}`}
                  onClick={() => setExerciseFilterTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="exercise-presets-list">
              {exerciseSearchQuery.trim() && (
                <div 
                  className="exercise-preset-item custom-exercise-add-row"
                  style={{
                    border: '1px dashed rgba(16, 185, 129, 0.4)',
                    background: 'rgba(16, 185, 129, 0.03)',
                    marginBottom: '8px',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px'
                  }}
                >
                  <div className="preset-info">
                    <strong style={{ color: 'var(--primary-accent-light)' }}>Create "{exerciseSearchQuery}"</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Custom Exercise</span>
                  </div>
                  <button
                    type="button"
                    className="btn-add-preset-action"
                    style={{ 
                      background: 'var(--primary-accent-light)', 
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      const name = exerciseSearchQuery.trim();
                      const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === name.toLowerCase());
                      if (!alreadyAdded) {
                        setLogExercises(prev => [...prev, { name, sets: [{ reps: 10, weight: '5.0', isCompleted: false }] }]);
                        triggerToast(`Added custom exercise "${name}"!`);
                        setShowExerciseDbModal(false);
                        setExerciseSearchQuery('');
                      } else {
                        triggerToast(`"${name}" is already in your active workout.`);
                      }
                    }}
                  >
                    ➕ Create
                  </button>
                </div>
              )}

              {(() => {
                const filtered = presetExercises.filter(ex => {
                  const matchesSearch = ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase());
                  const matchesCategory = exerciseFilterTag === 'All' || ex.category === exerciseFilterTag;
                  return matchesSearch && matchesCategory;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="no-presets-found" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                        {exerciseSearchQuery.trim() ? "No matching preset exercises found." : "No exercises in this category."}
                      </p>
                      {!exerciseSearchQuery.trim() && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Type in the search bar above to create a custom exercise!
                        </p>
                      )}
                    </div>
                  );
                }

                return filtered.map(ex => {
                  const alreadyAdded = logExercises.some(le => le.name.toLowerCase() === ex.name.toLowerCase());
                  return (
                    <div key={ex.name} className="exercise-preset-item">
                      <div className="preset-info">
                        <strong>{ex.name}</strong>
                        <span>{ex.category}</span>
                      </div>
                      <button
                        type="button"
                        className={`btn-add-preset-action ${alreadyAdded ? 'added' : ''}`}
                        onClick={() => {
                          if (!alreadyAdded) {
                            setLogExercises(prev => [...prev, { name: ex.name, sets: [{ reps: 10, weight: '5.0', isCompleted: false }] }]);
                            triggerToast(`Added ${ex.name} to active workout!`);
                            setShowExerciseDbModal(false); // Close the modal automatically
                          } else {
                            triggerToast(`${ex.name} is already in your workout log.`);
                          }
                        }}
                      >
                        {alreadyAdded ? '✓ Added' : '➕ Add'}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Hevy-Style Finish Workout PR & Volume Analytics Modal */}
      {showFinishSummary && summaryStats && (
        <div className="payment-gateway-backdrop summary-modal-backdrop">
          <div className="payment-gateway-modal summary-modal-card animate-scale-in">
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
                <strong>{logClient}</strong> successfully completed this active training session in <strong>{summaryStats.duration}</strong>. Throughout this session, a grand total of <strong>{summaryStats.volume} kg</strong> was lifted across <strong>{summaryStats.totalSets} active sets</strong> to lock in progressive recovery.
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
                <input 
                  type="text" 
                  placeholder="Enter template name (e.g. Push Routine)" 
                  value={templateName} 
                  onChange={(e) => setTemplateName(e.target.value)} 
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
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

      {/* Floating Hevy Rest Timer Overlay */}
      {restTimerActive && restSecondsRemaining > 0 && (
        <div className="rest-timer-floating-card animate-slide-up">
          <div className="rest-timer-content">
            <span className="rest-icon">⏱️</span>
            <div className="rest-timer-info">
              <span>REST TIMER</span>
              <strong>{restSecondsRemaining}s</strong>
            </div>
          </div>
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
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Exercise Video & Form Guide Modal Overlay */}
      {activeGuideExercise && (
        <div className="payment-gateway-backdrop guide-modal-backdrop" onClick={() => setActiveGuideExercise(null)}>
          <div className="payment-gateway-modal guide-modal-card animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <div className="modal-title-box">
                <span className="secure-badge">🎬 FORM & VIDEO GUIDE</span>
                <h3>{activeGuideExercise.name}</h3>
              </div>
              <button 
                type="button" 
                className="btn-close-modal-x"
                onClick={() => setActiveGuideExercise(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'all 0.2s'
                }}
              >
                ✕
              </button>
            </div>

            <div className="guide-modal-split-body">
              <div className="video-player-wrapper">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${activeGuideExercise.videoId}?autoplay=1&mute=1&playlist=${activeGuideExercise.videoId}&loop=1&controls=1&rel=0`}
                  title={`${activeGuideExercise.name} Video Guide`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              </div>

              <div className="guide-details-section">
                <div className="cue-card">
                  <span className="cue-icon">🎯</span>
                  <div className="cue-content">
                    <h5>Target Muscle</h5>
                    <p>{activeGuideExercise.guide?.target}</p>
                  </div>
                </div>

                <div className="cue-card">
                  <span className="cue-icon">🪜</span>
                  <div className="cue-content">
                    <h5>Setup & Position</h5>
                    <p>{activeGuideExercise.guide?.setup}</p>
                  </div>
                </div>

                <div className="cue-card">
                  <span className="cue-icon">⚡</span>
                  <div className="cue-content">
                    <h5>Execution</h5>
                    <p>{activeGuideExercise.guide?.execution}</p>
                  </div>
                </div>

                <div className="cue-card cue-tip-card">
                  <span className="cue-icon">💡</span>
                  <div className="cue-content">
                    <h5>Coach's Tip</h5>
                    <p>{activeGuideExercise.guide?.tip}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="guide-actions-row">
              <button 
                type="button" 
                className="btn-confirm-save-hevy"
                onClick={() => setActiveGuideExercise(null)}
              >
                Got It, Thanks!
              </button>
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
                  setWorkoutActiveSeconds(0);
                  setWorkoutTimerRunning(false);
                  setLogExercises([
                    { name: 'Shoulders Press', sets: [{ reps: 9, weight: '2.5', isCompleted: false }, { reps: 9, weight: '2.5', isCompleted: false }] },
                    { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }, { reps: 15, weight: '2.5', isCompleted: false }] },
                    { name: 'One Arm Row', sets: [{ reps: 12, weight: '2.5', isCompleted: false }, { reps: 12, weight: '2.6', isCompleted: false }] },
                    { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '2.0', isCompleted: false }, { reps: 12, weight: '2.0', isCompleted: false }] }
                  ]);
                  setShowUntickedFinishModal(false);
                  setActiveView('analytics');
                  triggerToast('🗑️ Workout session discarded.');
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
