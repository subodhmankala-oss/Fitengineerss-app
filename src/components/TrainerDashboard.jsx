import React, { useState, useEffect, useRef } from 'react';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../services/databaseService';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';
import './TrainerDashboard.css';
import './WorkoutTracker.css';

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

  // Platform Admin: drill-down into a specific coach's actual client list
  const [drilldownCoach, setDrilldownCoach] = useState(null);
  const [drilldownClients, setDrilldownClients] = useState([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  const handleViewCoachClients = async (coach) => {
    setDrilldownCoach(coach);
    setLoadingDrilldown(true);
    try {
      const clients = await databaseService.getClientsForCoach(coach.id);
      setDrilldownClients(clients || []);
    } catch (e) {
      console.error('Error fetching clients for coach:', e);
      setDrilldownClients([]);
    } finally {
      setLoadingDrilldown(false);
    }
  };

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
      setLoadingUsers(true);
      const allUsers = await databaseService.getAllUsersWithRoles();
      setAllUsersList(allUsers || []);
      setLoadingUsers(false);
    } catch (e) {
      console.error('Error fetching admin data:', e);
      setLoadingUsers(false);
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

  const handleToggleCoachBlock = async (coach) => {
    const blocking = !coach.isBlocked;
    if (!window.confirm(
      blocking
        ? `Block ${coach.name || coach.email}? They will be signed out and unable to log in until unblocked.`
        : `Unblock ${coach.name || coach.email}? They will regain access on next login.`
    )) {
      return;
    }
    try {
      await databaseService.setCoachBlocked(coach.id, blocking);
      await fetchAdminData();
    } catch (err) {
      console.error('Error toggling coach block:', err);
      alert(err.message || 'Failed to update coach access.');
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
    const loadActiveInviteCode = async () => {
      try {
        const coachId = localStorage.getItem('userId') || loggedInEmail;
        if (coachId) {
          const activeCodeObj = await databaseService.getActiveCoachInviteCode(coachId);
          if (activeCodeObj && activeCodeObj.code) {
            setGeneratedInviteCode(activeCodeObj.code);
            localStorage.setItem('last_generated_invite_code', activeCodeObj.code);
          } else {
            setGeneratedInviteCode('');
            localStorage.removeItem('last_generated_invite_code');
          }
        }
      } catch (err) {
        console.error('Error fetching active invitation code:', err);
      }
    };
    
    if (viewMode !== 'admin') {
      loadActiveInviteCode();
    }
  }, [viewMode, loggedInEmail]);

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
  const [workoutSummary, setWorkoutSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('All');
  const [generatedInviteCode, setGeneratedInviteCode] = useState(() => localStorage.getItem('last_generated_invite_code') || '');
  const [generatingCode, setGeneratingCode] = useState(false);
  
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
  const [liveDate, setLiveDate] = useState(() => getLocalDateString());
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
      setLiveDate(getLocalDateString());
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

  // Fetch all clients on mount and set up real-time listener
  useEffect(() => {
    const fetchClients = async () => {
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

    const fetchSummary = async () => {
      try {
        const summary = await databaseService.getWorkoutSummaryForCoach();
        setWorkoutSummary(summary || []);
      } catch (err) {
        console.error('Error fetching workout summary:', err);
      } finally {
        setLoadingSummary(false);
      }
    };

    setLoadingClients(true);
    setLoadingSummary(true);
    fetchClients();
    fetchSummary();

    let channel = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      console.log('[DEBUG] Trainer Dashboard: Subscribing to real-time client & user updates...');
      channel = databaseService.supabase
        .channel('trainer-clients-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
          console.log('[DEBUG] Trainer Dashboard: Real-time clients table change:', payload);
          fetchClients();
          fetchSummary();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
          console.log('[DEBUG] Trainer Dashboard: Real-time users table change:', payload);
          fetchClients();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, (payload) => {
          console.log('[DEBUG] Trainer Dashboard: Real-time workout_logs change:', payload);
          fetchSummary();
        })
        .subscribe();
    }

    return () => {
      if (channel && databaseService.supabase) {
        console.log('[DEBUG] Trainer Dashboard: Unsubscribing real-time channel.');
        databaseService.supabase.removeChannel(channel);
      }
    };
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

          {/* Coaches Table Card */}
          <div className="glass-panel" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            overflowX: 'auto'
          }}>
            <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>Coaches ({coachesList.length})</h5>

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
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '620px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coach</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Brand</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Experience</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Clients</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Access</th>
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
                      <td style={{ padding: '8px', fontSize: '0.8rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {(coach.experienceYears ?? null) !== null ? `${coach.experienceYears} yrs` : '—'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleViewCoachClients(coach)}
                          title="View this coach's clients"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-accent-light)',
                            textDecoration: 'underline', padding: 0
                          }}
                        >
                          {coach.clientsCount}
                        </button>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: coach.isBlocked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: coach.isBlocked ? 'var(--danger)' : '#10b981',
                          border: `1px solid ${coach.isBlocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`
                        }}>
                          {coach.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {coach.email && coach.email.toLowerCase() === 'subodhmankala@gmail.com' ? (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <button
                            onClick={() => handleToggleCoachBlock(coach)}
                            style={{
                              background: coach.isBlocked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                              border: `1px solid ${coach.isBlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                              color: coach.isBlocked ? '#10b981' : 'var(--danger)',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {coach.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Coach Client Drill-down Modal */}
          {drilldownCoach && (
            <div
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.6)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
              }}
              onClick={() => setDrilldownCoach(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '14px', padding: '20px', maxWidth: '600px', width: '100%',
                  maxHeight: '80vh', overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>{drilldownCoach.name}'s Clients</h4>
                  <button
                    type="button"
                    onClick={() => setDrilldownCoach(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}
                  >✕</button>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{drilldownCoach.email}</p>

                {loadingDrilldown ? (
                  <div className="trainer-loading-container" style={{ padding: '30px 0' }}>
                    <div className="trainer-spinner"></div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading clients...</p>
                  </div>
                ) : drilldownClients.length === 0 ? (
                  <div className="trainer-empty-state">
                    <h5>No Clients Yet</h5>
                    <p>This coach has no clients attached via invite code yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {drilldownClients.map(client => (
                      <div
                        key={client.id}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)',
                          borderRadius: '10px', padding: '10px 14px'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{client.userName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{client.email}</div>
                        </div>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-accent-light)',
                          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                          borderRadius: '12px', padding: '3px 10px'
                        }}>
                          {client.userGoal || 'No goal set'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clients Directory Card (platform-wide, includes unattached/generic clients) */}
          <div className="glass-panel" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            overflowX: 'auto',
            marginTop: '20px'
          }}>
            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>Clients ({filteredClients.length})</h5>

            {/* Goal filter pills (same as My Clients) */}
            <div className="filter-tags" style={{ marginBottom: '14px' }}>
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

            {loadingClients ? (
              <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
                <div className="trainer-spinner"></div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading clients list...</p>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="trainer-empty-state">
                <h5>No Clients Found</h5>
                <p>No client profiles match the current filter.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '520px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Name</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Goal</th>
                    <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Coach</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(client => (
                    <tr key={client.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '48px' }}>
                      <td style={{ padding: '8px', fontSize: '0.82rem', fontWeight: 600 }}>{client.userName}</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{client.email}</td>
                      <td style={{ padding: '8px', fontSize: '0.78rem' }}>{client.userGoal || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: '12px',
                          fontSize: '0.68rem', fontWeight: 700,
                          background: client.coach_id ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                          color: client.coach_id ? '#10b981' : 'var(--text-muted)',
                          border: `1px solid ${client.coach_id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`
                        }}>
                          {client.coach_id ? 'Attached' : 'Generic'}
                        </span>
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
                flexDirection: 'column', gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h5 style={{ margin: '0 0 8px 0', color: '#fff' }}>Invite Clients</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Generate a unique code for your clients to link their accounts to you during sign up.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (generatingCode) return;
                      
                      const coachId = localStorage.getItem('userId') || loggedInEmail;
                      
                      if (generatedInviteCode) {
                        const confirmRegen = window.confirm(
                          `You already have an active invitation code (${generatedInviteCode}).\n\n` +
                          "Generating a new code will automatically deactivate the old one. " +
                          "Clients attempting to link using the previous code will be rejected.\n\n" +
                          "Do you want to proceed and generate a new code?"
                        );
                        if (!confirmRegen) return;
                      }

                      setGeneratingCode(true);
                      try {
                        // Deactivate old active invitation codes first
                        await databaseService.deactivateActiveCoachInviteCodes(coachId);

                        const code = await databaseService.generateCoachInviteCode(coachId);
                        setGeneratedInviteCode(code);
                        localStorage.setItem('last_generated_invite_code', code);
                      } catch (err) {
                        console.error('Error generating code:', err);
                        setGeneratedInviteCode('');
                        localStorage.removeItem('last_generated_invite_code');
                        alert(err.message || 'Could not generate an invitation code. Please try again.');
                      } finally {
                        setGeneratingCode(false);
                      }
                    }}
                    disabled={generatingCode}
                    style={{
                      background: 'var(--primary-accent-light)', border: 'none', color: '#fff',
                      padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer',
                      whiteSpace: 'nowrap', marginLeft: '12px', opacity: generatingCode ? 0.6 : 1
                    }}
                  >
                    {generatingCode ? 'Generating...' : 'Generate Code'}
                  </button>
                </div>

                {generatedInviteCode && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    marginTop: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Active Code:</span>
                      <strong style={{
                        fontSize: '1.25rem',
                        color: 'var(--primary-accent-light)',
                        letterSpacing: '0.1em',
                        background: 'rgba(59, 130, 246, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>{generatedInviteCode}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {/* Copy Button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedInviteCode);
                          alert('Code copied to clipboard!');
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: 'none',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        📋 Copy Code
                      </button>

                      {/* WhatsApp Share Button */}
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent("Hi! I'm Subodh from Fitengineers. Use this invitation code to join my coaching program: " + generatedInviteCode)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#25D366',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 5px rgba(37, 211, 102, 0.2)'
                        }}
                      >
                        {/* Inline WhatsApp SVG Icon */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.135-3.834c1.674.993 3.502 1.517 5.38 1.519 5.867 0 10.638-4.771 10.642-10.639.002-2.842-1.102-5.514-3.109-7.524C17.1 1.512 14.428.406 11.587.406 5.72 1.406.953 6.177.949 12.045c-.001 1.99.524 3.931 1.519 5.626L1.519 22l4.673-1.226zM17.43 14.73c-.296-.149-1.758-.868-2.03-.967-.272-.099-.47-.149-.667.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.174.2-.298.3-.496.099-.198.05-.371-.025-.521-.075-.148-.667-1.609-.914-2.203-.241-.579-.487-.501-.668-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z"/>
                        </svg>
                        Share via WhatsApp
                      </a>
                    </div>
                  </div>
                )}
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{client.userName}</span>
                                <span style={{
                                  display: 'inline-block', width: 'fit-content', padding: '1px 7px', borderRadius: '10px',
                                  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                                  background: client.coach_id ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                                  color: client.coach_id ? '#10b981' : 'var(--text-muted)',
                                  border: `1px solid ${client.coach_id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`
                                }}>
                                  {client.coach_id ? 'Attached' : 'Generic'}
                                </span>
                              </div>
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

              {/* ── Workout Summary ── recent activity for THIS coach's attached clients only */}
              <h4 className="client-directory-title" style={{ marginTop: '28px' }}>
                Workout Summary
              </h4>
              {loadingSummary ? (
                <div className="trainer-loading-container">
                  <div className="trainer-spinner"></div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading recent workout activity...</p>
                </div>
              ) : workoutSummary.length === 0 ? (
                <div className="trainer-empty-state">
                  <div className="trainer-empty-icon">🏋️</div>
                  <h5>No Workout Activity Yet</h5>
                  <p>When your connected clients log or complete a workout, it will appear here.</p>
                </div>
              ) : (
                <div className="glass-panel" style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px',
                  overflowX: 'auto'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', minWidth: '560px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Workout</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Date</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Exercises</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Sets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workoutSummary.map((row, idx) => (
                        <tr key={`${row.clientId}-${row.date}-${row.workoutName}-${idx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '52px' }}>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                className="client-avatar"
                                style={{
                                  backgroundColor: getAvatarColor(row.clientName),
                                  width: '30px', height: '30px', borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.72rem', fontWeight: 'bold', color: '#fff', flexShrink: 0
                                }}
                              >
                                {getAvatarInitials(row.clientName)}
                              </div>
                              <span style={{ fontSize: '0.83rem', fontWeight: 600 }}>{row.clientName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.workoutName}</td>
                          <td style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {parseLocalDateString(row.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '8px', fontSize: '0.82rem', textAlign: 'center', fontWeight: 700 }}>{row.exercises}</td>
                          <td style={{ padding: '8px', fontSize: '0.82rem', textAlign: 'center', fontWeight: 700 }}>{row.sets}</td>
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
                                          style={{ width: '80%', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '16px' }}
                                        />
                                      </td>
                                      <td style={{ padding: '6px 4px' }}>
                                        <input
                                          type="number"
                                          value={set.reps}
                                          onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'reps', e.target.value)}
                                          style={{ width: '80%', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '16px' }}
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
                              fontSize: '16px',
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
                      ) : clientPlans.filter(p => p.createdBy === 'coach').length === 0 ? (
                        <div className="trainer-empty-state" style={{ padding: '30px' }}>
                          <span style={{ fontSize: '1.5rem' }}>📋</span>
                          <h5 style={{ marginTop: '8px' }}>No Plans Assigned</h5>
                          <p style={{ fontSize: '0.78rem' }}>Create custom routines/templates that client can start and repeat from their logger.</p>
                        </div>
                      ) : (
                        <div className="plans-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {clientPlans.filter(p => p.createdBy === 'coach').map(plan => (
                            <div key={plan.id} className="plan-summary-card glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                              <div className="plan-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <strong style={{ fontSize: '0.9rem', color: '#fff', display: 'block' }}>{plan.planName}</strong>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>
                                    📋 Assigned to: {selectedClient.userName}
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
                          fontSize: '16px',
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

                  {/* Exercise List — edge-to-edge: bleeds past the dashboard's
                      16px outer padding so the table reaches the true screen
                      edges, matching the app's standard flush logging layout. */}
                  <div className="live-logger-exercise-list">
                    {liveExercises.map((ex, exIdx) => (
                      <div key={exIdx} className="live-logger-exercise-card">
                        {/* Exercise Header */}
                        <div className="live-logger-ex-header">
                          <span className="live-logger-ex-name">{ex.name}</span>
                          <button
                            onClick={() => handleLiveRemoveExercise(exIdx)}
                            style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >🗑️ Remove</button>
                        </div>

                        {/* Sets Table */}
                        <div className="hevy-sets-table cols-4">
                          <div className="hevy-table-header">
                            <span className="col-set">SET</span>
                            <span className="col-weight">WEIGHT (KG)</span>
                            <span className="col-reps">REPS</span>
                            <span className="col-check">DONE</span>
                          </div>
                          <div className="hevy-table-body">
                            {ex.sets.map((set, setIdx) => (
                              <div key={setIdx} className={`hevy-set-row cols-4 ${set.isCompleted ? 'set-row-completed' : ''}`}>
                                <span className="col-set set-num-lbl">{setIdx + 1}</span>
                                <div className="col-weight set-input-field">
                                  <input
                                    type="number"
                                    value={set.weight}
                                    onChange={e => handleLiveSetChange(exIdx, setIdx, 'weight', e.target.value)}
                                  />
                                </div>
                                <div className="col-reps set-input-field">
                                  <input
                                    type="number"
                                    value={set.reps}
                                    onChange={e => handleLiveSetChange(exIdx, setIdx, 'reps', e.target.value)}
                                  />
                                </div>
                                <div className="col-check set-actions-field">
                                  <button
                                    type="button"
                                    className={`btn-hevy-check ${set.isCompleted ? 'completed' : ''}`}
                                    onClick={() => handleLiveToggleSet(exIdx, setIdx)}
                                    title={set.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                                  >
                                    {set.isCompleted ? '✓' : ''}
                                  </button>
                                  {ex.sets.length > 1 && (
                                    <button
                                      type="button"
                                      className="btn-hevy-row-delete"
                                      onClick={() => handleLiveRemoveSet(exIdx, setIdx)}
                                      title="Delete Set"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleLiveAddSet(exIdx)}
                          className="btn-add-set-link live-logger-add-set"
                        >➕ Add Set</button>
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
                          fontSize: '16px',
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
