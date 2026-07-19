import React, { useState, useEffect, useRef } from 'react';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../services/databaseService';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';
import './TrainerDashboard.css';
import AdminExerciseLibrary from './AdminExerciseLibrary';
import AdminCoachesList from './admin/AdminCoachesList';
import AdminClientsList from './admin/AdminClientsList';
import './WorkoutTracker.css';
import SetTypeMenu, { getSetTypeVisual } from './SetTypeMenu';
import ExercisePickerModal from './ExercisePickerModal';
import { computeElapsedSeconds, computeLiveCalories, formatDuration, maskDigitsToTimeString, formatSecondsToTimeString, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { notifyEvent } from '../utils/pushNotify';
import { subscribeToPush, unsubscribeFromPush, hasActivePushSubscription } from '../utils/pushSubscription';
import { isCardioExercise, isTimedExercise } from '../data/exerciseLibrary';


// Filters Workout Summary rows to a timeframe by their local YYYY-MM-DD date
// (lexicographically comparable): daily = today only, weekly = last 7 days,
// monthly = last 30 days. Rows are already sorted newest-first upstream.
const filterSummaryByTimeframe = (rows, timeframe) => {
  const today = getLocalDateString(new Date());
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return getLocalDateString(d);
  };
  const from = timeframe === 'daily' ? today : timeframe === 'monthly' ? daysAgo(29) : daysAgo(6);
  return (rows || []).filter((r) => r.date >= from && r.date <= today);
};

