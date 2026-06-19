import React, { useState, useEffect, useRef } from 'react';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../services/databaseService';
import './TrainerDashboard.css';

// Comprehensive A-Z Exercise Library (150+ exercises)
const LIVE_EXERCISE_LIST = [
  // A
  'Ab Wheel Rollout',
  'Arnold Press',
  'Around the World (Chest)',
  'Assisted Pull-up',
  'Assisted Dip',
  // B
  'Back Extension',
  'Ball Slam',
  'Band Pull Apart',
  'Barbell Curl',
  'Barbell Hip Thrust',
  'Barbell Row',
  'Barbell Shrug',
  'Barbell Squat',
  'Behind Neck Press',
  'Bench Press',
  'Bent Over Dumbbell Row',
  'Bent Over Row (Barbell)',
  'Bicep Curl (Cable)',
  'Bicep Curl (Dumbbell)',
  'Box Jump',
  'Box Squat',
  'Bulgarian Split Squat',
  'Burpee',
  // C
  'Cable Crossover',
  'Cable Crunch',
  'Cable Curl',
  'Cable Fly',
  'Cable Kickback',
  'Cable Lateral Raise',
  'Cable Overhead Triceps Extension',
  'Cable Pull Through',
  'Cable Row (Seated)',
  'Calf Raise (Machine)',
  'Calf Raise (Standing)',
  'Chest Dip',
  'Chest Fly (Dumbbell)',
  'Chest Press (Machine)',
  'Chin-up',
  'Clean and Press',
  'Close Grip Bench Press',
  'Concentration Curl',
  'Crunch',
  'Curtsy Lunge',
  // D
  'Dead Bug',
  'Deadlift',
  'Deadlift (Sumo)',
  'Decline Bench Press',
  'Decline Crunch',
  'Deficit Push-up',
  'Diamond Push-up',
  'Dip',
  'Dumbbell Curl',
  'Dumbbell Fly',
  'Dumbbell Lunge',
  'Dumbbell Press (Incline)',
  'Dumbbell Press (Seated)',
  'Dumbbell Row',
  'Dumbbell Shrug',
  'Dumbbell Squat',
  // E
  'EZ Bar Curl',
  'EZ Bar Skullcrusher',
  // F
  'Face Pull',
  'Face Pull (Cable)',
  'Farmer Walk',
  'Floor Press',
  'Front Raise',
  'Front Raise (Barbell)',
  'Front Squat',
  // G
  'Glute Bridge',
  'Glute Kickback',
  'Goblet Squat',
  'Good Morning',
  // H
  'Hack Squat',
  'Hammer Curl',
  'Hanging Knee Raise',
  'Hanging Leg Raise',
  'High Cable Curl',
  'High Row (Machine)',
  'Hip Abduction (Machine)',
  'Hip Adduction (Machine)',
  'Hip Thrust',
  'Hyperextension',
  // I
  'Incline Barbell Press',
  'Incline Dumbbell Curl',
  'Incline Dumbbell Press',
  'Incline Dumbbell Row',
  'Incline Push-up',
  // J
  'Jump Squat',
  'Jumping Jack',
  // K
  'Kettlebell Swing',
  'Kettlebell Goblet Squat',
  'Kneeling Cable Crunch',
  // L
  'Lat Pulldown',
  'Lat Pulldown (Close Grip)',
  'Lat Pulldown (Wide Grip)',
  'Lateral Raise',
  'Lateral Raise (Cable)',
  'Lateral Raise (Machine)',
  'Leg Curl (Lying)',
  'Leg Curl (Seated)',
  'Leg Extension',
  'Leg Press',
  'Leg Press (Narrow Stance)',
  'Low Cable Row',
  'Lunge',
  'Lying Triceps Extension',
  // M
  'Military Press',
  'Mountain Climber',
  // N
  'Neutral Grip Pull-up',
  // O
  'Oblique Crunch',
  'One Arm Cable Row',
  'One Arm Dumbbell Row',
  'Overhead Press (Barbell)',
  'Overhead Press (Dumbbell)',
  'Overhead Triceps Extension',
  // P
  'Pec Deck Fly',
  'Pendlay Row',
  'Plank',
  'Plank (Side)',
  'Preacher Curl',
  'Press (Smith Machine)',
  'Pull-up',
  'Push-up',
  'Push-up (Wide Grip)',
  // R
  'Rack Pull',
  'Rear Delt Fly',
  'Rear Delt Fly (Cable)',
  'Rear Delt Fly (Machine)',
  'Reverse Curl',
  'Reverse Fly',
  'Reverse Lunge',
  'Romanian Deadlift',
  'Romanian Deadlift (Dumbbell)',
  'Russian Twist',
  // S
  'Seated Cable Row',
  'Seated Calf Raise',
  'Seated Dumbbell Curl',
  'Seated Leg Curl',
  'Seated Row (Machine)',
  'Shoulder Press (Barbell)',
  'Shoulder Press (Dumbbell)',
  'Shoulder Press (Machine)',
  'Shrug',
  'Shrug (Barbell)',
  'Shrug (Dumbbell)',
  'Side Lateral Raise',
  'Single Leg Deadlift',
  'Single Leg Press',
  'Skullcrusher',
  'Smith Machine Squat',
  'Split Squat',
  'Squat',
  'Step-up',
  'Stiff Leg Deadlift',
  'Straight Bar Curl',
  'Sumo Deadlift',
  'Superman',
  // T
  'T-Bar Row',
  'Triceps Dip',
  'Triceps Extension (Cable)',
  'Triceps Extension (Dumbbell)',
  'Triceps Kickback',
  'Triceps Pushdown',
  'Triceps Rope Pushdown',
  // U
  'Upright Row (Barbell)',
  'Upright Row (Cable)',
  'Upright Row (Dumbbell)',
  // V
  'V Up',
  'V-Bar Pulldown',
  // W
  'Wide Grip Pull-up',
  'Wrist Curl',
  // Z
  'Zercher Squat',
];

