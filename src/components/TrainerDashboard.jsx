import React, { useState, useEffect, useRef } from 'react';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../services/databaseService';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';
import './TrainerDashboard.css';
import './WorkoutTracker.css';
import SetTypeMenu, { getSetTypeVisual } from './SetTypeMenu';
import ExercisePickerModal from './ExercisePickerModal';


const TrainerDashboard = ({ handleLogout }) => {
  const loggedInEmail = localStorage.getItem('userEmail') || '';
  const userRole = localStorage.getItem('userRole') || '';
  const superAdmin = isSuperAdmin(loggedInEmail) || userRole === 'super-admin' || userRole === 'admin';
  const [viewMode, setViewMode] = useState('coach'); // 'coach' or 'admin'
  const [adminSubTab, setAdminSubTab] = useState('clients'); // 'clients' or 'coaches'
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

  // Coaching program length (clients.total_sessions) editor for the selected client
  const [totalSessionsInput, setTotalSessionsInput] = useState('');
  const [savingTotalSessions, setSavingTotalSessions] = useState(false);
  // Inline confirmation for the Program Total Sessions save — the panel sits
  // above the tab bar and is visible on every tab, but `liveToast` only
  // renders inside the Live Log tab, so a save on another tab looked like it
  // did nothing. This message is local to the panel and always visible.
  const [totalSessionsSaveMsg, setTotalSessionsSaveMsg] = useState('');
  // The exact input value that was last saved successfully. While the input
  // still matches it, the Save button locks into a disabled "✓ Saved" state
  // (not clickable, not highlighted); editing the input to any other value
  // clears this and the button goes back to its normal clickable "Save" state.
  const [totalSessionsSavedValue, setTotalSessionsSavedValue] = useState(null);
  
  // Selected client workout plans state
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editorPlanName, setEditorPlanName] = useState('');
  const [editorExercises, setEditorExercises] = useState([]);
  // Which surface opened the shared exercise picker: 'editor' | 'live' | null
  const [exercisePickerContext, setExercisePickerContext] = useState(null);

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
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveToast, setLiveToast] = useState('');
  const [liveSetTypeMenu, setLiveSetTypeMenu] = useState(null);
  // Set type popup in the Plan Editor: { exIdx, setIdx } when open, null when closed
  const [editorSetTypeMenu, setEditorSetTypeMenu] = useState(null);

  useEffect(() => {
    if (!liveSetTypeMenu) return;
    const close = () => setLiveSetTypeMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [liveSetTypeMenu]);

  useEffect(() => {
    if (!editorSetTypeMenu) return;
    const close = () => setEditorSetTypeMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [editorSetTypeMenu]);

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

  const handleLiveChangeSetType = (exIdx, setIdx, type) => {
    if (type === 'remove') {
      handleLiveRemoveSet(exIdx, setIdx);
      setLiveSetTypeMenu(null);
      return;
    }
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => {
          if (si !== setIdx) return s;
          return { ...s, isWarmup: type === 'warmup', setType: type };
        })
      };
    }));
    setLiveSetTypeMenu(null);
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
          weight: parseFloat(s.weight) || 0,
          // Preserve the Warmup/Dropset/Failure tag chosen in the live logger
          // so it reaches workout_logs.set_type instead of being discarded.
          ...(s.isWarmup ? { setType: 'warmup' } : {}),
          ...(s.setType && s.setType !== 'normal' && !s.isWarmup ? { setType: s.setType } : {})
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

  // Coach sets this client's coaching-program length. Persisted via the
  // coach↔client-scoped RPC; drives the client's home progress card.
  const handleSaveTotalSessions = async () => {
    if (!selectedClient) return;
    const parsed = parseInt(totalSessionsInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setTotalSessionsSaveMsg('⚠️ Enter a valid number of sessions (1 or more).');
      setTimeout(() => setTotalSessionsSaveMsg(''), 3500);
      return;
    }
    setSavingTotalSessions(true);
    setTotalSessionsSaveMsg('');
    try {
      const result = await databaseService.setClientTotalSessions(selectedClient.id, parsed);
      if (result.success) {
        setSelectedClient(prev => prev ? { ...prev, total_sessions: parsed } : prev);
        setClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, total_sessions: parsed } : c));
        setTotalSessionsSaveMsg(`✅ Saved — ${parsed} sessions`);
        setTotalSessionsSavedValue(totalSessionsInput);
      } else {
        setTotalSessionsSaveMsg('❌ ' + (result.error || 'Could not save program length.'));
      }
    } catch (e) {
      console.error('Error saving total sessions:', e);
      setTotalSessionsSaveMsg('❌ Could not save program length. Please try again.');
    } finally {
      setSavingTotalSessions(false);
      setTimeout(() => setTotalSessionsSaveMsg(''), 3500);
    }
  };

  // Fetch client workout logs when a client is selected
  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setDetailTab('plans');
    setTotalSessionsInput(client.total_sessions != null ? String(client.total_sessions) : '');
    // Reset the save-lock so a coincidental value match with the previous
    // client doesn't falsely show "✓ Saved" for this one.
    setTotalSessionsSavedValue(null);
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
                        plan_name: sess.planName || sess.plan_name || 'Custom Routine',
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
                        plan_name: sess.planName || sess.plan_name || 'Custom Routine',
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
    const planNames = {};

    logs.forEach(log => {
      const date = log.log_date;
      if (!datesMap[date]) {
        datesMap[date] = {};
      }
      // Prefer a real workout name; only fall back to (or keep) 'Custom Routine'
      // when no named entry exists for the date.
      const incomingName = log.plan_name || log.planName;
      if (incomingName && (!planNames[date] || planNames[date] === 'Custom Routine')) {
        planNames[date] = incomingName;
      }

      const exercise = log.exercise_name;
      if (!datesMap[date][exercise]) {
        datesMap[date][exercise] = [];
      }
      
      datesMap[date][exercise].push({
        setNumber: log.set_number,
        reps: log.reps,
        weight: log.weight_kg,
        setType: log.set_type || null,
        isWarmup: log.set_type === 'warmup'
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
          planName: planNames[dateStr] || 'Custom Routine',
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
        weight: parseFloat(s.weight) || 0,
        ...(s.isWarmup ? { isWarmup: true } : {}),
        ...(s.setType && s.setType !== 'normal' ? { setType: s.setType } : {})
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

  const handleEditorChangeSetType = (exIdx, setIdx, type) => {
    if (type === 'remove') {
      handleRemoveSetFromExercise(exIdx, setIdx);
      setEditorSetTypeMenu(null);
      return;
    }
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => (
          si !== setIdx ? s : { ...s, isWarmup: type === 'warmup', setType: type }
        ))
      };
    }));
    setEditorSetTypeMenu(null);
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
  const loggedInUserId = localStorage.getItem('userId');
  const filteredClients = clients.filter(c => {
    // In coach view: super-admin only sees their own attached clients (not generics or other coaches' clients)
    if (superAdmin && viewMode === 'coach' && c.coach_id !== loggedInUserId) return false;

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
            <span style={{
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Coach Dashboard
            </span>
            <h3 style={{ margin: 0, lineHeight: 1.2 }}>{localStorage.getItem('userName') || 'Coach'}</h3>
            <span style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginTop: '3px'
            }}>
              {localStorage.getItem('userBrand') || 'Fit Engineers'}
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
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '4px',
          marginBottom: '20px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
        }}>
          <button
            onClick={() => { setViewMode('coach'); setSelectedClient(null); }}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '10px',
              border: 'none',
              background: viewMode === 'coach' ? 'rgba(16,185,129,0.14)' : 'transparent',
              color: viewMode === 'coach' ? '#10b981' : 'rgba(148,163,184,0.55)',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              boxShadow: viewMode === 'coach' ? '0 1px 8px rgba(16,185,129,0.15)' : 'none',
              letterSpacing: '0.01em',
            }}
          >
            👥 My Clients
          </button>
          <button
            onClick={() => { setViewMode('admin'); setSelectedClient(null); }}
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: '10px',
              border: 'none',
              background: viewMode === 'admin' ? 'rgba(139,92,246,0.14)' : 'transparent',
              color: viewMode === 'admin' ? '#a78bfa' : 'rgba(148,163,184,0.55)',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              boxShadow: viewMode === 'admin' ? '0 1px 8px rgba(139,92,246,0.15)' : 'none',
              letterSpacing: '0.01em',
            }}
          >
            🛡️ Super-Admin
          </button>
        </div>
      )}

      {viewMode === 'admin' ? (
        <div className="platform-admin-view animate-scale-in" style={{ margin: '0 -16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px' }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Super-Admin Overview</h4>
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

          {/* Admin Sub-tabs: Total Clients | Total Coaches */}
          <div style={{
            display: 'flex', gap: '8px', padding: '4px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px', margin: '0 16px'
          }}>
            <button
              onClick={() => setAdminSubTab('clients')}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: '10px', border: 'none',
                background: adminSubTab === 'clients' ? 'rgba(16,185,129,0.14)' : 'transparent',
                color: adminSubTab === 'clients' ? '#10b981' : 'rgba(148,163,184,0.55)',
                fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: 'inherit', letterSpacing: '0.01em',
                boxShadow: adminSubTab === 'clients' ? '0 1px 8px rgba(16,185,129,0.15)' : 'none'
              }}
            >
              👥 Total Clients
              <span style={{
                marginLeft: '8px', fontSize: '0.82rem', fontWeight: 700,
                color: adminSubTab === 'clients' ? '#10b981' : 'rgba(148,163,184,0.4)'
              }}>
                {platformStats.totalActiveClients}
              </span>
            </button>
            <button
              onClick={() => setAdminSubTab('coaches')}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: '10px', border: 'none',
                background: adminSubTab === 'coaches' ? 'rgba(245,158,11,0.14)' : 'transparent',
                color: adminSubTab === 'coaches' ? '#f59e0b' : 'rgba(148,163,184,0.55)',
                fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: 'inherit', letterSpacing: '0.01em',
                boxShadow: adminSubTab === 'coaches' ? '0 1px 8px rgba(245,158,11,0.15)' : 'none'
              }}
            >
              🏋️ Total Coaches
              <span style={{
                marginLeft: '8px', fontSize: '0.82rem', fontWeight: 700,
                color: adminSubTab === 'coaches' ? '#f59e0b' : 'rgba(148,163,184,0.4)'
              }}>
                {coachesList.length}
              </span>
            </button>
          </div>

          {/* Sub-tab content */}
          {adminSubTab === 'coaches' ? (
            <>
              {/* Coaches Table Card */}
              <div className="glass-panel" style={{
                background: 'var(--bg-card)',
                borderTop: '1px solid var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
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
            </>
          ) : (
            /* Clients Directory (platform-wide, includes unattached/generic clients) */
            <div className="glass-panel" style={{
              background: 'var(--bg-card)',
              borderTop: '1px solid var(--border-color)',
              borderBottom: '1px solid var(--border-color)',
              padding: '16px',
              overflowX: 'auto'
            }}>
              <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>All Clients ({clients.length})</h5>

              {/* Goal filter pills */}
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
              ) : clients.filter(c => goalFilter === 'All' || c.userGoal === goalFilter).length === 0 ? (
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
                    {clients
                      .filter(c => goalFilter === 'All' || c.userGoal === goalFilter)
                      .map(client => (
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
          )}
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

              {/* Coaching Program Length — coach-set total sessions that drives the
                  "Coaching Program Progress" card on this client's home screen.
                  Only shown for clients attached to the logged-in coach; the RPC
                  re-checks that relationship server-side on save. */}
              {selectedClient.coach_id === loggedInUserId && (
                <div className="glass-panel" style={{
                  padding: '14px 16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: '12px',
                  background: 'rgba(139, 92, 246, 0.06)'
                }}>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                      🎯 Program Total Sessions
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {selectedClient.total_sessions != null
                        ? `Currently ${selectedClient.total_sessions} sessions — shown on ${selectedClient.userName}'s progress card.`
                        : 'Not set yet — the client sees a "waiting on your coach" state until you set it.'}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 24"
                    value={totalSessionsInput}
                    onChange={(e) => {
                      setTotalSessionsInput(e.target.value);
                      // Editing after a save unlocks the button again.
                      if (totalSessionsSavedValue !== null) setTotalSessionsSavedValue(null);
                    }}
                    disabled={savingTotalSessions}
                    style={{
                      width: '90px',
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: '#fff',
                      // Must stay >= 16px: iOS Safari auto-zooms the whole page
                      // on focus for any input with a smaller font-size.
                      fontSize: '16px',
                      fontWeight: 700
                    }}
                  />
                  {(() => {
                    const isSavedLocked = totalSessionsSavedValue !== null && totalSessionsSavedValue === totalSessionsInput;
                    const isDisabled = savingTotalSessions || isSavedLocked || !totalSessionsInput.trim();
                    const label = savingTotalSessions ? 'Saving…' : isSavedLocked ? '✓ Saved' : 'Save';
                    return (
                      <button
                        onClick={handleSaveTotalSessions}
                        disabled={isDisabled}
                        style={{
                          padding: '8px 16px',
                          background: isSavedLocked
                            ? 'rgba(255,255,255,0.05)'
                            : savingTotalSessions
                              ? 'rgba(139, 92, 246, 0.4)'
                              : 'var(--primary-accent, #8b5cf6)',
                          border: isSavedLocked ? '1px solid rgba(255,255,255,0.08)' : 'none',
                          borderRadius: '8px',
                          color: isSavedLocked ? 'var(--text-muted)' : '#fff',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: isDisabled ? 'default' : 'pointer'
                        }}
                      >
                        {label}
                      </button>
                    );
                  })()}
                  {totalSessionsSaveMsg && (
                    <div style={{
                      width: '100%',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: totalSessionsSaveMsg.startsWith('✅') ? '#34d399' : totalSessionsSaveMsg.startsWith('⚠️') ? '#f59e0b' : '#f87171'
                    }}>
                      {totalSessionsSaveMsg}
                    </div>
                  )}
                </div>
              )}

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
                            <div className="session-heading-text">
                              <span className="session-plan-name">{session.planName || 'Custom Routine'}</span>
                              <span className="session-date-sub">
                                {new Date(session.date).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
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
                                    {exercise.sets.map((set, setIdx) => {
                                      // Sequential number among normal working sets only —
                                      // matches the Live Log / Plan editor's badge logic.
                                      const workingNum = exercise.sets.slice(0, setIdx + 1)
                                        .filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                                      const visual = getSetTypeVisual(set, workingNum);
                                      return (
                                        <tr key={setIdx}>
                                          <td>
                                            <span
                                              className="set-num-badge"
                                              style={visual.color ? { color: visual.color, borderColor: `${visual.color}55`, background: `${visual.color}22` } : undefined}
                                            >
                                              {visual.label}
                                            </span>
                                          </td>
                                          <td>{set.weight} kg</td>
                                          <td>{set.reps} reps</td>
                                        </tr>
                                      );
                                    })}
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

                      {/* Exercises in the editor — matches the Live Log's Hevy-style
                          layout (flush cards, styled set rows, set-type badges). */}
                      <div className="editor-exercises-list" style={{ marginBottom: '16px' }}>
                        <h5 style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Exercises</h5>

                        {editorExercises.length === 0 ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No exercises added to this plan yet. Use the dropdown below to add exercises.</p>
                        ) : (
                          <div className="live-logger-exercise-list">
                            {editorExercises.map((ex, exIdx) => (
                              <div key={exIdx} className="live-logger-exercise-card">
                                <div className="live-logger-ex-header">
                                  <span className="live-logger-ex-name">{ex.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExerciseFromEditor(exIdx)}
                                    style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                  >🗑️ Remove</button>
                                </div>

                                <div className="hevy-sets-table cols-4">
                                  <div className="hevy-table-header">
                                    <span className="col-set">SET</span>
                                    <span className="col-weight">WEIGHT (KG)</span>
                                    <span className="col-reps">REPS</span>
                                    <span className="col-check"></span>
                                  </div>
                                  <div className="hevy-table-body">
                                    {ex.sets.map((set, setIdx) => {
                                      const workingNum = ex.sets.slice(0, setIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                                      const label = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.isWarmup ? 'W' : workingNum;
                                      return (
                                      <div key={setIdx} className={`hevy-set-row cols-4 ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}>
                                        <span className="col-set set-type-menu-wrapper">
                                          <span
                                            className={`set-num-lbl ${set.isWarmup ? 'warmup' : ''} ${set.setType === 'failure' ? 'failure' : ''} ${set.setType === 'drop' ? 'drop' : ''}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditorSetTypeMenu(prev => (prev?.exIdx === exIdx && prev?.setIdx === setIdx) ? null : { exIdx, setIdx });
                                            }}
                                            role="button"
                                            title="Change set type"
                                          >
                                            {label}
                                          </span>
                                          {editorSetTypeMenu?.exIdx === exIdx && editorSetTypeMenu?.setIdx === setIdx && (
                                            <SetTypeMenu onSelect={(type) => handleEditorChangeSetType(exIdx, setIdx, type)} />
                                          )}
                                        </span>
                                        <div className="col-weight set-input-field">
                                          <input
                                            type="number"
                                            value={set.weight}
                                            onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'weight', e.target.value)}
                                          />
                                        </div>
                                        <div className="col-reps set-input-field">
                                          <input
                                            type="number"
                                            value={set.reps}
                                            onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'reps', e.target.value)}
                                          />
                                        </div>
                                        <div className="col-check set-actions-field">
                                          {ex.sets.length > 1 && (
                                            <button
                                              type="button"
                                              className="btn-hevy-row-delete"
                                              onClick={() => handleRemoveSetFromExercise(exIdx, setIdx)}
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

                                <button
                                  type="button"
                                  onClick={() => handleAddSetToExercise(exIdx)}
                                  className="btn-add-set-link live-logger-add-set"
                                >➕ Add Set</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Exercise — opens the shared Hevy-style picker (same as client) */}
                      <div className="add-exercise-selector-box" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginBottom: '24px' }}>
                        <button
                          type="button"
                          className="btn-secondary-sm btn-add-hevy-ex"
                          onClick={() => setExercisePickerContext('editor')}
                        >
                          ➕ Add Exercise
                        </button>
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
                            {ex.sets.map((set, setIdx) => {
                              const liveWorkingNum = ex.sets.slice(0, setIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                              const liveLabel = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.isWarmup ? 'W' : liveWorkingNum;
                              return (
                              <div key={setIdx} className={`hevy-set-row cols-4 ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}>
                                <span className="col-set set-type-menu-wrapper">
                                  <span
                                    className={`set-num-lbl ${set.isWarmup ? 'warmup' : ''} ${set.setType === 'failure' ? 'failure' : ''} ${set.setType === 'drop' ? 'drop' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLiveSetTypeMenu(prev => (prev?.exIdx === exIdx && prev?.setIdx === setIdx) ? null : { exIdx, setIdx });
                                    }}
                                    role="button"
                                    title="Change set type"
                                  >
                                    {liveLabel}
                                  </span>
                                  {liveSetTypeMenu?.exIdx === exIdx && liveSetTypeMenu?.setIdx === setIdx && (
                                    <SetTypeMenu onSelect={(type) => handleLiveChangeSetType(exIdx, setIdx, type)} />
                                  )}
                                </span>
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
                              );
                            })}
                          </div>
                        </div>

                        <button
                          onClick={() => handleLiveAddSet(exIdx)}
                          className="btn-add-set-link live-logger-add-set"
                        >➕ Add Set</button>
                      </div>
                    ))}
                  </div>

                  {/* Add Exercise — opens the shared Hevy-style picker (same as client) */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>➕ Add Exercise to Session</div>
                    <button
                      type="button"
                      className="btn-secondary-sm btn-add-hevy-ex"
                      onClick={() => setExercisePickerContext('live')}
                    >
                      ➕ Add Exercise
                    </button>
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

      {/* Shared Hevy-style exercise picker (identical to the client side) */}
      <ExercisePickerModal
        open={!!exercisePickerContext}
        onClose={() => setExercisePickerContext(null)}
        addedNames={(exercisePickerContext === 'editor' ? editorExercises : liveExercises).map(e => e.name)}
        onAdd={(name) => {
          if (exercisePickerContext === 'editor') handleAddExerciseToEditor(name);
          else handleLiveAddExercise(name);
        }}
        onRemove={(name) => {
          const notName = (e) => e.name.toLowerCase() !== name.toLowerCase();
          if (exercisePickerContext === 'editor') setEditorExercises(prev => prev.filter(notName));
          else setLiveExercises(prev => prev.filter(notName));
        }}
      />
    </div>
  );
};

export default TrainerDashboard;