const TrainerDashboard = ({ handleLogout }) => {
  const loggedInEmail = localStorage.getItem('userEmail') || '';
  const userRole = localStorage.getItem('userRole') || '';
  const superAdmin = isSuperAdmin(loggedInEmail) || userRole === 'super-admin' || userRole === 'admin';
  const [viewMode, setViewMode] = useState('coach'); // 'coach' or 'admin'
  // This coach's canonical public.users.id (== clients.coach_id for their
  // clients). Seeded from localStorage but re-resolved by email on mount because
  // localStorage.userId can be null/poisoned right after login — and the "My
  // Clients" scoping filter below MUST have the real id to avoid leaking other
  // (or unattached "Generic") clients. See resolveCanonicalUserId.
  const [resolvedCoachId, setResolvedCoachId] = useState(() => localStorage.getItem('userId') || null);

  // Coach notification permission + this device's actual push subscription.
  // Tracked separately: the browser's Notification permission (granted/
  // denied) can never be revoked from JS once granted — only the user can
  // undo that via browser/OS site settings. So "On"/"Off" here reflects
  // whether THIS device currently has an active push subscription, which we
  // *can* create and remove on demand — that's what actually starts/stops
  // pushes arriving, regardless of what the OS permission indicator shows.
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    hasActivePushSubscription().then(setPushSubscribed);
  }, []);

  const notifOn = notifPermission === 'granted' && pushSubscribed;

  const toggleCoachNotifications = async () => {
    if (notifOn) {
      await unsubscribeFromPush();
      setPushSubscribed(false);
      return;
    }
    if (!('Notification' in window)) {
      alert('This browser does not support notifications.');
      return;
    }
    if (Notification.permission === 'denied') {
      alert('Notifications are blocked for this site. Please enable them in your browser/phone settings for this app, then try again.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      window.dispatchEvent(new Event('notificationPermissionChanged'));
      if (result === 'granted') {
        const coachName = localStorage.getItem('userName');
        await subscribeToPush(coachName);
        setPushSubscribed(true);
      }
    } catch (e) {
      console.error('Notification permission request failed:', e);
    }
  };

  const [adminSubTab, setAdminSubTab] = useState('clients'); // 'clients' or 'coaches'
  const [coachesList, setCoachesList] = useState([]);
  const [pendingCoachesList, setPendingCoachesList] = useState([]);
  const [platformStats, setPlatformStats] = useState({ totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });
  const [exerciseCount, setExerciseCount] = useState(0);
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
      const exercises = await databaseService.getExerciseLibrary();
      setCoachesList(coaches || []);
      setPendingCoachesList(pendingCoaches || []);
      setPlatformStats(stats || { totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });
      setExerciseCount(exercises ? exercises.length : 0);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('All');
  const [generatedInviteCode, setGeneratedInviteCode] = useState(() => localStorage.getItem('last_generated_invite_code') || '');
  const [generatingCode, setGeneratingCode] = useState(false);
  
  // Selected client detail view states
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailTab, setDetailTab] = useState('plans'); // 'plans', 'livelog', 'workout'

  // Every Live Log session this coach currently has open across their
  // clients (workout_drafts) — surfaced on the client directory screen so a
  // session started, then interrupted by navigating away or backgrounding
  // the app, is never silently lost.
  const [coachActiveDrafts, setCoachActiveDrafts] = useState([]);

  // Client replies to a coach note that this coach hasn't seen yet — surfaced
  // as a card on the client directory (home) screen, same fallback role as
  // coachActiveDrafts above: a client_reply push fires the moment the client
  // sends it, this is what shows it here if that push was missed/dismissed.
  const [pendingClientReplies, setPendingClientReplies] = useState([]);

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
  // Workout History tab timeframe filter: 'weekly' (last 7 days), 'daily'
  // (today), or 'monthly' (last 30 days) — same control as Workout Summary.
  const [historyTimeframe, setHistoryTimeframe] = useState('weekly');

  // Selected client's body-measurement history (read-only for the coach) —
  // loaded when the Measurements tab is opened.
  const [clientMeasurements, setClientMeasurements] = useState([]);
  const [loadingMeasurements, setLoadingMeasurements] = useState(false);

  // Coach-note composer (top of the client detail view). Lets the coach send
  // a one-off note to the client — picking a suggestion or writing their own —
  // which fires a push to the client and is stored so they can see it later.
  const [coachNoteText, setCoachNoteText] = useState('');
  const [sendingCoachNote, setSendingCoachNote] = useState(false);
  const [coachNoteSentMsg, setCoachNoteSentMsg] = useState('');
  // When the most recent note was sent to this client (any note, read or
  // not) — fetched from the DB in handleSelectClient, so "already responded
  // to this session" is a real, persisted fact instead of React state that
  // resets every time the coach navigates away and back. The card is only
  // shown when the latest session is NEWER than this timestamp.
  const [lastCoachNoteSentAt, setLastCoachNoteSentAt] = useState(null);
  // True for 5s right after a successful send, purely so the coach sees the
  // "Note sent" confirmation before the card disappears — the actual
  // decision to show/hide is lastCoachNoteSentAt above, which flips to "now"
  // (after the session) the instant a send succeeds, so without this the
  // card would vanish mid-confirmation instead of fading out gracefully.
  const [coachNoteJustSent, setCoachNoteJustSent] = useState(false);
  // Live Log: the coach-note composer is hidden behind a "Coach note" toggle
  // and has no Send button of its own — whatever's typed here is sent (via the
  // same saveCoachNote + coach_note push path) as part of "Save Workout
  // Session". This flag just controls whether that composer is revealed.
  const [showLiveCoachNote, setShowLiveCoachNote] = useState(false);

  // ─── Live Session Logger States ───
  const [liveDate, setLiveDate] = useState(() => getLocalDateString());
  const [liveExercises, setLiveExercises] = useState([
    { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }
  ]);
  const [livePlanName, setLivePlanName] = useState('Live Routine');
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveToast, setLiveToast] = useState('');
  const [liveSetTypeMenu, setLiveSetTypeMenu] = useState(null);
  // Live session timer — 'idle' until the coach logs the first set (real work
  // starting is what should start the clock, not just opening this tab).
  // Elapsed time and calories are always recomputed from these timestamps on
  // every render, never from an incrementing counter, so nothing can drift.
  const [liveTimerStatus, setLiveTimerStatus] = useState('idle'); // 'idle' | 'running' | 'paused'
  const [liveTimerStartedAt, setLiveTimerStartedAt] = useState(null);
  const [livePauseIntervals, setLivePauseIntervals] = useState([]); // [{ pausedAt, resumedAt }]
  const [, forceLiveTimerTick] = useState(0);
  // Timed exercise stopwatches in Live Log: { "exIdx,setIdx": { isRunning, startedAt, pausedDuration } }
  const [liveSetTimers, setLiveSetTimers] = useState({});
  const [, forceLiveSetTimerTick] = useState(0);
  const [showDiscardLiveModal, setShowDiscardLiveModal] = useState(false);
  // Which draft (from the client directory's "Live Log in progress" list) is
  // pending a discard confirmation — { userId, userName } or null when closed.
  const [discardDraftTarget, setDiscardDraftTarget] = useState(null);
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

  // Re-render once a second while the live timer is running so the displayed
  // elapsed time / calories stay current. The values themselves are always
  // recomputed fresh from timestamps below — this tick only drives the UI.
  useEffect(() => {
    if (liveTimerStatus !== 'running') return;
    const id = setInterval(() => forceLiveTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [liveTimerStatus]);

  // Live set timers for timed exercises — re-render every 100ms for smooth UI
  useEffect(() => {
    const anyRunning = Object.values(liveSetTimers).some(t => t.isRunning);
    if (!anyRunning) return;
    const id = setInterval(() => forceLiveSetTimerTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [liveSetTimers]);

  const resetLiveTimer = () => {
    setLiveTimerStatus('idle');
    setLiveTimerStartedAt(null);
    setLivePauseIntervals([]);
  };

  const handlePauseLiveTimer = () => {
    if (liveTimerStatus !== 'running') return;
    setLivePauseIntervals((prev) => [...prev, { pausedAt: Date.now(), resumedAt: null }]);
    setLiveTimerStatus('paused');
  };

  const handleResumeLiveTimer = () => {
    if (liveTimerStatus !== 'paused') return;
    setLivePauseIntervals((prev) => {
      const copy = [...prev];
      const openIdx = copy.map((p) => p.resumedAt).lastIndexOf(null);
      if (openIdx !== -1) copy[openIdx] = { ...copy[openIdx], resumedAt: Date.now() };
      return copy;
    });
    setLiveTimerStatus('running');
  };

  const getSetTimerKey = (exIdx, setIdx) => `${exIdx},${setIdx}`;

  const getLiveSetElapsedSeconds = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    const timer = liveSetTimers[key];
    if (!timer) return 0;
    if (!timer.startedAt) return timer.pausedDuration || 0;
    const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000) + (timer.pausedDuration || 0);
    return elapsed;
  };

  const handleLiveSetStopwatchStart = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    setLiveSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration: prev[key]?.pausedDuration || 0 }
    }));
  };

  const handleLiveSetStopwatchPause = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    const elapsed = getLiveSetElapsedSeconds(exIdx, setIdx);
    setLiveSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: false, startedAt: null, pausedDuration: elapsed }
    }));
  };

  const handleLiveSetStopwatchComplete = (exIdx, setIdx) => {
    const elapsed = getLiveSetElapsedSeconds(exIdx, setIdx);
    handleLiveSetChange(exIdx, setIdx, 'time', formatSecondsToTimeString(elapsed));
    handleLiveToggleSet(exIdx, setIdx);
    const key = getSetTimerKey(exIdx, setIdx);
    setLiveSetTimers(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleDiscardLiveSession = async () => {
    resetLiveTimer();
    setLiveExercises([]);
    setLivePlanName('');
    setShowDiscardLiveModal(false);
    // Also clear the persisted draft — otherwise the "Live Log in progress"
    // banner on the client directory screen keeps showing this session as
    // resumable even though it was just discarded here.
    if (selectedClient) {
      await databaseService.deleteWorkoutDraft(selectedClient.id);
      refreshCoachActiveDrafts();
    }
    triggerLiveToast('🗑️ Live session discarded.');
  };

  const liveElapsedSeconds = computeElapsedSeconds(liveTimerStartedAt, livePauseIntervals);
  const liveCalories = computeLiveCalories(liveExercises, liveTimerStartedAt, livePauseIntervals, parseFloat(selectedClient?.userWeight) || DEFAULT_BODY_WEIGHT_KG);

  // Debounce-push the Live Log session to workout_drafts once there's
  // actually something worth resuming (a set ticked, or the timer running/
  // paused) — this is what survives the coach backgrounding the app or
  // switching to another client mid-session, and what the coach's client
  // list "Resume Live Log" banner reads. Debounced so typing a weight/rep
  // doesn't fire a request per keystroke.
  const liveDraftSaveTimerRef = useRef(null);
  useEffect(() => {
    if (!selectedClient) return;
    const hasProgress = liveTimerStatus !== 'idle' || liveExercises.some(ex => ex.sets.some(s => s.isCompleted));
    if (!hasProgress) return;
    if (liveDraftSaveTimerRef.current) clearTimeout(liveDraftSaveTimerRef.current);
    liveDraftSaveTimerRef.current = setTimeout(() => {
      databaseService.saveWorkoutDraft({
        userId: selectedClient.id,
        coachId: resolvedCoachId,
        source: 'coach',
        planName: livePlanName,
        logDate: liveDate,
        exercises: liveExercises,
        timerStatus: liveTimerStatus,
        timerStartedAt: liveTimerStartedAt,
        pauseIntervals: livePauseIntervals
      });
    }, 1200);
    return () => {
      if (liveDraftSaveTimerRef.current) clearTimeout(liveDraftSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, liveExercises, livePlanName, liveDate, liveTimerStatus, liveTimerStartedAt, livePauseIntervals, resolvedCoachId]);

  const triggerLiveToast = (msg) => {
    setLiveToast(msg);
    setTimeout(() => setLiveToast(''), 3500);
  };

  const handleLiveAddExercise = (name) => {
    let newSet;
    if (isCardioExercise(name)) {
      newSet = { distanceKm: '', time: '', isCompleted: false };
    } else if (isTimedExercise(name)) {
      newSet = { time: '', isCompleted: false };
    } else {
      newSet = { reps: '10', weight: '20', isCompleted: false };
    }
    setLiveExercises(prev => [
      ...prev,
      { name, sets: [newSet] }
    ]);
  };

  const handleLiveAddSet = (exIdx) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      if (isCardioExercise(ex.name)) {
        const last = ex.sets[ex.sets.length - 1];
        return { ...ex, sets: [...ex.sets, { distanceKm: last?.distanceKm || '', time: '', isCompleted: false }] };
      }
      if (isTimedExercise(ex.name)) {
        return { ...ex, sets: [...ex.sets, { time: '', isCompleted: false }] };
      }
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
    const now = Date.now();
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => {
          if (si !== setIdx) return s;
          const nextCompleted = !s.isCompleted;
          // completedAt timestamps are what the live timer's rest-interval
          // calorie calc uses — never cleared retroactively except when this
          // exact set is unchecked, so re-checking it later is timed fresh.
          return { ...s, isCompleted: nextCompleted, completedAt: nextCompleted ? now : null };
        })
      };
    }));
    // Logging real work is what starts the session clock — not opening the tab.
    setLiveTimerStatus(prevStatus => {
      if (prevStatus === 'idle') {
        setLiveTimerStartedAt(now);
        return 'running';
      }
      return prevStatus;
    });
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
      const formattedExercises = liveExercises.map(ex => {
        const exIsCardio = isCardioExercise(ex.name);
        return {
          name: ex.name,
          sets: (completedCount > 0 ? ex.sets.filter(s => s.isCompleted) : ex.sets).map(s => ({
            // Cardio sets carry distance/time instead of reps/weight, and
            // timed holds (plank etc.) carry time only, so the save step
            // (and workout_logs.distance_km/cardio_duration_seconds) doesn't
            // collapse them to zero.
            ...(exIsCardio
              ? { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' }
              : isTimedExercise(ex.name)
              ? { time: s.time || '' }
              : { reps: parseInt(s.reps) || 0, weight: parseFloat(s.weight) || 0 }),
            // Preserve the Warmup/Dropset/Failure tag chosen in the live logger
            // so it reaches workout_logs.set_type instead of being discarded.
            ...(s.isWarmup ? { setType: 'warmup' } : {}),
            ...(s.setType && s.setType !== 'normal' && !s.isWarmup ? { setType: s.setType } : {})
          }))
        };
      }).filter(ex => ex.sets.length > 0);

      const session = {
        id: `coach-live-${Date.now()}`,
        clientName: selectedClient.userName,
        clientId: selectedClient.id,
        date: liveDate,
        exercises: formattedExercises,
        loggedByCoach: true,
        planName: livePlanName || 'Live Routine',
        // Final timer/calorie snapshot at the moment of save — same formula
        // the live bar above was already showing the coach. Cardio calories
        // scale with the CLIENT's bodyweight, not the coach's own.
        durationSeconds: liveTimerStartedAt ? computeElapsedSeconds(liveTimerStartedAt, livePauseIntervals) : null,
        caloriesBurned: liveTimerStartedAt ? computeLiveCalories(liveExercises, liveTimerStartedAt, livePauseIntervals, parseFloat(selectedClient.userWeight) || DEFAULT_BODY_WEIGHT_KG).totalKcal : null
      };

      await databaseService.saveWorkoutSession(session);
      // Session is finished and saved to workout_logs — the open draft is done.
      await databaseService.deleteWorkoutDraft(selectedClient.id);

      // Also save what was just logged as a reusable plan in the coach's own
      // "Workout Plan" tab, so a real in-person session doesn't have to be
      // rebuilt from scratch next time. isAssigned: false keeps it OUT of the
      // client's "Coach Assigned Plans" list and skips the plan_assigned
      // push — becoming a real assignment stays a deliberate action (the
      // plan editor's Save/Duplicate, same as it already works today), not
      // an automatic side effect of logging a session.
      try {
        await databaseService.saveWorkoutPlan({
          userId: selectedClient.id,
          planName: livePlanName || 'Live Routine',
          exercises: formattedExercises,
          createdBy: 'coach',
          isAssigned: false
        });
      } catch (planErr) {
        console.error('Error saving live session as a plan:', planErr);
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

      // If the coach typed a note in the Live Log composer, send it now as
      // part of saving the session — same stored + pushed path as the note
      // card above the tabs, so it reaches the client's home screen exactly
      // like a push notification. Best-effort: a note failure never blocks
      // the session save that already succeeded above.
      const liveNote = coachNoteText.trim();
      if (liveNote) {
        try {
          const noteRes = await databaseService.saveCoachNote(selectedClient.id, resolvedCoachId, liveNote);
          if (noteRes.success) {
            notifyEvent('coach_note', { clientUserId: selectedClient.id, message: liveNote });
            setLastCoachNoteSentAt(new Date().toISOString());
          }
        } catch (noteErr) {
          console.error('Error sending coach note with live session:', noteErr);
        }
        setCoachNoteText('');
        setShowLiveCoachNote(false);
      }

      triggerLiveToast(liveNote
        ? '✅ Workout session + note saved for ' + selectedClient.userName + '!'
        : '✅ Workout session saved for ' + selectedClient.userName + '!');
      // Refresh workout history
      const logs = await databaseService.getWorkoutLogsForUser(selectedClient.id);
      setWorkoutLogs(groupLogs(logs || []));
      // Refresh the Workout Plan tab so the plan just saved above shows up
      // immediately if the coach switches to it.
      fetchClientPlans(selectedClient.id);
      // Reset exercises for next session
      setLiveExercises([
        { name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }
      ]);
      setLivePlanName('Live Routine');
      setLiveDate(getLocalDateString());
      resetLiveTimer();
      refreshCoachActiveDrafts();
    } catch(e) {
      console.error('Error saving live session:', e);
      triggerLiveToast('❌ Failed to save session. Please try again.');
    } finally {
      setLiveSaving(false);
    }
  };

  const refreshCoachActiveDrafts = async () => {
    if (!resolvedCoachId) return;
    const drafts = await databaseService.getCoachActiveDrafts(resolvedCoachId);
    setCoachActiveDrafts(drafts);
  };

  const refreshPendingClientReplies = async () => {
    if (!resolvedCoachId) return;
    const replies = await databaseService.getPendingClientReplies(resolvedCoachId);
    setPendingClientReplies(replies);
  };

  // Coach has seen this reply — dismiss it from the directory card for good.
  const handleDismissClientReply = async (replyId) => {
    setPendingClientReplies((prev) => prev.filter((r) => r.id !== replyId));
    await databaseService.markClientReplySeen(replyId);
  };

  // Discard a draft directly from the client directory's "Live Log in
  // progress" list — lets the coach clear a stale/unwanted session without
  // having to open it first. Also resets the in-tab live state if that same
  // client happens to be the one currently open in the Live Log tab.
  const handleDiscardDraftFromList = async () => {
    if (!discardDraftTarget) return;
    const { userId } = discardDraftTarget;
    await databaseService.deleteWorkoutDraft(userId);
    if (selectedClient?.id === userId) {
      resetLiveTimer();
      setLiveExercises([]);
      setLivePlanName('');
    }
    setDiscardDraftTarget(null);
    refreshCoachActiveDrafts();
  };

  // Refresh on mount and whenever the coach returns to this tab/app — the
  // exact "was away for a while, came back" moment this list exists for.
  useEffect(() => {
    refreshCoachActiveDrafts();
    refreshPendingClientReplies();
    const refreshBoth = () => { refreshCoachActiveDrafts(); refreshPendingClientReplies(); };
    document.addEventListener('visibilitychange', refreshBoth);
    window.addEventListener('focus', refreshBoth);
    return () => {
      document.removeEventListener('visibilitychange', refreshBoth);
      window.removeEventListener('focus', refreshBoth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCoachId]);

  // Re-pull the active-drafts list every time the coach lands back on the
  // client directory (home). The "Live Log in progress" banner reads this
  // list, and clicking the in-app "Dashboard" breadcrumb to leave a live
  // session fires NO visibilitychange/focus event — so without this, the
  // list stays as it was at mount (empty) and the banner never appears
  // until a full page reload. This is the exact "logged a workout, went
  // back to home, saw no banner" case.
  useEffect(() => {
    if (viewMode === 'coach' && !selectedClient) {
      refreshCoachActiveDrafts();
      refreshPendingClientReplies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, viewMode]);

  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef(null);

  // Resolve this coach's canonical id once on mount (repairs a null/poisoned
  // localStorage.userId after login) so the "My Clients" scoping filter is
  // reliable. resolveUserId also heals localStorage in place.
  useEffect(() => {
    let cancelled = false;
    databaseService.resolveUserId().then(id => {
      if (!cancelled && id) setResolvedCoachId(id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

    setLoadingClients(true);
    fetchClients();

    let channel = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      console.log('[DEBUG] Trainer Dashboard: Subscribing to real-time client & user updates...');
      channel = databaseService.supabase
        .channel('trainer-clients-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
          console.log('[DEBUG] Trainer Dashboard: Real-time clients table change:', payload);
          fetchClients();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
          console.log('[DEBUG] Trainer Dashboard: Real-time users table change:', payload);
          fetchClients();
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
    // Clear any coach-note composer state carried over from a previous client.
    setCoachNoteText('');
    setCoachNoteSentMsg('');
    setCoachNoteJustSent(false);
    setLastCoachNoteSentAt(null);
    databaseService.getLatestCoachNoteSentAt(client.id).then(setLastCoachNoteSentAt);
    setTotalSessionsInput(client.total_sessions != null ? String(client.total_sessions) : '');
    // A running clock from the previous client must never carry over —
    // otherwise their elapsed time/calories would land on this client's save.
    resetLiveTimer();
    // Initialize the save-lock to match what's already persisted for THIS
    // client (not the previous one, and not unconditionally null) — so
    // reopening a client whose total_sessions is already set correctly
    // shows "✓ Saved" immediately, instead of always showing the highlighted
    // "Save" button until a new save happens in this browser session.
    setTotalSessionsSavedValue(client.total_sessions != null ? String(client.total_sessions) : null);

    // Resume this coach's own in-progress Live Log for this client, if any —
    // survives navigating away / backgrounding the app mid-session. Falls
    // back to a clean single-exercise starter when there's nothing to
    // resume, since liveExercises otherwise carries over from whichever
    // client was open before this one.
    databaseService.getWorkoutDraft(client.id).then(dbDraft => {
      const canResume = dbDraft && dbDraft.source === 'coach' && dbDraft.coachId === resolvedCoachId
        && dbDraft.exercises && dbDraft.exercises.length > 0;
      if (canResume) {
        setLiveExercises(dbDraft.exercises);
        setLivePlanName(dbDraft.planName || 'Live Routine');
        if (dbDraft.logDate) setLiveDate(dbDraft.logDate);
        setLiveTimerStatus(dbDraft.timerStatus || 'idle');
        setLiveTimerStartedAt(dbDraft.timerStartedAt ?? null);
        setLivePauseIntervals(dbDraft.pauseIntervals || []);
        triggerLiveToast(`↩️ Resumed in-progress Live Log for ${client.userName}`);
      } else {
        setLiveExercises([{ name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }]);
        setLivePlanName('Live Routine');
        setLiveDate(getLocalDateString());
      }
    }).catch(() => {
      setLiveExercises([{ name: 'Shoulders Press', sets: [{ reps: '10', weight: '20', isCompleted: false }, { reps: '10', weight: '20', isCompleted: false }] }]);
      setLivePlanName('Live Routine');
      setLiveDate(getLocalDateString());
    });

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
    // Live Log's session timer duplicates its final duration/calories onto
    // every set row (workout_logs has no session-level row) — pick up the
    // first non-null value seen per date, same pattern as planNames above.
    const durationByDate = {};
    const caloriesByDate = {};

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
      if (log.duration_seconds != null && durationByDate[date] == null) {
        durationByDate[date] = log.duration_seconds;
      }
      if (log.calories_burned != null && caloriesByDate[date] == null) {
        caloriesByDate[date] = log.calories_burned;
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
        isWarmup: log.set_type === 'warmup',
        // Cardio rows carry distance/time instead of reps/weight — see
        // isCardioExercise / the workout_logs.distance_km column. Timed holds
        // (plank etc., see isTimedExercise) reuse cardio_duration_seconds
        // without a distance_km value — see databaseService.saveWorkoutSession.
        ...(log.distance_km != null
          ? { distanceKm: log.distance_km, time: formatSecondsToTimeString(log.cardio_duration_seconds) }
          : log.cardio_duration_seconds != null
          ? { time: formatSecondsToTimeString(log.cardio_duration_seconds) }
          : {})
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
          durationSeconds: durationByDate[dateStr] ?? null,
          caloriesBurned: caloriesByDate[dateStr] ?? null,
          exercises: exercisesList
        };
      });

    return sortedDatesList;
  };

  // "PREVIOUS" column lookup for the Live Log / Plan editor set tables — same
  // idea as the client's own getPreviousSessionSet, but workoutLogs here is
  // already scoped to the one selected client, so no name filtering needed.
  const getPreviousSessionSet = (exName, setIdx) => {
    const history = [...workoutLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const session of history) {
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
        return `${set.weight}kg x ${set.reps}`;
      }
    }
    return '—';
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
    } else if (tab === 'measurements' && selectedClient) {
      setLoadingMeasurements(true);
      const history = await databaseService.getBodyMeasurements(selectedClient.id);
      setClientMeasurements(history);
      setLoadingMeasurements(false);
    }
  };

  // Coach override for a bad measurement entry (e.g. a blank row saved during
  // the "stuck on Saving…" bug) — an insert-only history table means the
  // client herself can't undo a bad save, and it still burns her 15-day
  // window. Deleting it here re-opens that window immediately.
  const handleDeleteMeasurementEntry = async (entryId, dateLabel) => {
    if (!window.confirm(`Delete the ${dateLabel} measurement entry? This can't be undone, and will let the client save a new entry right away.`)) return;
    const res = await databaseService.deleteBodyMeasurement(entryId);
    if (!res.success) {
      window.alert(`Couldn't delete: ${res.error || 'unknown error'}`);
      return;
    }
    const history = await databaseService.getBodyMeasurements(selectedClient.id);
    setClientMeasurements(history);
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
    const cleanExercises = editorExercises.map(ex => {
      const exIsCardio = isCardioExercise(ex.name);
      return {
        name: ex.name,
        sets: ex.sets.map(s => ({
          ...(exIsCardio
            ? { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' }
            : isTimedExercise(ex.name)
            ? { time: s.time || '' }
            : { reps: parseInt(s.reps) || 10, weight: parseFloat(s.weight) || 0 }),
          ...(s.isWarmup ? { isWarmup: true } : {}),
          ...(s.setType && s.setType !== 'normal' ? { setType: s.setType } : {})
        }))
      };
    }).filter(ex => ex.sets.length > 0);

    const plan = {
      id: editingPlan ? editingPlan.id : null,
      userId: selectedClient.id,
      planName: editorPlanName.trim(),
      exercises: cleanExercises,
      createdBy: 'coach',
      // The editor's button reads "Assign to client" — this is the deliberate
      // assignment action, so it always sets isAssigned: true, even when
      // editing a plan that started out unassigned (e.g. one auto-saved from
      // Live Log). That's how such a plan becomes visible to the client.
      isAssigned: true
    };

    await databaseService.saveWorkoutPlan(plan);
    // Notify the client their coach sent them a new workout plan.
    notifyEvent('plan_assigned', { clientUserId: selectedClient.id, planName: plan.planName });
    setShowPlanEditor(false);
    setEditingPlan(null);
    setEditorPlanName('');
    setEditorExercises([]);
    fetchClientPlans(selectedClient.id);
  };

  const handleAddExerciseToEditor = (name) => {
    let newSet;
    if (isCardioExercise(name)) {
      newSet = { distanceKm: '', time: '' };
    } else if (isTimedExercise(name)) {
      newSet = { time: '' };
    } else {
      newSet = { reps: 10, weight: 20 };
    }
    setEditorExercises(prev => [
      ...prev,
      {
        name,
        sets: [newSet]
      }
    ]);
  };

  const handleAddSetToExercise = (exIdx) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        if (isCardioExercise(ex.name)) {
          const lastSet = ex.sets[ex.sets.length - 1];
          return { ...ex, sets: [...ex.sets, { distanceKm: lastSet?.distanceKm || '', time: '' }] };
        }
        if (isTimedExercise(ex.name)) {
          return { ...ex, sets: [...ex.sets, { time: '' }] };
        }
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

  // The client's most recent completed session (for tailoring note
  // suggestions to what they just did). workoutLogs is already grouped and
  // carries durationSeconds/caloriesBurned per session.
  const latestClientSession = (() => {
    if (!workoutLogs || workoutLogs.length === 0) return null;
    return [...workoutLogs].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
  })();

  // Whether the latest session still needs a response: no note has EVER been
  // sent to this client, or the last one sent predates this session (so a
  // fresh session that comes in after an old note was sent counts as new).
  // Session dates have no time component, so "predates" is start-of-day
  // comparison — a note sent any time on the session's day or later counts
  // as already handled. This is what actually fixes the card resurfacing for
  // a session from days ago every time the coach reopens the client: that
  // decision now comes from the DB (lastCoachNoteSentAt, fetched in
  // handleSelectClient), not from React state that reset on every remount.
  const sessionNeedsResponse = latestClientSession && (
    !lastCoachNoteSentAt || new Date(lastCoachNoteSentAt) < new Date(`${latestClientSession.date}T00:00:00`)
  );
  const showCoachNoteCard = sessionNeedsResponse || coachNoteJustSent;

  // Send a one-off coach note to the selected client: store it (so they can
  // see it later even if the push is missed) AND fire a push with the note's
  // text as the notification body. Works from any suggestion chip or the
  // custom textarea — both funnel through here.
  const handleSendCoachNote = async (rawMessage) => {
    const message = (rawMessage ?? coachNoteText).trim();
    if (!message || !selectedClient || sendingCoachNote) return;

    setSendingCoachNote(true);
    setCoachNoteSentMsg('');
    try {
      const res = await databaseService.saveCoachNote(selectedClient.id, resolvedCoachId, message);
      if (!res.success) {
        setCoachNoteSentMsg(`⚠️ Couldn't send: ${res.error || 'unknown error'}`);
        return;
      }
      // Push the note straight to the client's device.
      notifyEvent('coach_note', { clientUserId: selectedClient.id, message });
      setCoachNoteText('');
      setCoachNoteSentMsg(`✅ Note sent to ${selectedClient.userName || 'your client'}.`);
      // This session is now handled — persisted immediately (not just in this
      // render) so reopening this client later won't show the card again for
      // the same session. coachNoteJustSent just keeps the card visually up
      // for 5s so the confirmation above is actually seen before it fades.
      setLastCoachNoteSentAt(new Date().toISOString());
      setCoachNoteJustSent(true);
      setTimeout(() => setCoachNoteJustSent(false), 5000);
    } finally {
      setSendingCoachNote(false);
    }
  };

  // Three ready-to-send note suggestions. When we know the last session's
  // stats, the first one references them so it feels personal; the rest are
  // evergreen encouragement.
  const coachNoteSuggestions = (() => {
    const firstName = (selectedClient?.userName || '').trim().split(/\s+/)[0] || 'there';
    const s = latestClientSession;
    const statBits = s
      ? [s.durationSeconds != null ? `${formatDuration(s.durationSeconds)}` : null, s.caloriesBurned != null ? `${s.caloriesBurned} kcal` : null].filter(Boolean).join(', ')
      : '';
    const opener = statBits
      ? `Great session, ${firstName}! ${statBits} — solid work 💪`
      : `Great work today, ${firstName}! Really solid session 💪`;
    return [
      opener,
      `Proud of your consistency this week — keep it going! 🔥`,
      `How did that feel? Let me know if anything was too easy or too tough.`
    ];
  })();

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
  const loggedInUserId = resolvedCoachId;
  const filteredClients = clients.filter(c => {
    // SECURITY (data isolation): in coach view EVERY coach — including the
    // super-admin — sees ONLY their own attached clients. This must FAIL
    // CLOSED: if this coach's canonical id isn't known yet (e.g. the brief
    // window right after login before it resolves), show nothing rather than
    // leaking unattached ("Generic") or other coaches' clients. Comparing
    // against a null id previously did the opposite — it surfaced exactly the
    // generic/unattached clients. The platform-wide view lives behind the
    // separate Super-Admin tab (viewMode 'admin'), not here.
    if (viewMode === 'coach') {
      if (!loggedInUserId) return false;
      if (c.coach_id !== loggedInUserId) return false;
    }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={toggleCoachNotifications}
            title={notifOn ? 'Notifications are on — tap to turn off' : 'Enable notifications to get client alerts'}
            aria-label={notifOn ? 'Turn off notifications' : 'Enable notifications'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: notifOn ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.06)',
              border: notifOn ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.12)',
              color: notifOn ? 'var(--primary-accent-light)' : '#fff',
              boxShadow: notifOn ? '0 4px 14px rgba(16,185,129,0.35)' : 'none',
              borderRadius: '50%', padding: '8px',
              cursor: 'pointer'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <button className="logout-btn-trainer" onClick={handleLogout} title="Logout" aria-label="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </div>
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

          {/* Admin Sub-tabs: Total Clients | Total Coaches | Exercises */}
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
              🏅 Total Coaches
              <span style={{
                marginLeft: '8px', fontSize: '0.82rem', fontWeight: 700,
                color: adminSubTab === 'coaches' ? '#f59e0b' : 'rgba(148,163,184,0.4)'
              }}>
                {coachesList.length}
              </span>
            </button>
            <button
              onClick={() => setAdminSubTab('exercises')}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: '10px', border: 'none',
                background: adminSubTab === 'exercises' ? 'rgba(139,92,246,0.14)' : 'transparent',
                color: adminSubTab === 'exercises' ? '#a78bfa' : 'rgba(148,163,184,0.55)',
                fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: 'inherit', letterSpacing: '0.01em',
                boxShadow: adminSubTab === 'exercises' ? '0 1px 8px rgba(139,92,246,0.15)' : 'none'
              }}
            >
              🏋️ Exercise Library
              <span style={{
                marginLeft: '8px', fontSize: '0.82rem', fontWeight: 700,
                color: adminSubTab === 'exercises' ? '#a78bfa' : 'rgba(148,163,184,0.4)'
              }}>
                {exerciseCount}
              </span>
            </button>
          </div>

          {/* Sub-tab content */}
          {adminSubTab === 'exercises' ? (
            <AdminExerciseLibrary onExerciseCountChange={(count) => setExerciseCount(count)} />
          ) : adminSubTab === 'coaches' ? (
            <AdminCoachesList
              coachesList={coachesList}
              loadingAdmin={loadingAdmin}
              onToggleBlock={handleToggleCoachBlock}
              onViewClients={handleViewCoachClients}
            />
          ) : (
            <AdminClientsList
              clients={clients}
              goalFilter={goalFilter}
              setGoalFilter={setGoalFilter}
              loadingClients={loadingClients}
              coachesList={coachesList}
              onSelectCoachDetails={handleViewCoachClients}
            />
          )}

          {/* Coach Client Drill-down Modal — shared by both Coaches and Clients sub-tabs */}
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
        </div>
      ) : (
        <>
          {!selectedClient ? (
            // Client Directory Screen
            <div className="client-directory-view">
              {/* Resume Live Log — sessions still open in workout_drafts across
                  this coach's clients. Never silently lost by navigating away
                  or backgrounding the app mid-session. */}
              {coachActiveDrafts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {coachActiveDrafts.map(draft => {
                    const draftClient = clients.find(c => c.id === draft.userId);
                    const totalSets = (draft.exercises || []).reduce((sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length, 0);
                    return (
                      <div
                        key={draft.userId}
                        onClick={() => {
                          if (draftClient) {
                            handleSelectClient(draftClient);
                            setDetailTab('livelog');
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                          borderRadius: '12px', padding: '12px 14px', cursor: draftClient ? 'pointer' : 'default'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '1.4rem' }}>⏱️</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24' }}>
                              Live Log in progress — {draftClient?.userName || 'a client'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {draft.planName || 'Workout'} · {totalSets} sets logged
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button type="button" style={{
                            background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff',
                            border: 'none', borderRadius: '20px', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer'
                          }}>
                            Resume ▶
                          </button>
                          <button
                            type="button"
                            title="Discard this live session"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiscardDraftTarget({ userId: draft.userId, userName: draftClient?.userName || 'this client' });
                            }}
                            style={{
                              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                              color: '#ef4444', borderRadius: '8px', padding: '8px 10px', fontSize: '1rem',
                              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', minWidth: '32px'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Client replies to a coach note — fallback for a missed
                  client_reply push. Lives on the directory (home) screen, not
                  buried in any one client's detail tabs, so the coach sees it
                  regardless of which client they open next. */}
              {pendingClientReplies.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {pendingClientReplies.map(reply => {
                    const replyClient = clients.find(c => c.id === reply.clientId);
                    return (
                      <div
                        key={reply.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
                          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
                          borderRadius: '12px', padding: '12px 14px', cursor: replyClient ? 'pointer' : 'default'
                        }}
                        onClick={() => { if (replyClient) handleSelectClient(replyClient); }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '1.3rem' }}>💬</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#a78bfa' }}>
                              Reply from {replyClient?.userName || 'a client'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#fff', marginTop: '2px', wordBreak: 'break-word' }}>
                              {reply.message}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          title="Dismiss"
                          onClick={(e) => { e.stopPropagation(); handleDismissClientReply(reply.id); }}
                          style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                            color: 'var(--text-muted)', borderRadius: '50%', width: '26px', height: '26px',
                            fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

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
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Name</th>
                        <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', width: '84px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.map(client => (
                        <tr key={client.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '56px' }}>
                          <td style={{ padding: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{client.userName}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                  <span style={{
                                    display: 'inline-block', width: 'fit-content', padding: '1px 7px', borderRadius: '10px',
                                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                                    background: client.coach_id ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                                    color: client.coach_id ? '#10b981' : 'var(--text-muted)',
                                    border: `1px solid ${client.coach_id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`
                                  }}>
                                    {client.coach_id ? 'Attached' : 'Generic'}
                                  </span>
                                  {client.userGoal && (
                                    <span className={`client-goal-badge ${client.userGoal.toLowerCase().replace(/\s+/g, '-')}`} style={{
                                      display: 'inline-block',
                                      padding: '1px 7px',
                                      borderRadius: '10px',
                                      fontSize: '0.62rem',
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
                                </div>
                              </div>
                            </div>
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
                    {/* How many of those sessions the client has actually
                        logged so far — same "unique session dates" count the
                        client's own Coaching Program Progress card uses
                        (getTotalSessionsDone in WorkoutProgressDashboard.jsx),
                        so the two numbers always agree. */}
                    <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700, marginTop: '5px' }}>
                      ✅ {workoutLogs.length} completed
                      {selectedClient.total_sessions != null && ` of ${selectedClient.total_sessions}`}
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
                      width: '75px',
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
                <button
                  className={`trainer-tab-btn ${detailTab === 'measurements' ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '10px 6px',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    borderBottom: detailTab === 'measurements' ? '2px solid #38bdf8' : 'none',
                    color: detailTab === 'measurements' ? '#38bdf8' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('measurements')}
                >
                  📏 Measurements
                </button>
              </div>

              {/* Coach note composer — send a one-off note to this client
                  (push + stored fallback). Shown above every tab so the coach
                  can respond right after opening from a "workout completed"
                  notification, regardless of which tab is active. Only shown
                  when the latest session actually needs a response (see
                  sessionNeedsResponse) — a session already responded to, or a
                  client with no completed sessions at all, shows nothing. */}
              {showCoachNoteCard && (
              <div className="coach-note-card">
                <div className="coach-note-head">
                  <span className="coach-note-title">💬 Send {(selectedClient.userName || 'client').split(/\s+/)[0]} a note</span>
                  {latestClientSession && (latestClientSession.durationSeconds != null || latestClientSession.caloriesBurned != null) && (
                    <span className="coach-note-lastsession">
                      Last session:
                      {latestClientSession.durationSeconds != null && ` ⏱ ${formatDuration(latestClientSession.durationSeconds)}`}
                      {latestClientSession.durationSeconds != null && latestClientSession.caloriesBurned != null && ' ·'}
                      {latestClientSession.caloriesBurned != null && ` 🔥 ${latestClientSession.caloriesBurned} kcal`}
                    </span>
                  )}
                </div>
                <div className="coach-note-suggestions">
                  {coachNoteSuggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      className="coach-note-chip"
                      disabled={sendingCoachNote}
                      onClick={() => setCoachNoteText(sug)}
                      title="Tap to use — you can still edit before sending"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
                <textarea
                  className="coach-note-textarea"
                  placeholder="Or write your own note…"
                  value={coachNoteText}
                  onChange={(e) => { setCoachNoteText(e.target.value); if (coachNoteSentMsg) setCoachNoteSentMsg(''); }}
                  rows={2}
                  disabled={sendingCoachNote}
                />
                <div className="coach-note-actions">
                  {coachNoteSentMsg && (
                    <span className={`coach-note-feedback ${coachNoteSentMsg.startsWith('✅') ? 'ok' : 'err'}`}>{coachNoteSentMsg}</span>
                  )}
                  <button
                    type="button"
                    className="coach-note-send"
                    disabled={sendingCoachNote || !coachNoteText.trim()}
                    onClick={() => handleSendCoachNote()}
                  >
                    {sendingCoachNote ? 'Sending…' : 'Send note'}
                  </button>
                </div>
              </div>
              )}

              {/* Condition tab rendering */}
              {detailTab === 'workout' && (
                <div className="workout-history-content">
                  <h4 className="history-section-title">Workout History</h4>

                  {/* Timeframe segmented control (Weekly / Daily / Monthly) */}
                  <div className="wsum-timeframe-nav">
                    {['weekly', 'daily', 'monthly'].map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        className={`wsum-timeframe-btn ${historyTimeframe === tf ? 'active' : ''}`}
                        onClick={() => setHistoryTimeframe(tf)}
                      >
                        {tf.charAt(0).toUpperCase() + tf.slice(1)}
                      </button>
                    ))}
                  </div>

                  {loadingLogs ? (
                    <div className="trainer-loading-container">
                      <div className="trainer-spinner"></div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading workout history logs...</p>
                    </div>
                  ) : (() => {
                    const filteredLogs = filterSummaryByTimeframe(workoutLogs, historyTimeframe);
                    const tfLabel = historyTimeframe === 'daily' ? 'today' : historyTimeframe === 'monthly' ? 'the last 30 days' : 'the last 7 days';
                    return workoutLogs.length === 0 ? (
                    <div className="trainer-empty-state">
                      <div className="trainer-empty-icon">🏋️‍♂️</div>
                      <h5>No Workouts Logged</h5>
                      <p>This client has not logged or synchronized any workout sessions to the database yet.</p>
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="trainer-empty-state">
                      <div className="trainer-empty-icon">🏋️‍♂️</div>
                      <h5>No Workouts for {tfLabel}</h5>
                      <p>No sessions logged in {tfLabel}. Try a wider timeframe above.</p>
                    </div>
                  ) : (
                    <div className="workout-sessions-list">
                      {filteredLogs.map((session, sIdx) => (
                        <div key={sIdx} className="session-block">
                          <div className="session-date-header">
                            <span className="session-date-icon">📅</span>
                            <div className="session-heading-text">
                              <span className="session-plan-name">{session.planName || 'Custom Routine'}</span>
                              <span className="session-date-sub">
                                {parseLocalDateString(session.date).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                              {(session.durationSeconds != null || session.caloriesBurned != null) && (
                                <span className="session-metrics-sub">
                                  {session.durationSeconds != null && `⏱ ${formatDuration(session.durationSeconds)}`}
                                  {session.durationSeconds != null && session.caloriesBurned != null && '  •  '}
                                  {session.caloriesBurned != null && `🔥 ${session.caloriesBurned} kcal`}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="session-exercises-list">
                            {session.exercises.map((exercise, eIdx) => {
                              const exIsTimedHist = isTimedExercise(exercise.name);
                              const exIsCardioHist = isCardioExercise(exercise.name);
                              return (
                              <div key={eIdx} className="exercise-log-card">
                                <div className="exercise-log-name">{exercise.name}</div>

                                <table className="sets-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: '25%' }}>Set</th>
                                      {exIsTimedHist ? (
                                        <th style={{ width: '75%' }}>Time</th>
                                      ) : exIsCardioHist ? (
                                        <>
                                          <th style={{ width: '40%' }}>Km</th>
                                          <th style={{ width: '35%' }}>Time</th>
                                        </>
                                      ) : (
                                        <>
                                          <th style={{ width: '40%' }}>Weight</th>
                                          <th style={{ width: '35%' }}>Reps</th>
                                        </>
                                      )}
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
                                          {exIsTimedHist ? (
                                            <td>{set.time || '00:00'}</td>
                                          ) : exIsCardioHist ? (
                                            <>
                                              <td>{set.distanceKm} km</td>
                                              <td>{set.time || '00:00'}</td>
                                            </>
                                          ) : (
                                            <>
                                              <td>{set.weight} kg</td>
                                              <td>{set.reps} reps</td>
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
                      ))}
                    </div>
                  );
                  })()}
                </div>
              )}

              {detailTab === 'measurements' && (() => {
                const measFields = [
                  { key: 'weight',    label: 'Body Weight', unit: 'kg' },
                  { key: 'chest',     label: 'Chest' },
                  { key: 'waist',     label: 'Waist' },
                  { key: 'hips',      label: 'Hips' },
                  { key: 'thighs',    label: 'Thighs' },
                  { key: 'calves',    label: 'Calves' },
                  { key: 'shoulders', label: 'Shoulders' },
                  { key: 'upperArm',  label: 'Upper Arm' },
                  { key: 'forearm',   label: 'Forearm' },
                  { key: 'neck',      label: 'Neck' },
                ];
                const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const latest = clientMeasurements[0] || null;
                const previous = clientMeasurements[1] || null;
                return (
                  <div className="measurements-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 className="history-section-title">📏 Body Measurements</h4>
                    {loadingMeasurements ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading measurements…</p>
                    ) : clientMeasurements.length === 0 ? (
                      <div className="trainer-empty-state">
                        <h5>No measurements yet</h5>
                        <p>{selectedClient.userName} hasn't recorded any body measurements yet. They can add them from their Profile → Measurements.</p>
                      </div>
                    ) : (
                      <>
                        {/* Latest vs previous comparison table */}
                        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.2)', background: 'rgba(56,189,248,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
                            <span>Latest — {fmtDate(latest.measuredAt)}</span>
                            {previous && <span>vs {fmtDate(previous.measuredAt)}</span>}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ textAlign: 'left', fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0', textTransform: 'uppercase' }}>Part</th>
                                <th style={{ textAlign: 'right', fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0', textTransform: 'uppercase' }}>Current</th>
                                {previous && <th style={{ textAlign: 'right', fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0', textTransform: 'uppercase' }}>Change</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {measFields.map(({ key, label, unit }) => {
                                const cur = latest.measurements?.[key];
                                if (cur == null || cur === '') return null;
                                const prev = previous?.measurements?.[key];
                                const delta = (prev != null && prev !== '') ? (parseFloat(cur) - parseFloat(prev)) : null;
                                return (
                                  <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ fontSize: '0.8rem', color: '#e5e7eb', padding: '6px 0' }}>{label}</td>
                                    <td style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 700, textAlign: 'right', padding: '6px 0' }}>{cur}{unit || 'cm'}</td>
                                    {previous && (
                                      <td style={{ textAlign: 'right', padding: '6px 0', fontSize: '0.76rem', fontWeight: 700, color: delta == null ? 'var(--text-muted)' : Math.abs(delta) < 0.001 ? 'var(--text-muted)' : delta > 0 ? '#34d399' : '#f87171' }}>
                                        {delta == null ? '—' : Math.abs(delta) < 0.001 ? '±0' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}`}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Full history timeline */}
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.03em', marginBottom: '8px' }}>Full History</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {clientMeasurements.map((entry, idx) => {
                              const filled = measFields.filter(f => entry.measurements?.[f.key] != null && entry.measurements[f.key] !== '');
                              return (
                                <div key={entry.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                  <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>
                                      {fmtDate(entry.measuredAt)}{idx === 0 && <span style={{ color: '#38bdf8', fontWeight: 700, marginLeft: '6px', fontSize: '0.66rem' }}>LATEST</span>}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.6 }}>
                                      {filled.length > 0 ? filled.map(f => `${f.label}: ${entry.measurements[f.key]}${f.unit || 'cm'}`).join(' · ') : 'No values recorded'}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteMeasurementEntry(entry.id, fmtDate(entry.measuredAt))}
                                    title="Delete this entry"
                                    style={{ flexShrink: 0, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.7rem', fontWeight: 700, padding: '4px 8px', cursor: 'pointer' }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

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
                            {editorExercises.map((ex, exIdx) => {
                            const exIsCardio = isCardioExercise(ex.name);
                            return (
                              <div key={exIdx} className="live-logger-exercise-card">
                                <div className="live-logger-ex-header">
                                  <span className="live-logger-ex-name">{ex.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExerciseFromEditor(exIdx)}
                                    style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                  >🗑️ Remove</button>
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
                                        <span className="col-weight">WEIGHT (KG)</span>
                                        <span className="col-reps">REPS</span>
                                      </>
                                    )}
                                    <span className="col-check"></span>
                                  </div>
                                  <div className="hevy-table-body">
                                    {ex.sets.map((set, setIdx) => {
                                      const workingNum = ex.sets.slice(0, setIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                                      const label = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.isWarmup ? 'W' : workingNum;
                                      const prevStats = getPreviousSessionSet(ex.name, setIdx);
                                      return (
                                      <div key={setIdx} className={`hevy-set-row ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}>
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
                                        <span className="col-prev set-prev-lbl">{prevStats}</span>
                                        {exIsCardio ? (
                                          <>
                                            <div className="col-weight set-input-field">
                                              <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0"
                                                value={set.distanceKm}
                                                onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'distanceKm', e.target.value)}
                                              />
                                            </div>
                                            <div className="col-reps set-input-field">
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="mm:ss"
                                                value={set.time}
                                                onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'time', maskDigitsToTimeString(e.target.value))}
                                              />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="col-weight set-input-field">
                                              <input
                                                type="text"
                                                inputMode="decimal"
                                                value={set.weight}
                                                onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'weight', e.target.value)}
                                              />
                                            </div>
                                            <div className="col-reps set-input-field">
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                value={set.reps}
                                                onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'reps', e.target.value)}
                                              />
                                            </div>
                                          </>
                                        )}
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
                            );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Add Exercise — opens the shared Hevy-style picker (same as client) */}
                      <div className="add-exercise-selector-box" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginBottom: '24px' }}>
                        <button
                          type="button"
                          className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth"
                          onClick={() => setExercisePickerContext('editor')}
                        >
                          ➕ Add Exercise
                        </button>
                      </div>

                      {/* Editor actions */}
                      <div className="editor-actions-row" style={{ display: 'flex', gap: 0 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPlanEditor(false);
                            setEditingPlan(null);
                            setEditorPlanName('');
                            setEditorExercises([]);
                          }}
                          style={{ flex: 1, padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePlan}
                          style={{ flex: 1, padding: '10px 16px', background: 'var(--primary-accent-light)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                          Assign to client
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
                                        createdBy: 'coach',
                                        // Duplicating a not-yet-assigned plan shouldn't
                                        // silently assign + notify the client — the
                                        // copy starts in the same state as the original.
                                        isAssigned: plan.isAssigned !== false
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

                  {/* Live Timer + Calorie readout — starts automatically the
                      first time a set is marked done, so it reflects real
                      working time rather than setup time. Elapsed/calories
                      are recomputed from timestamps every render (session
                      start + pause windows + each set's completion time),
                      never from an incrementing counter, so getting
                      distracted or leaving this tab open never causes drift. */}
                  <div className="live-timer-bar">
                    {liveTimerStatus === 'idle' ? (
                      <span className="live-timer-idle-hint">⏱ Timer starts when you log your first set</span>
                    ) : (
                      <>
                        <span className={`live-timer-value ${liveTimerStatus === 'paused' ? 'is-paused' : ''}`}>
                          ⏱ {formatDuration(liveElapsedSeconds)}
                          {liveTimerStatus === 'paused' && <span className="live-timer-paused-tag">Paused</span>}
                        </span>
                        <span className="live-timer-kcal">🔥 {liveCalories.totalKcal} kcal</span>
                        {liveTimerStatus === 'running' ? (
                          <button type="button" className="live-timer-btn" onClick={handlePauseLiveTimer}>⏸ Pause</button>
                        ) : (
                          <button type="button" className="live-timer-btn" onClick={handleResumeLiveTimer}>▶ Resume</button>
                        )}
                      </>
                    )}
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
                                sets: ex.sets.map(s => isCardioExercise(ex.name)
                                  ? { distanceKm: s.distanceKm ?? '', time: s.time ?? '', isCompleted: false }
                                  : isTimedExercise(ex.name)
                                  ? { time: s.time ?? '', isCompleted: false }
                                  : { reps: s.reps.toString(), weight: s.weight.toString(), isCompleted: false })
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
                    {liveExercises.map((ex, exIdx) => {
                    const exIsCardio = isCardioExercise(ex.name);
                    return (
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
                        <div className="hevy-sets-table">
                          <div className="hevy-table-header">
                            <span className="col-set">SET</span>
                            <span className="col-prev">PREVIOUS</span>
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
                            ) : (
                              <>
                                <span className="col-weight">WEIGHT (KG)</span>
                                <span className="col-reps">REPS</span>
                              </>
                            )}
                            <span className="col-check">DONE</span>
                          </div>
                          <div className="hevy-table-body">
                            {ex.sets.map((set, setIdx) => {
                              const liveWorkingNum = ex.sets.slice(0, setIdx + 1).filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                              const liveLabel = set.setType === 'failure' ? 'F' : set.setType === 'drop' ? 'D' : set.isWarmup ? 'W' : liveWorkingNum;
                              const prevStats = getPreviousSessionSet(ex.name, setIdx);
                              return (
                              <div key={setIdx} className={`hevy-set-row ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}>
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
                                <span className="col-prev set-prev-lbl">{prevStats}</span>
                                {exIsCardio ? (
                                  <>
                                    <div className="col-weight set-input-field">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={set.distanceKm}
                                        onChange={e => handleLiveSetChange(exIdx, setIdx, 'distanceKm', e.target.value)}
                                      />
                                    </div>
                                    <div className="col-reps set-input-field">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="mm:ss"
                                        value={set.time}
                                        onChange={e => handleLiveSetChange(exIdx, setIdx, 'time', maskDigitsToTimeString(e.target.value))}
                                      />
                                    </div>
                                  </>
                                ) : isTimedExercise(ex.name) ? (
                                  <>
                                    <div className="col-weight" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 8px' }}>
                                      {(() => {
                                        // Once the set is completed, its time is frozen in set.time —
                                        // the live timer entry is deleted on completion (see
                                        // handleLiveSetStopwatchComplete), so reading from liveSetTimers
                                        // here would show 00:00 instead of the saved duration.
                                        if (set.isCompleted) {
                                          return (
                                            <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: '#fff' }}>
                                              {set.time || formatSecondsToTimeString(0)}
                                            </span>
                                          );
                                        }
                                        const timerKey = getSetTimerKey(exIdx, setIdx);
                                        const timer = liveSetTimers[timerKey];
                                        const isRunning = timer?.isRunning || false;
                                        const elapsedSeconds = getLiveSetElapsedSeconds(exIdx, setIdx);
                                        const timeStr = formatSecondsToTimeString(elapsedSeconds);
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => isRunning ? handleLiveSetStopwatchPause(exIdx, setIdx) : handleLiveSetStopwatchStart(exIdx, setIdx)}
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
                                            <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: '#fff' }}>
                                              {timeStr}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <div className="col-reps"></div>
                                  </>
                                ) : (
                                  <>
                                    <div className="col-weight set-input-field">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={set.weight}
                                        onChange={e => handleLiveSetChange(exIdx, setIdx, 'weight', e.target.value)}
                                      />
                                    </div>
                                    <div className="col-reps set-input-field">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={set.reps}
                                        onChange={e => handleLiveSetChange(exIdx, setIdx, 'reps', e.target.value)}
                                      />
                                    </div>
                                  </>
                                )}
                                <div className="col-check set-actions-field">
                                  <button
                                    type="button"
                                    className={`btn-hevy-check ${set.isCompleted ? 'completed' : ''}`}
                                    onClick={() => isTimedExercise(ex.name) && !set.isCompleted ? handleLiveSetStopwatchComplete(exIdx, setIdx) : handleLiveToggleSet(exIdx, setIdx)}
                                    title={isTimedExercise(ex.name) && !set.isCompleted ? "Save time and complete" : (set.isCompleted ? 'Mark incomplete' : 'Mark complete')}
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
                    );
                    })}
                  </div>

                  {/* Add Exercise — opens the shared Hevy-style picker (same as client) */}
                  <button
                    type="button"
                    className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth"
                    onClick={() => setExercisePickerContext('live')}
                  >
                    ➕ Add Exercise
                  </button>

                  {/* Coach note — hidden behind a toggle. The composer has NO
                      Send button of its own: whatever's typed here goes out
                      together with "Save Workout Session" below, via the same
                      saveCoachNote + coach_note push path, so it lands on the
                      client's home screen exactly like a push notification
                      (CoachNoteBanner fallback). No new mechanism. */}
                  <button
                    type="button"
                    className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth"
                    onClick={() => setShowLiveCoachNote(v => !v)}
                    style={{
                      background: showLiveCoachNote ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.05)',
                      border: showLiveCoachNote ? '1px solid rgba(139,92,246,0.45)' : '1px solid rgba(255,255,255,0.12)',
                      color: showLiveCoachNote ? 'var(--primary-accent-light, #a78bfa)' : '#fff',
                      marginTop: '16px'
                    }}
                  >
                    💬 Coach note{coachNoteText.trim() ? ' ✓' : ''} {showLiveCoachNote ? '▲' : '▼'}
                  </button>

                    {showLiveCoachNote && (
                      <div className="coach-note-card" style={{ margin: '10px 0 0' }}>
                        <div className="coach-note-head">
                          <span className="coach-note-title">💬 Note for {(selectedClient.userName || 'client').split(/\s+/)[0]}</span>
                          <span className="coach-note-lastsession">Sends with “Save Workout Session”</span>
                        </div>
                        <div className="coach-note-suggestions">
                          {coachNoteSuggestions.map((sug, i) => (
                            <button
                              key={i}
                              type="button"
                              className="coach-note-chip"
                              disabled={liveSaving}
                              onClick={() => setCoachNoteText(sug)}
                              title="Tap to use — you can still edit before sending"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="coach-note-textarea"
                          placeholder="Write a note to send with this session…"
                          value={coachNoteText}
                          onChange={(e) => setCoachNoteText(e.target.value)}
                          rows={2}
                          disabled={liveSaving}
                        />
                      </div>
                    )}

                  {/* Discard (left) + Save (right) */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowDiscardLiveModal(true)}
                      title="Discard this live session"
                      style={{
                        flex: '0 0 auto',
                        padding: '13px 18px',
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 'var(--radius-md)',
                        color: '#ef4444',
                        fontWeight: 800,
                        fontSize: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ✕
                    </button>
                    <button
                      onClick={handleSaveLiveSession}
                      disabled={liveSaving}
                      style={{
                        flex: 1,
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
                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* Discard live session confirmation modal */}
      {showDiscardLiveModal && (
        <div className="payment-gateway-backdrop warning-modal-backdrop" onClick={() => setShowDiscardLiveModal(false)}>
          <div className="payment-gateway-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>⚠️ DISCARD SESSION</div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: 'var(--text-main)', fontWeight: 700 }}>End this live session?</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  All unsaved sets and timer data will be lost. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setShowDiscardLiveModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'var(--text-muted)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '12px'
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setShowDiscardLiveModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardLiveSession}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                }}
              >
                🗑️ Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard-from-list confirmation modal — for the "Live Log in progress"
          banner on the client directory screen, where a session can be
          discarded without first opening it. */}
      {discardDraftTarget && (
        <div className="payment-gateway-backdrop warning-modal-backdrop" onClick={() => setDiscardDraftTarget(null)}>
          <div className="payment-gateway-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>⚠️ DISCARD SESSION</div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: 'var(--text-main)', fontWeight: 700 }}>
                  End {discardDraftTarget.userName}'s live session?
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  All unsaved sets and timer data will be lost. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setDiscardDraftTarget(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'var(--text-muted)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '12px'
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setDiscardDraftTarget(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardDraftFromList}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                }}
              >
                🗑️ Discard
              </button>
            </div>
          </div>
        </div>
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