const TrainerDashboard = ({ handleLogout }) => {
  const loggedInEmail = localStorage.getItem('userEmail') || '';
  const userRole = localStorage.getItem('userRole') || '';
  const superAdmin = isSuperAdmin(loggedInEmail) || userRole === 'super-admin' || userRole === 'admin';
  const [viewMode, setViewMode] = useState('coach'); // 'coach' or 'admin'
  const [coachesList, setCoachesList] = useState([]);
  const [pendingCoachesList, setPendingCoachesList] = useState([]);
  const [platformStats, setPlatformStats] = useState({ totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [refreshToast, setRefreshToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allUsersList, setAllUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  if (userRole === 'coach_pending' && !superAdmin) {
    return (
      <div className="trainer-dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '40px', borderRadius: '16px', maxWidth: '500px' }}>
          <h2 style={{ color: '#f59e0b', marginBottom: '16px' }}>⏳ Application Pending</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', lineHeight: '1.5' }}>
            Thank you for applying to be a Fitengineers Coach. Your application is currently under review by our administration team.
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
            We'll notify you once your account has been approved and activated.
          </p>
          <button 
            onClick={handleLogout}
            style={{ padding: '10px 24px', background: 'var(--danger)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  const fetchAdminData = async () => {
    if (!superAdmin) return;
    setLoadingAdmin(true);
    try {
      const coaches = await databaseService.getAllCoaches();
      const stats = await databaseService.getPlatformStats();
      const pendingCoaches = await databaseService.getPendingCoachApplications();
      setCoachesList(coaches || []);
      setPendingCoachesList(pendingCoaches || []);
      setPlatformStats(stats || { totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });

      // Fetch all users for platform directory
      if (isSupabaseConfigured && databaseService.supabase) {
        setLoadingUsers(true);
        const { data: allUsers, error: usersError } = await databaseService.supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        if (!usersError && allUsers) {
          setAllUsersList(allUsers);
        }
        setLoadingUsers(false);
      }
    } catch (e) {
      console.error('Error fetching admin data:', e);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleRejectCoach = async (coach) => {
    if (!window.confirm(`Reject ${coach.name || coach.email}'s application?`)) {
      return;
    }
    try {
      await databaseService.rejectCoach(coach.email);
      fetchAdminData();
      alert('Coach application rejected.');
    } catch (err) {
      console.error('Error rejecting coach:', err);
      alert('Failed to reject coach.');
    }
  };

  const handleRefresh = async () => {
    if (!superAdmin) return;
    setRefreshing(true);
    try {
      await databaseService.refreshLocalCoaches();
      await fetchAdminData();
      setRefreshToast('Platform data refreshed');
    } catch (e) {
      console.error('Refresh error:', e);
      setRefreshToast('Refresh failed');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshToast(''), 3000);
    }
  };

  useEffect(() => {
    if (viewMode === 'admin') {
      fetchAdminData();
    }
  }, [viewMode]);

  useEffect(() => {
    // Listen for coaches updates (same-tab via CustomEvent) and cross-tab via storage event
    const handleCoachesUpdated = () => {
      if (viewMode === 'admin') fetchAdminData();
    };
    const handleStorage = (e) => {
      if (e.key === 'coaches_list' && viewMode === 'admin') {
        fetchAdminData();
      }
    };

    window.addEventListener('coaches_updated', handleCoachesUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('coaches_updated', handleCoachesUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [viewMode]);

  const handleToggleCoachPayment = async (coach) => {
    const nextStatus = coach.payment_status === 'active' ? 'failed' : 'active';
    const updated = { ...coach, payment_status: nextStatus };
    await databaseService.saveCoachProfile(updated);
    fetchAdminData();
  };

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('All');
  
  // Selected client detail view states
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailTab, setDetailTab] = useState('plans'); // 'plans', 'livelog', 'workout'
  
  // Selected client workout plans state
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editorPlanName, setEditorPlanName] = useState('');
  const [editorExercises, setEditorExercises] = useState([]);

  const fetchClientPlans = async (clientId) => {
    setLoadingPlans(true);
    try {
      const plans = await databaseService.getWorkoutPlansForUser(clientId);
      setClientPlans(plans || []);
    } catch (e) {
      console.error('Error fetching client plans:', e);
    } finally {
      setLoadingPlans(false);
    }
  };
  
  // Workout history states
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ─── Live Session Logger States ───
  const [liveDate, setLiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [liveExercises, setLiveExercises] = useState([
    { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }
  ]);
  const [livePlanName, setLivePlanName] = useState('Live Routine');
  const [liveCustomExercise, setLiveCustomExercise] = useState('');
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveToast, setLiveToast] = useState('');

  const triggerLiveToast = (msg) => {
    setLiveToast(msg);
    setTimeout(() => setLiveToast(''), 3500);
  };

  const handleLiveAddExercise = (name) => {
    setLiveExercises(prev => [
      ...prev,
      { name, sets: [{ reps: '10', weight: '20', isCompleted: false }] }
    ]);
  };

  const handleLiveAddSet = (exIdx) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1] || { reps: '10', weight: '20' };
      return { ...ex, sets: [...ex.sets, { reps: last.reps, weight: last.weight, isCompleted: false }] };
    }));
  };

  const handleLiveRemoveSet = (exIdx, setIdx) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
    }));
  };

  const handleLiveSetChange = (exIdx, setIdx, field, value) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s)
      };
    }));
  };

  const handleLiveToggleSet = (exIdx, setIdx) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => si === setIdx ? { ...s, isCompleted: !s.isCompleted } : s)
      };
    }));
  };

  const handleLiveRemoveExercise = (exIdx) => {
    setLiveExercises(prev => prev.filter((_, idx) => idx !== exIdx));
  };

  const handleSaveLiveSession = async () => {
    if (!selectedClient) return;
    const totalSets = liveExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    if (totalSets === 0) {
      triggerLiveToast('⚠️ Add at least one exercise set before saving.');
      return;
    }
    setLiveSaving(true);
    try {
      // Build session object - only save completed sets, or all if none ticked
      const completedCount = liveExercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length, 0);
      const formattedExercises = liveExercises.map(ex => ({
        name: ex.name,
        sets: (completedCount > 0 ? ex.sets.filter(s => s.isCompleted) : ex.sets).map(s => ({
          reps: parseInt(s.reps) || 0,
          weight: parseFloat(s.weight) || 0
        }))
      })).filter(ex => ex.sets.length > 0);

      const session = {
        id: `coach-live-${Date.now()}`,
        clientName: selectedClient.userName,
        clientId: selectedClient.id,
        date: liveDate,
        exercises: formattedExercises,
        loggedByCoach: true,
        planName: livePlanName || 'Live Routine'
      };

      await databaseService.saveWorkoutSession(session);

      // Save/update the workout plan template
      if (livePlanName.trim()) {
        try {
          const existingPlans = await databaseService.getWorkoutPlansForUser(selectedClient.id);
          const match = existingPlans?.find(p => p.planName.toLowerCase() === livePlanName.trim().toLowerCase());
          const plan = {
            id: match?.id,
            userId: selectedClient.id,
            planName: livePlanName.trim(),
            exercises: liveExercises.map(ex => ({
              name: ex.name,
              sets: ex.sets.map(s => ({ reps: parseInt(s.reps) || 0, weight: parseFloat(s.weight) || 0 }))
            })),
            createdBy: 'coach'
          };
          await databaseService.saveWorkoutPlan(plan);
          fetchClientPlans(selectedClient.id);
        } catch(errPlan) {
          console.error('Error auto-saving workout plan template:', errPlan);
        }
      }

      // Also update the client's own workoutSessions in localStorage for immediate dashboard refresh
      const clientKey = selectedClient.userName.toLowerCase().replace(/\s+/g, '');
      const existingRaw = localStorage.getItem(`client_${clientKey}_workoutSessions`);
      const existingSessions = existingRaw ? JSON.parse(existingRaw) : [];
      existingSessions.push(session);
      localStorage.setItem(`client_${clientKey}_workoutSessions`, JSON.stringify(existingSessions));
      // Also update global workoutSessions
      const globalRaw = localStorage.getItem('workoutSessions');
      let globalSessions = [];
      if (globalRaw) {
        try { globalSessions = JSON.parse(globalRaw); } catch(e) {}
      }
      // Avoid duplicate: only add if not already there
      const alreadyInGlobal = globalSessions.some(s => s.id === session.id);
      if (!alreadyInGlobal) {
        globalSessions.push(session);
        localStorage.setItem('workoutSessions', JSON.stringify(globalSessions));
      }
      // Dispatch event so WorkoutTracker refreshes its session list
      window.dispatchEvent(new StorageEvent('storage', { key: 'workoutSessions', newValue: JSON.stringify(globalSessions) }));
      window.dispatchEvent(new CustomEvent('workoutSessionsUpdated', { detail: { clientKey, session } }));

      triggerLiveToast('✅ Workout session saved for ' + selectedClient.userName + '!');
      // Refresh workout history
      const logs = await databaseService.getWorkoutLogsForUser(selectedClient.id);
      setWorkoutLogs(groupLogs(logs || []));
      // Reset exercises for next session
      setLiveExercises([
        { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }
      ]);
      setLivePlanName('Live Routine');
      setLiveDate(new Date().toISOString().split('T')[0]);
    } catch(e) {
      console.error('Error saving live session:', e);
      triggerLiveToast('❌ Failed to save session. Please try again.');
    } finally {
      setLiveSaving(false);
    }
  };

  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef(null);

  // Fetch all clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const data = await databaseService.getAllUsers();
        // Exclude trainer emails from the clients listing to avoid noise
        const filteredData = data.filter(u => 
          u.email !== 'trainer@fitengineers.com' && 
          u.email !== 'subodhmankala@gmail.com' && 
          u.email !== 'coach@fitengineers.com'
        );
        setClients(filteredData);
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Fetch client workout logs when a client is selected
  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setDetailTab('plans');
    setLoadingLogs(true);
    setWorkoutLogs([]);
    try {
      // 1. Get flat logs from database service (Supabase or localStorage via id)
      const logs = await databaseService.getWorkoutLogsForUser(client.id);

      // 2. Also pull from client-specific localStorage key by userName (coach-logged sessions)
      const clientKey = (client.userName || client.id || '').toLowerCase().replace(/\s+/g, '');
      const extraKeys = [`client_${clientKey}_workoutSessions`, `client_${client.id}_workoutSessions`];
      const extraLogs = [];
      extraKeys.forEach(key => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const sessions = JSON.parse(raw);
            sessions.forEach(sess => {
              if (sess.exercises) {
                sess.exercises.forEach(ex => {
                  if (ex.sets) {
                    ex.sets.forEach((set, sIdx) => {
                      extraLogs.push({
                        log_date: sess.date,
                        exercise_name: ex.name,
                        set_number: sIdx + 1,
                        reps: parseInt(set.reps || '0'),
                        weight_kg: parseFloat(set.weight || '0'),
                        loggedByCoach: sess.loggedByCoach
                      });
                    });
                  }
                });
              }
            });
          }
        } catch(e) {}
      });

      // 3. Also scan global workoutSessions filtered by this client
      try {
        const globalRaw = localStorage.getItem('workoutSessions');
        if (globalRaw) {
          const allSessions = JSON.parse(globalRaw);
          allSessions
            .filter(s => s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === clientKey)
            .forEach(sess => {
              if (sess.exercises) {
                sess.exercises.forEach(ex => {
                  if (ex.sets) {
                    ex.sets.forEach((set, sIdx) => {
                      extraLogs.push({
                        log_date: sess.date,
                        exercise_name: ex.name,
                        set_number: sIdx + 1,
                        reps: parseInt(set.reps || '0'),
                        weight_kg: parseFloat(set.weight || '0'),
                        loggedByCoach: sess.loggedByCoach
                      });
                    });
                  }
                });
              }
            });
        }
      } catch(e) {}

      // 4. Merge and dedupe by date+exercise+set_number
      const allLogs = [...(logs || [])];
      extraLogs.forEach(el => {
        const dup = allLogs.find(l =>
          l.log_date === el.log_date &&
          l.exercise_name === el.exercise_name &&
          l.set_number === el.set_number &&
          l.reps === el.reps &&
          l.weight_kg === el.weight_kg
        );
        if (!dup) allLogs.push(el);
      });

      const grouped = groupLogs(allLogs);
      setWorkoutLogs(grouped);

      // Load client plans
      fetchClientPlans(client.id);
    } catch (err) {
      console.error('Error fetching client logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const groupLogs = (logs) => {
    const datesMap = {};
    
    logs.forEach(log => {
      const date = log.log_date;
      if (!datesMap[date]) {
        datesMap[date] = {};
      }
      
      const exercise = log.exercise_name;
      if (!datesMap[date][exercise]) {
        datesMap[date][exercise] = [];
      }
      
      datesMap[date][exercise].push({
        setNumber: log.set_number,
        reps: log.reps,
        weight: log.weight_kg
      });
    });

    const sortedDatesList = Object.keys(datesMap)
      .sort((a, b) => new Date(b) - new Date(a)) // Latest sessions first
      .map(dateStr => {
        const exercisesList = Object.keys(datesMap[dateStr]).map(exName => {
          const sortedSets = datesMap[dateStr][exName].sort((a, b) => a.setNumber - b.setNumber);
          return {
            name: exName,
            sets: sortedSets
          };
        });
        
        return {
          date: dateStr,
          exercises: exercisesList
        };
      });

    return sortedDatesList;
  };

  const fetchClientChat = async (clientId) => {
    try {
      const msgs = await databaseService.getChatMessages(clientId);
      setChatMessages(msgs);
    } catch (e) {
      console.error("Error fetching client chat:", e);
    }
  };

  // Poll client chat history logs every 4 seconds when chat tab is active
  useEffect(() => {
    if (!selectedClient || detailTab !== 'chat') return;

    fetchClientChat(selectedClient.id);

    const interval = setInterval(() => {
      fetchClientChat(selectedClient.id);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedClient, detailTab]);

  // Scroll to bottom of chat when new messages loaded
  useEffect(() => {
    if (detailTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, detailTab]);

  const handleTabChange = async (tab) => {
    setDetailTab(tab);
    if (tab === 'chat' && selectedClient) {
      setLoadingChat(true);
      await fetchClientChat(selectedClient.id);
      setLoadingChat(false);
    } else if (tab === 'plans' && selectedClient) {
      await fetchClientPlans(selectedClient.id);
    }
  };

  const handleSavePlan = async () => {
    if (!editorPlanName.trim()) {
      alert("Please enter a plan name.");
      return;
    }
    if (editorExercises.length === 0) {
      alert("Please add at least one exercise.");
      return;
    }
    
    // Clean up empty sets
    const cleanExercises = editorExercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.map(s => ({
        reps: parseInt(s.reps) || 10,
        weight: parseFloat(s.weight) || 0
      }))
    })).filter(ex => ex.sets.length > 0);

    const plan = {
      id: editingPlan ? editingPlan.id : null,
      userId: selectedClient.id,
      planName: editorPlanName.trim(),
      exercises: cleanExercises,
      createdBy: 'coach'
    };

    await databaseService.saveWorkoutPlan(plan);
    setShowPlanEditor(false);
    setEditingPlan(null);
    setEditorPlanName('');
    setEditorExercises([]);
    fetchClientPlans(selectedClient.id);
  };

  const handleAddExerciseToEditor = (name) => {
    setEditorExercises(prev => [
      ...prev,
      {
        name,
        sets: [{ reps: 10, weight: 20 }]
      }
    ]);
  };

  const handleAddSetToExercise = (exIdx) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
        return {
          ...ex,
          sets: [...ex.sets, { reps: lastSet.reps, weight: lastSet.weight }]
        };
      }
      return ex;
    }));
  };

  const handleRemoveSetFromExercise = (exIdx, setIdx) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        return {
          ...ex,
          sets: ex.sets.filter((_, sIdx) => sIdx !== setIdx)
        };
      }
      return ex;
    }));
  };

  const handleUpdateSetInExercise = (exIdx, setIdx, field, val) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx === setIdx) {
              return { ...s, [field]: val };
            }
            return s;
          })
        };
      }
      return ex;
    }));
  };

  const handleRemoveExerciseFromEditor = (exIdx) => {
    setEditorExercises(prev => prev.filter((_, idx) => idx !== exIdx));
  };

  const handleSendCoachMessage = async () => {
    if (!chatInput.trim() || !selectedClient) return;
    
    const text = chatInput.trim();
    setChatInput('');

    // Save coach reply in database
    await databaseService.saveChatMessage(selectedClient.id, 'coach', text);
    
    // Refresh history
    await fetchClientChat(selectedClient.id);
  };

  const getAvatarInitials = (name) => {
    if (!name) return 'W';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const getAvatarColor = (name) => {
    const colors = ['#ea4335', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Filter clients list
  const filteredClients = clients.filter(c => {
    const matchesSearch = 
      c.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesGoal = goalFilter === 'All' || c.userGoal === goalFilter;
    
    return matchesSearch && matchesGoal;
  });

  return (
    <div className="trainer-dashboard-container animate-scale-in">
      {/* Top Header */}
      <div className="trainer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/logo.png" 
            alt="Fitengineers Logo" 
            style={{ 
              height: '42px', 
              width: 'auto', 
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.35))'
            }} 
          />
          <div className="trainer-title-group" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: 0, lineHeight: 1.2 }}>Coach Dashboard</h3>
            <span style={{ 
              fontSize: '0.85rem', 
              color: 'var(--text-muted)', 
              fontWeight: 600,
              marginTop: '3px'
            }}>
              {localStorage.getItem('userName') || 'Coach Subodh'}
            </span>
          </div>
        </div>
        <button className="logout-btn-trainer" onClick={handleLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>

      {superAdmin && (
        <div className="trainer-view-selector" style={{
          display: 'flex',
          gap: '12px',
          padding: '0 16px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-color)',
          overflowX: 'auto'
        }}>
          <button 
            className={`view-selector-btn ${viewMode === 'coach' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('coach');
              setSelectedClient(null);
            }}
            style={{
              padding: '12px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              color: viewMode === 'coach' ? 'var(--primary-accent-light)' : 'var(--text-muted)',
              borderBottom: viewMode === 'coach' ? '2px solid var(--primary-accent-light)' : 'none',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            👥 My Clients
          </button>
          <button 
            className={`view-selector-btn ${viewMode === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('admin');
              setSelectedClient(null);
            }}
            style={{
              padding: '12px 16px',
              fontSize: '0.85rem',
              fontWeight: '700',
              color: viewMode === 'admin' ? 'var(--primary-accent-light)' : 'var(--text-muted)',
              borderBottom: viewMode === 'admin' ? '2px solid var(--primary-accent-light)' : 'none',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            🛡️ Platform Admin
          </button>
        </div>
      )}

      {viewMode === 'admin' ? (
        <div className="platform-admin-view animate-scale-in" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Platform-wide Performance</h4>
            <button 
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              🔄 Refresh Data
            </button>
            {refreshToast && (
              <div style={{ marginLeft: '12px', color: '#fff', fontSize: '0.85rem', background: 'rgba(0,0,0,0.35)', padding: '6px 10px', borderRadius: '8px', display: 'inline-block' }}>
                {refreshToast}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="admin-stats-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            <div 
              className="metric-mini-card clickable-card" 
              onClick={() => {
                setViewMode('coach');
                setSelectedClient(null);
              }}
              style={{ 
                padding: '16px', 
                borderRadius: '12px', 
                background: 'rgba(16, 185, 129, 0.05)', 
                border: '1px solid rgba(16, 185, 129, 0.15)',
                cursor: 'pointer'
              }}
            >
              <div className="metric-mini-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Clients</div>
              <div className="metric-mini-value" style={{ fontSize: '1.5rem', color: '#10b981', fontWeight: 800 }}>
                {platformStats.totalActiveClients}
              </div>
            </div>
            <div className="metric-mini-card" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
              <div className="metric-mini-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Coaches</div>
              <div className="metric-mini-value" style={{ fontSize: '1.5rem', color: '#f59e0b', fontWeight: 800 }}>
                {coachesList.length}
              </div>
            </div>
          </div>

          {/* Pending Coaches Card */}
          {pendingCoachesList.length > 0 && (
            <div className="glass-panel" style={{
              background: 'rgba(245, 158, 11, 0.05)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              overflowX: 'auto',
              marginBottom: '10px'
            }}>
              <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>Pending Coach Applications ({pendingCoachesList.length})</h5>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '550px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coach Name</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Experience</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Location</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCoachesList.map(coach => (
                    <tr key={coach.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '48px' }}>
                      <td style={{ padding: '8px', fontSize: '0.82rem', fontWeight: 600 }}>{coach.name || coach.userName}</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem' }}>{coach.email}</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem' }}>{coach.experience || 'N/A'} yrs</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem' }}>{coach.location || 'N/A'}</td>
                      <td style={{ padding: '8px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={async () => {
                            await databaseService.approveCoach(coach.email);
                            fetchAdminData();
                          }}
                          style={{
                            background: '#10b981',
                            border: 'none',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(16,185,129,0.3)'
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectCoach(coach)}
                          style={{
                            background: 'var(--danger)',
                            border: 'none',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(239,68,68,0.3)'
                          }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Coaches Table Card */}
          <div className="glass-panel" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            overflowX: 'auto'
          }}>
            <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>Coaches Directory</h5>

            {loadingAdmin ? (
              <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
                <div className="trainer-spinner"></div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading coaches details...</p>
              </div>
            ) : coachesList.length === 0 ? (
              <div className="trainer-empty-state">
                <h5>No Registered Coaches</h5>
                <p>No coach profiles exist on the platform.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '550px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coach</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Brand</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Joined</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Clients</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Subscription</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coachesList.map(coach => (
                    <tr key={coach.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '48px' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{coach.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{coach.email}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px', fontSize: '0.8rem' }}>{coach.brand}</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(coach.signup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '8px', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                        {coach.clientsCount}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: coach.payment_status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: coach.payment_status === 'active' ? '#10b981' : 'var(--danger)',
                          border: `1px solid ${coach.payment_status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}>
                          {coach.payment_status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleCoachPayment(coach)}
                          style={{
                            background: coach.payment_status === 'active' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                            border: `1px solid ${coach.payment_status === 'active' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                            color: coach.payment_status === 'active' ? 'var(--danger)' : '#10b981',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {coach.payment_status === 'active' ? 'Mark Inactive' : 'Mark Active'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* All Users Table Card */}
          <div className="glass-panel" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            overflowX: 'auto',
            marginTop: '20px'
          }}>
            <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>All Users Directory</h5>

            {loadingUsers ? (
              <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
                <div className="trainer-spinner"></div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading users list...</p>
              </div>
            ) : allUsersList.length === 0 ? (
              <div className="trainer-empty-state">
                <h5>No Users Found</h5>
                <p>No registered user profiles exist on the platform.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '550px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>User / Email</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Verified</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Payment</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Joined</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsersList.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '48px' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{u.full_name || u.userName || 'Warrior'}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.email}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: u.role === 'super-admin' || u.role === 'admin' 
                            ? 'rgba(139, 92, 246, 0.12)' 
                            : u.role === 'coach' 
                            ? 'rgba(59, 130, 246, 0.12)' 
                            : 'rgba(255, 255, 255, 0.08)',
                          color: u.role === 'super-admin' || u.role === 'admin' 
                            ? '#a78bfa' 
                            : u.role === 'coach' 
                            ? '#60a5fa' 
                            : '#9ca3af',
                          border: `1px solid ${
                            u.role === 'super-admin' || u.role === 'admin' 
                              ? 'rgba(139, 92, 246, 0.2)' 
                              : u.role === 'coach' 
                              ? 'rgba(59, 130, 246, 0.2)' 
                              : 'rgba(255, 255, 255, 0.1)'
                          }`
                        }}>
                          {(u.role || 'client').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontSize: '0.9rem' }}>
                        {u.verified ? '✅' : '❌'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: u.payment_status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: u.payment_status === 'active' ? '#10b981' : 'var(--danger)',
                          border: `1px solid ${u.payment_status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}>
                          {(u.payment_status || 'active').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {(u.role === 'coach' || u.role === 'coach_pending') && !u.verified ? (
                          <button
                            onClick={async () => {
                              await databaseService.approveCoach(u.email);
                              fetchAdminData();
                            }}
                            style={{
                              background: '#10b981',
                              border: 'none',
                              color: '#fff',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: '0 2px 4px rgba(16,185,129,0.3)'
                            }}
                          >
                            Approve
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <>
          {!selectedClient ? (
            // Client Directory Screen
            <div className="client-directory-view">
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px', padding: '16px', marginBottom: '20px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <h5 style={{ margin: '0 0 8px 0', color: '#fff' }}>Invite Clients</h5>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Generate a unique code for your clients to link their accounts to you during sign up.</p>
                </div>
                <button
                  onClick={async () => {
                    const coachId = localStorage.getItem('userId') || loggedInEmail;
                    const code = await databaseService.generateCoachInviteCode(coachId);
                    alert(`Your new invitation code is: ${code}\nShare this code with your clients.`);
                  }}
                  style={{
                    background: 'var(--primary-accent-light)', border: 'none', color: '#fff',
                    padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  Generate Code
                </button>
              </div>

              <div className="search-filter-box">
                <input
                  type="text"
                  className="trainer-search-input"
                  placeholder="🔍 Search client by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <div className="filter-tags">
                  {['All', 'Fat Loss', 'Muscle Building', 'Gut Fix'].map(goal => (
                    <button
                      key={goal}
                      className={`filter-tag ${goalFilter === goal ? 'active' : ''}`}
                      onClick={() => setGoalFilter(goal)}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>

              <h4 className="client-directory-title">
                Clients ({filteredClients.length})
              </h4>

              {loadingClients ? (
                <div className="trainer-loading-container">
                  <div className="trainer-spinner"></div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading client directory...</p>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="trainer-empty-state">
                  <div className="trainer-empty-icon">👥</div>
                  <h5>No Clients Found</h5>
                  <p>Try refining your search query or selecting a different goal category tag filter.</p>
                </div>
              ) : (
                <div className="glass-panel" style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px',
                  overflowX: 'auto'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '550px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Name</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Goal</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.map(client => (
                        <tr key={client.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '56px' }}>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div 
                                className="client-avatar"
                                style={{ 
                                  backgroundColor: getAvatarColor(client.userName),
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  color: '#fff'
                                }}
                              >
                                {getAvatarInitials(client.userName)}
                              </div>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{client.userName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {client.email}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {client.userGoal && (
                              <span className={`client-goal-badge ${client.userGoal.toLowerCase().replace(/\s+/g, '-')}`} style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: client.userGoal.toLowerCase().includes('fat') 
                                  ? 'rgba(239, 68, 68, 0.12)' 
                                  : client.userGoal.toLowerCase().includes('muscle') 
                                  ? 'rgba(59, 130, 246, 0.12)' 
                                  : 'rgba(16, 185, 129, 0.12)',
                                color: client.userGoal.toLowerCase().includes('fat') 
                                  ? '#ef4444' 
                                  : client.userGoal.toLowerCase().includes('muscle') 
                                  ? '#3b82f6' 
                                  : '#10b981',
                                border: `1px solid ${
                                  client.userGoal.toLowerCase().includes('fat') 
                                    ? 'rgba(239, 68, 68, 0.2)' 
                                    : client.userGoal.toLowerCase().includes('muscle') 
                                    ? 'rgba(59, 130, 246, 0.2)' 
                                    : 'rgba(16, 185, 129, 0.2)'
                                }`
                              }}>
                                {client.userGoal}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleSelectClient(client)}
                              style={{
                                background: 'var(--primary-accent-light)',
                                border: 'none',
                                color: '#fff',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                              }}
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            // Client Detail & Workout Logs Screen
            <div className="client-detail-view animate-scale-in">
              {/* Back to Dashboard Breadcrumb */}
              <div className="dashboard-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                <button 
                  onClick={() => setSelectedClient(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-accent-light)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.85rem'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  Dashboard
                </button>
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>Manage Client</span>
              </div>

              {/* Client Profile Title Block */}
              <div className="client-detail-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div 
                  className="client-avatar"
                  style={{ 
                    backgroundColor: getAvatarColor(selectedClient.userName),
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: '#fff'
                  }}
                >
                  {getAvatarInitials(selectedClient.userName)}
                </div>
                <div className="client-detail-header-info">
                  <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{selectedClient.userName}</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedClient.email}</span>
                </div>
              </div>

              {/* Client Targets Grid */}
              <div className="client-metrics-grid">
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Fitness Goal</div>
                  <div className="metric-mini-value" style={{ fontSize: '0.8rem', color: 'var(--primary-accent-light)' }}>
                    {selectedClient.userGoal || 'Not set'}
                  </div>
                </div>
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Weight (kg)</div>
                  <div className="metric-mini-value">{selectedClient.userWeight || '--'}</div>
                </div>
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Calories</div>
                  <div className="metric-mini-value">{selectedClient.userCalorieTarget || '--'} kcal</div>
                </div>
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Age</div>
                  <div className="metric-mini-value">{selectedClient.userAge || '--'} yrs</div>
                </div>
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Height</div>
                  <div className="metric-mini-value">{selectedClient.userHeight || '--'} cm</div>
                </div>
                <div className="metric-mini-card">
                  <div className="metric-mini-label">Protein</div>
                  <div className="metric-mini-value">{selectedClient.userProteinTarget || '--'}g</div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="trainer-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                  className={`trainer-tab-btn ${detailTab === 'plans' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '10px 6px',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    borderBottom: detailTab === 'plans' ? '2px solid var(--primary-accent-light)' : 'none',
                    color: detailTab === 'plans' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('plans')}
                >
                  📋 Workout Plan
                </button>
                <button
                  className={`trainer-tab-btn ${detailTab === 'livelog' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '10px 6px',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    borderBottom: detailTab === 'livelog' ? '2px solid #f59e0b' : 'none',
                    color: detailTab === 'livelog' ? '#f59e0b' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('livelog')}
                >
                  🎯 Live Log
                </button>
                <button
                  className={`trainer-tab-btn ${detailTab === 'workout' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '10px 6px',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    borderBottom: detailTab === 'workout' ? '2px solid var(--primary-accent-light)' : 'none',
                    color: detailTab === 'workout' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('workout')}
                >
                  🏋️ Workout History
                </button>
              </div>

              {/* Condition tab rendering */}
              {detailTab === 'workout' && (
                <div className="workout-history-content">
                  <h4 className="history-section-title">Workout History</h4>

                  {loadingLogs ? (
                    <div className="trainer-loading-container">
                      <div className="trainer-spinner"></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading workout history logs...</p>
                    </div>
                  ) : workoutLogs.length === 0 ? (
                    <div className="trainer-empty-state">
                      <div className="trainer-empty-icon">🏋️‍♂️</div>
                      <h5>No Workouts Logged</h5>
                      <p>This client has not logged or synchronized any workout sessions to the database yet.</p>
                    </div>
                  ) : (
                    <div className="workout-sessions-list">
                      {workoutLogs.map((session, sIdx) => (
                        <div key={sIdx} className="session-block">
                          <div className="session-date-header">
                            <span className="session-date-icon">📅</span>
                            {new Date(session.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>

                          <div className="session-exercises-list">
                            {session.exercises.map((exercise, eIdx) => (
                              <div key={eIdx} className="exercise-log-card">
                                <div className="exercise-log-name">{exercise.name}</div>
                                
                                <table className="sets-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: '25%' }}>Set</th>
                                      <th style={{ width: '40%' }}>Weight</th>
                                      <th style={{ width: '35%' }}>Reps</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {exercise.sets.map((set, setIdx) => (
                                      <tr key={setIdx}>
                                        <td>
                                          <span className="set-num-badge">{set.setNumber}</span>
                                        </td>
                                        <td>{set.weight} kg</td>
                                        <td>{set.reps} reps</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'plans' && (
                <div className="workout-plans-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {showPlanEditor ? (
                    /* PLAN EDITOR VIEW */
                    <div className="plan-editor-card glass-panel" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                      <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
                        {editingPlan ? '✏️ Edit Workout Plan' : '📋 Create Workout Plan'}
                      </h4>
                      
                      <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Plan Name (e.g. Week 1 - Day 1: Upper Body)</label>
                        <input 
                          type="text"
                          value={editorPlanName}
                          onChange={(e) => setEditorPlanName(e.target.value)}
                          placeholder="e.g. Week 1 - Day 1: Push Day"
                          style={{
                            padding: '10px 14px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            color: '#fff',
                            fontSize: '0.85rem',
                            outline: 'none'
                          }}
                        />
                      </div>

                      {/* Exercises in the editor */}
                      <div className="editor-exercises-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                        <h5 style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exercises</h5>
                        
                        {editorExercises.length === 0 ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No exercises added to this plan yet. Use the dropdown below to add exercises.</p>
                        ) : (
                          editorExercises.map((ex, exIdx) => (
                            <div key={exIdx} className="editor-exercise-item" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                              <div className="ex-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{ex.name}</strong>
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveExerciseFromEditor(exIdx)}
                                  style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                                >
                                  🗑️ Remove Exercise
                                </button>
                              </div>

                              <table className="editor-sets-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '20%' }}>Set</th>
                                    <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '40%' }}>Weight (kg)</th>
                                    <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '40%' }}>Reps</th>
                                    <th style={{ width: '10%' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ex.sets.map((set, setIdx) => (
                                    <tr key={setIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                      <td style={{ padding: '6px 4px' }}>
                                        <span style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', textAlign: 'center', fontSize: '0.75rem', color: '#fff', lineHeight: '20px' }}>{setIdx + 1}</span>
                                      </td>
                                      <td style={{ padding: '6px 4px' }}>
                                        <input 
                                          type="number"
                                          value={set.weight}
                                          onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'weight', e.target.value)}
                                          style={{ width: '80%', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.8rem' }}
                                        />
                                      </td>
                                      <td style={{ padding: '6px 4px' }}>
                                        <input 
                                          type="number"
                                          value={set.reps}
                                          onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'reps', e.target.value)}
                                          style={{ width: '80%', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.8rem' }}
                                        />
                                      </td>
                                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                        {ex.sets.length > 1 && (
                                          <button 
                                            type="button" 
                                            onClick={() => handleRemoveSetFromExercise(exIdx, setIdx)}
                                            style={{ color: 'var(--danger)', fontSize: '0.85rem', cursor: 'pointer' }}
                                          >
                                            🗑️
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <button 
                                type="button" 
                                onClick={() => handleAddSetToExercise(exIdx)}
                                style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                              >
                                ➕ Add Set
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Exercise — Autocomplete Input + Datalist */}
                      <div className="add-exercise-selector-box" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>➕ Add Exercise</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Type or search exercise (e.g. Bench, Squat, Cable...)"
                            id="planEditorCustomExercise"
                            list="plan-exercise-datalist"
                            style={{
                              flex: 1,
                              padding: '9px 12px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              color: '#fff',
                              fontSize: '0.82rem',
                              outline: 'none'
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && e.target.value.trim()) {
                                handleAddExerciseToEditor(e.target.value.trim());
                                e.target.value = '';
                              }
                            }}
                          />
                          <datalist id="plan-exercise-datalist">
                            {LIVE_EXERCISE_LIST.map(name => <option key={name} value={name} />)}
                          </datalist>
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById('planEditorCustomExercise');
                              const val = input?.value?.trim();
                              if (val) {
                                handleAddExerciseToEditor(val);
                                input.value = '';
                              }
                            }}
                            style={{
                              padding: '9px 14px',
                              background: 'rgba(16,185,129,0.12)',
                              border: '1px solid rgba(16,185,129,0.3)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--primary-accent-light)',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            + Add
                          </button>
                        </div>
                      </div>

                      {/* Editor actions */}
                      <div className="editor-actions-row" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button 
                          type="button"
                          onClick={() => {
                            setShowPlanEditor(false);
                            setEditingPlan(null);
                            setEditorPlanName('');
                            setEditorExercises([]);
                          }}
                          style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={handleSavePlan}
                          style={{ padding: '10px 16px', background: 'var(--primary-accent-light)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                          Save Plan
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* PLANS LIST VIEW */
                    <div className="plans-list-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Workout Plans</h4>
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingPlan(null);
                            setEditorPlanName('');
                            setEditorExercises([
                              { name: 'Bench Press', sets: [{ reps: 10, weight: 40 }] }
                            ]);
                            setShowPlanEditor(true);
                          }}
                          style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--primary-accent-light)', fontSize: '0.8rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        >
                          ➕ Create Workout Plan
                        </button>
                      </div>

                      {loadingPlans ? (
                        <div className="trainer-loading-container">
                          <div className="trainer-spinner"></div>
                        </div>
                      ) : clientPlans.length === 0 ? (
                        <div className="trainer-empty-state" style={{ padding: '30px' }}>
                          <span style={{ fontSize: '1.5rem' }}>📋</span>
                          <h5 style={{ marginTop: '8px' }}>No Plans Assigned</h5>
                          <p style={{ fontSize: '0.78rem' }}>Create custom routines/templates that client can start and repeat from their logger.</p>
                        </div>
                      ) : (
                        <div className="plans-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {clientPlans.map(plan => (
                            <div key={plan.id} className="plan-summary-card glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                              <div className="plan-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <strong style={{ fontSize: '0.9rem', color: '#fff', display: 'block' }}>{plan.planName}</strong>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>
                                    Created by: {plan.createdBy === 'coach' ? '🧑‍🏫 Coach' : '👤 Client'}
                                  </span>
                                </div>
                                <div className="plan-actions" style={{ display: 'flex', gap: '8px' }}>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      setEditingPlan(plan);
                                      setEditorPlanName(plan.planName);
                                      setEditorExercises(plan.exercises);
                                      setShowPlanEditor(true);
                                    }}
                                    style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={async () => {
                                      const duplicated = {
                                        planName: `${plan.planName} (Copy)`,
                                        exercises: plan.exercises,
                                        userId: selectedClient.id,
                                        createdBy: 'coach'
                                      };
                                      await databaseService.saveWorkoutPlan(duplicated);
                                      fetchClientPlans(selectedClient.id);
                                    }}
                                    style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    Duplicate
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={async () => {
                                      if (confirm('Delete this workout plan?')) {
                                        await databaseService.deleteWorkoutPlan(plan.id, selectedClient.id);
                                        fetchClientPlans(selectedClient.id);
                                      }
                                    }}
                                    style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              <div className="plan-exercises-preview" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {plan.exercises.map((ex, idx) => (
                                  <span key={idx} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '20px', color: 'var(--text-muted)' }}>
                                    {ex.name} ({ex.sets?.length || 0}s)
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── LIVE SESSION LOGGER TAB ─── */}
              {detailTab === 'livelog' && (
                <div className="live-logger-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Toast */}
                  {liveToast && (
                    <div style={{
                      padding: '10px 14px',
                      background: liveToast.startsWith('✅') ? 'rgba(16,185,129,0.15)' : liveToast.startsWith('⚠️') ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      border: `1px solid ${liveToast.startsWith('✅') ? 'rgba(16,185,129,0.3)' : liveToast.startsWith('⚠️') ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.82rem',
                      color: '#fff',
                      fontWeight: 600
                    }}>{liveToast}</div>
                  )}

                  {/* Session Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>🎯 Live Session</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logging for: <strong style={{ color: '#f59e0b' }}>{selectedClient?.userName}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Date:</label>
                      <input
                        type="date"
                        value={liveDate}
                        onChange={e => setLiveDate(e.target.value)}
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: '#fff',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Plan/Routine configuration */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Plan / Routine Name:</label>
                      <input
                        type="text"
                        placeholder="e.g. Upper Body, Leg Day"
                        value={livePlanName}
                        onChange={e => setLivePlanName(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: '#fff',
                          fontSize: '0.82rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                    {clientPlans.length > 0 && (
                      <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Load from Existing Plan:</label>
                        <select
                          defaultValue=""
                          onChange={e => {
                            const plan = clientPlans.find(p => p.id === e.target.value);
                            if (plan) {
                              setLivePlanName(plan.planName);
                              setLiveExercises(plan.exercises.map(ex => ({
                                name: ex.name,
                                sets: ex.sets.map(s => ({ reps: s.reps.toString(), weight: s.weight.toString(), isCompleted: false }))
                              })));
                              triggerLiveToast(`📋 Loaded exercises from "${plan.planName}"!`);
                            }
                            e.target.value = '';
                          }}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            color: '#fff',
                            fontSize: '0.82rem',
                            outline: 'none'
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

                  {/* Exercise List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {liveExercises.map((ex, exIdx) => (
                      <div key={exIdx} style={{
                        background: 'rgba(0,0,0,0.18)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px'
                      }}>
                        {/* Exercise Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#fff' }}>{ex.name}</span>
                          <button
                            onClick={() => handleLiveRemoveExercise(exIdx)}
                            style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >🗑️ Remove</button>
                        </div>

                        {/* Sets Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <th style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 4px', width: '15%' }}>Set</th>
                              <th style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 4px', width: '32%' }}>Weight (kg)</th>
                              <th style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 4px', width: '30%' }}>Reps</th>
                              <th style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 4px', width: '15%', textAlign: 'center' }}>Done</th>
                              <th style={{ width: '8%' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ex.sets.map((set, setIdx) => (
                              <tr key={setIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '5px 4px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '22px', height: '22px', borderRadius: '50%',
                                    background: set.isCompleted ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                                    color: set.isCompleted ? 'var(--primary-accent-light)' : '#fff',
                                    fontSize: '0.72rem', fontWeight: 800
                                  }}>{setIdx + 1}</span>
                                </td>
                                <td style={{ padding: '5px 4px' }}>
                                  <input
                                    type="number"
                                    value={set.weight}
                                    onChange={e => handleLiveSetChange(exIdx, setIdx, 'weight', e.target.value)}
                                    style={{
                                      width: '75px', padding: '4px 8px',
                                      background: 'rgba(255,255,255,0.03)',
                                      border: '1px solid var(--border-color)',
                                      borderRadius: '4px', color: '#fff', fontSize: '0.8rem'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '5px 4px' }}>
                                  <input
                                    type="number"
                                    value={set.reps}
                                    onChange={e => handleLiveSetChange(exIdx, setIdx, 'reps', e.target.value)}
                                    style={{
                                      width: '60px', padding: '4px 8px',
                                      background: 'rgba(255,255,255,0.03)',
                                      border: '1px solid var(--border-color)',
                                      borderRadius: '4px', color: '#fff', fontSize: '0.8rem'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => handleLiveToggleSet(exIdx, setIdx)}
                                    style={{
                                      width: '28px', height: '28px',
                                      borderRadius: '50%',
                                      border: set.isCompleted ? '2px solid var(--primary-accent-light)' : '2px solid rgba(255,255,255,0.2)',
                                      background: set.isCompleted ? 'rgba(16,185,129,0.2)' : 'transparent',
                                      color: set.isCompleted ? 'var(--primary-accent-light)' : 'rgba(255,255,255,0.3)',
                                      fontSize: '0.85rem',
                                      cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all 0.2s ease'
                                    }}
                                    title={set.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                                  >
                                    {set.isCompleted ? '✓' : '○'}
                                  </button>
                                </td>
                                <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                                  {ex.sets.length > 1 && (
                                    <button
                                      onClick={() => handleLiveRemoveSet(exIdx, setIdx)}
                                      style={{ color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >×</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <button
                          onClick={() => handleLiveAddSet(exIdx)}
                          style={{
                            marginTop: '8px',
                            padding: '5px 10px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 600
                          }}
                        >+ Add Set</button>
                      </div>
                    ))}
                  </div>

                  {/* Add Exercise — Autocomplete Input + Datalist */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>➕ Add Exercise to Session</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Type or search exercise (e.g. Bench, Squat, Cable...)"
                        value={liveCustomExercise}
                        list="live-exercise-datalist"
                        onChange={e => setLiveCustomExercise(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && liveCustomExercise.trim()) {
                            handleLiveAddExercise(liveCustomExercise.trim());
                            setLiveCustomExercise('');
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: '#fff',
                          fontSize: '0.82rem',
                          outline: 'none'
                        }}
                      />
                      <datalist id="live-exercise-datalist">
                        {LIVE_EXERCISE_LIST.map(name => <option key={name} value={name} />)}
                      </datalist>
                      <button
                        type="button"
                        onClick={() => {
                          const name = liveCustomExercise.trim();
                          if (name) {
                            handleLiveAddExercise(name);
                            setLiveCustomExercise('');
                          }
                        }}
                        style={{
                          padding: '9px 16px',
                          background: 'rgba(245,158,11,0.15)',
                          border: '1px solid rgba(245,158,11,0.35)',
                          borderRadius: 'var(--radius-sm)',
                          color: '#f59e0b',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSaveLiveSession}
                    disabled={liveSaving}
                    style={{
                      padding: '13px',
                      background: liveSaving ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: liveSaving ? 'default' : 'pointer',
                      transition: 'all 0.2s ease',
                      letterSpacing: '0.02em'
                    }}
                  >
                    {liveSaving ? '⏳ Saving...' : '💾 Save Workout Session'}
                  </button>
                </div>
              )}

            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TrainerDashboard;
