import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../services/databaseService';
import { getLocalDateString, parseLocalDateString, isLocalToday, shiftLocalDateString } from '../utils/dateUtils';
import './TrainerDashboard.css';
import AdminExerciseLibrary from './AdminExerciseLibrary';
import AdminCoachesList from './admin/AdminCoachesList';
import AdminClientsList from './admin/AdminClientsList';
import './WorkoutTracker.css';
// Weekly/Daily/Monthly chart + card styling — shared with the client's own
// WorkoutProgressDashboard so the coach's per-client Workout History tab is
// visually identical (same chart widgets, session cards, heatmap).
import './WorkoutProgressDashboard.css';
import WeeklyMuscleAnalytics from './MuscleAnalytics/WeeklyMuscleAnalytics';
import SetTypeMenu, { getSetTypeVisual } from './SetTypeMenu';
import ExercisePickerModal from './ExercisePickerModal';
import { computeElapsedSeconds, computeLiveCalories, formatDuration, maskDigitsToTimeString, formatSecondsToTimeString, parseTimeStringToSeconds, estimateCardioKcal, estimateCardioDistanceKm, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { notifyEvent } from '../utils/pushNotify';
import { subscribeToPush, unsubscribeFromPush, hasActivePushSubscription } from '../utils/pushSubscription';
import { isCardioExercise, isTimedExercise, isLoadedCarryExercise, isBodyweightExercise } from '../data/exerciseLibrary';
import AIWorkoutBuilderModal from './AIWorkoutBuilderModal';
import ClockTimerModal from './ClockTimerModal';
import { StopwatchIcon, TrashIcon, PlayIcon, PauseIcon } from './TimerIcons';
import { playAlarmBeeps, unlockAudio } from '../utils/alarmSound';
import ExerciseGuideModal from './ExerciseGuideModal';
import ExerciseHistoryModal from './ExerciseHistoryModal';
import { normalizeExerciseForGuide, findExerciseGuideMatch } from '../utils/videoUtils';
import { presetExercises } from './WorkoutTracker';

// Converts one AI-generated exercise (api/generate-workout-draft.js's
// { name, type, setCount, reps, durationMinutes } shape) into this app's
// actual editorExercises shape ({ name, sets: [{reps,weight}|{time}|
// {distanceKm,time}] }) — i.e. the exact same shape handleAddExerciseToEditor
// produces, so the reused plan editor can't tell the difference from an
// exercise a coach added manually. Weight is always 0 — the AI has no basis
// to guess a client's working weights, that's left for the coach to fill in.
const convertAiExerciseToEditorShape = (aiEx) => {
  const type = aiEx.type || 'strength';
  const setCount = Math.max(1, parseInt(aiEx.setCount, 10) || (type === 'cardio' ? 1 : 3));
  let setTemplate;
  if (type === 'cardio') {
    const totalSeconds = Math.round((aiEx.durationMinutes || 20) * 60);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    setTemplate = { distanceKm: '', time: `${mm}:${ss}` };
  } else if (type === 'timed') {
    const totalSeconds = Math.round((aiEx.durationMinutes || 1) * 60);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    setTemplate = { time: `${mm}:${ss}` };
  } else {
    setTemplate = { reps: parseInt(aiEx.reps, 10) || 10, weight: 0 };
  }
  return {
    name: aiEx.name,
    sets: Array.from({ length: setCount }, () => ({ ...setTemplate }))
  };
};

// Same conversion, for a whole day — used once right after generation and
// (defensively) whenever a day is loaded into the editor.
const convertAiDayToEditorShape = (day) => ({
  dayLabel: day.dayLabel,
  focus: day.focus || '',
  planName: day.planName,
  exercises: (day.exercises || []).map(convertAiExerciseToEditorShape)
});

const TrainerDashboard = ({ handleLogout, onReplayDemoTour }) => {
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
    hasActivePushSubscription().then(subscribed => {
      setPushSubscribed(subscribed);
      // The OS/browser can silently drop a push subscription in the
      // background (iOS PWAs are especially aggressive about this after
      // periods of inactivity) — Notification permission stays 'granted' but
      // the underlying subscription is gone, so pushes just silently stop
      // with nothing visible to the coach. Mirrors the client app's own
      // self-healing re-subscribe (see App.jsx's notificationPermission
      // effect): if permission is already granted, resubscribing needs no
      // prompt (requestPermission resolves instantly with no dialog), so do
      // it transparently here too instead of waiting for the coach to notice
      // notifications stopped and manually re-toggle them.
      if (!subscribed && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const coachName = localStorage.getItem('userName');
        subscribeToPush(coachName).then(() => setPushSubscribed(true));
      }
    });
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

  // Clients who just finished a workout and haven't received a coach note for
  // that session yet — the home-screen fallback for a missed "workout
  // completed" push. Each card has its own inline note composer (chips +
  // textarea), so the coach can respond right from home without opening the
  // client. coachNoteDrafts maps clientId → the text typed in that card.
  const [sessionsAwaitingNote, setSessionsAwaitingNote] = useState([]);
  const [coachNoteDrafts, setCoachNoteDrafts] = useState({});
  const [sendingNoteFor, setSendingNoteFor] = useState(null); // clientId currently sending
  // When multiple clients are awaiting a note, the cards become a horizontal
  // slider (one visible at a time) — this is the active slide index, plus the
  // direction of the last move (1 = forward/next, -1 = back/previous) so the
  // card can animate in from the matching side.
  const [awaitingSlide, setAwaitingSlide] = useState(0);
  const [awaitingSlideDir, setAwaitingSlideDir] = useState(1);
  const goToAwaitingSlide = (nextIndex, count) => {
    setAwaitingSlideDir(nextIndex > awaitingSlide || (awaitingSlide === count - 1 && nextIndex === 0) ? 1 : -1);
    setAwaitingSlide(nextIndex);
  };

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

  // "Send renewal reminder" button — shown once this client's sessions-left
  // drops to 4 or fewer, manually triggered by the coach (not automatic).
  const [sendingSessionReminder, setSendingSessionReminder] = useState(false);
  const [sessionReminderSentMsg, setSessionReminderSentMsg] = useState('');

  // Selected client workout plans state
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editorPlanName, setEditorPlanName] = useState('');
  const [editorExercises, setEditorExercises] = useState([]);
  // Which surface opened the shared exercise picker: 'editor' | 'live' | null
  const [exercisePickerContext, setExercisePickerContext] = useState(null);
  // "How to perform this exercise" sheet, opened from the picker's
  // clickable thumbnail icon and each exercise row's own "Form Guide"
  // button — see ExerciseGuideModal.
  const [activeGuideExercise, setActiveGuideExercise] = useState(null);
  // Exercise history sheet — opened by tapping an exercise's name in the
  // Live Log; reads from rawWorkoutLogs (already scoped to selectedClient).
  const [historyModalExercise, setHistoryModalExercise] = useState(null);
  // The exercises table has real video_url/setup/execution/tip data for the
  // curated preset list (see databaseService.seedExerciseLibrary) — same
  // source the client's Form Guide already uses. Fetched once here so the
  // coach side gets real videos too instead of only the generic fallback.
  const [guideExercisesList, setGuideExercisesList] = useState([]);
  useEffect(() => {
    databaseService.getExerciseLibrary().then(setGuideExercisesList).catch(err => console.error(err));
  }, []);
  const handleShowFormGuide = (name) => {
    // presetExercises (imported from WorkoutTracker) is the same ~16-video
    // dataset seeded into the DB, hardcoded client-side — a redundant local
    // fallback so a transient fetch failure/timeout doesn't leave the guide
    // stuck on the generic no-video text for exercises that really do have
    // one (this was the reported "few clients not seeing the link" gap: the
    // DB fetch was the *only* source, so any network hiccup meant total
    // silent loss, not just a brief delay).
    const matched = findExerciseGuideMatch(guideExercisesList, name) ||
                    findExerciseGuideMatch(presetExercises, name);
    if (matched) {
      setActiveGuideExercise(normalizeExerciseForGuide(matched));
      return;
    }
    // No video/guide data for this one (custom exercise, or outside the
    // curated preset list) — a generic setup/execution/tip fallback still
    // gives a real "how to perform this" guide, matching what an unmatched
    // custom exercise shows on the client.
    setActiveGuideExercise({
      name,
      category: 'Exercise',
      videoFile: '',
      guide: {
        target: 'Primary Muscle Group',
        setup: 'Position yourself comfortably with stable support and check alignment.',
        execution: 'Control the weights through a full range of motion. Keep core tight.',
        tip: 'Focus on mind-muscle connection and avoid using momentum.'
      }
    });
  };

  // ── AI Workout Draft Builder ──
  // "Create Workout Plan" now asks Build Manually vs Create Draft with AI
  // before opening the (unchanged) editor below. An AI draft is a set of
  // per-day plans (aiDraftDays) reviewed/edited through that SAME editor —
  // isAiDraftMode just changes what the editor's save button does (batch-
  // assign every day) instead of duplicating the editor UI. Nothing is
  // saved/assigned until the coach presses that final button; generation
  // itself (api/generate-workout-draft.js) never touches the database.
  const [showCreatePlanChoice, setShowCreatePlanChoice] = useState(false);
  const [showAIBuilder, setShowAIBuilder] = useState(false);
  const [isAiDraftMode, setIsAiDraftMode] = useState(false);
  const [aiDraftDays, setAiDraftDays] = useState([]); // [{ dayLabel, focus, planName, exercises }]
  const [activeAiDraftDayIndex, setActiveAiDraftDayIndex] = useState(0);
  const [aiDraftSummary, setAiDraftSummary] = useState('');
  const [assigningAiDraft, setAssigningAiDraft] = useState(false);
  // Which assigned-plan card's ⋮ menu (Edit/Duplicate/Delete/More details)
  // is open — one at a time, keyed by plan id.
  const [openPlanCardMenuId, setOpenPlanCardMenuId] = useState(null);
  // Bulk-assign — create/AI-draft flows only (editing an existing plan stays
  // single-client, since that plan already belongs to one client's row).
  // extraAssignClientIds holds the OTHER clients beyond selectedClient who'll
  // each get their own independent copy of the plan on save.
  const [showClientPickerModal, setShowClientPickerModal] = useState(false);
  const [clientPickerSearch, setClientPickerSearch] = useState('');
  const [extraAssignClientIds, setExtraAssignClientIds] = useState([]);

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
  // Same fetch as workoutLogs, kept in its raw flat (per-set) shape — the
  // Muscle Analytics tab's utils (muscleAnalytics.js) operate on individual
  // log_date/exercise_name/weight_kg/reps rows, not the grouped per-date
  // session objects `workoutLogs` holds.
  const [rawWorkoutLogs, setRawWorkoutLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  // Workout History tab timeframe filter: 'weekly' (last 7 days), 'daily'
  // (today), or 'monthly' (last 30 days) — same control as Workout Summary.
  const [historyTimeframe, setHistoryTimeframe] = useState('weekly');
  // Selected date for the Daily view / calendar heatmap clicks — mirrors the
  // client's own WorkoutProgressDashboard selectedDateStr.
  const [historyDateStr, setHistoryDateStr] = useState(() => getLocalDateString());
  // 0 = current week, -1 = last week, etc. — same week navigation the client
  // has on their own weekly chart.
  const [historyWeekOffset, setHistoryWeekOffset] = useState(0);

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
  // Rest/warmup timer popup (ClockTimerModal) — purely a stopwatch/timer
  // utility, no data saved, so a single open/closed flag is all it needs.
  const [showClockTimer, setShowClockTimer] = useState(false);

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
  // Floating rest-between-sets timer — same behavior/UI as the client's own
  // logger (WorkoutTracker.jsx): starts automatically whenever a set is
  // marked complete, alarms + blinks "Rest over" when it hits 0.
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restPulseKey, setRestPulseKey] = useState(0);
  const [restJustFinished, setRestJustFinished] = useState(false);
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

  // Rest-between-sets countdown — same behavior as the client's own logger
  // (WorkoutTracker.jsx): swaps to a blinking "Rest over" card + alarm beeps
  // instead of a toast when it hits 0, then clears itself shortly after.
  useEffect(() => {
    let interval = null;
    if (restTimerActive && restSecondsRemaining > 0) {
      interval = setInterval(() => {
        setRestSecondsRemaining(prev => {
          if (prev <= 1) {
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

  const resetLiveTimer = () => {
    setLiveTimerStatus('idle');
    setLiveTimerStartedAt(null);
    setLivePauseIntervals([]);
  };

  const handlePauseLiveTimer = () => {
    if (liveTimerStatus !== 'running') return;
    setLivePauseIntervals((prev) => [...prev, { pausedAt: Date.now(), resumedAt: null }]);
    setLiveTimerStatus('paused');
    // Pausing the whole session should also freeze any cardio set actively
    // running underneath it — otherwise that stopwatch (and its live
    // calories) kept ticking on its own even though the session clock
    // itself had stopped.
    liveExercises.forEach((ex, exIdx) => {
      if (!isCardioExercise(ex.name)) return;
      ex.sets.forEach((set, setIdx) => {
        const timer = liveSetTimers[getSetTimerKey(exIdx, setIdx)];
        if (timer?.isRunning) handleLiveCardioStopwatchPause(exIdx, setIdx);
      });
    });
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
    // Same resume-from-typed-value fallback as handleLiveCardioStopwatchStart:
    // if there's no timer entry yet (fresh set, or one whose time the coach
    // typed in by hand instead of running the stopwatch), start from the
    // set's own saved `time` instead of always restarting at 0.
    const existingPausedDuration = liveSetTimers[key]?.pausedDuration;
    const pausedDuration = existingPausedDuration != null
      ? existingPausedDuration
      : (parseTimeStringToSeconds(liveExercises[exIdx]?.sets[setIdx]?.time) || 0);
    setLiveSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration }
    }));
  };

  const handleLiveSetStopwatchPause = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    const elapsed = getLiveSetElapsedSeconds(exIdx, setIdx);
    // Sync into set.time on pause (not just on Complete) — without this the
    // time field had no manually-editable value to show while paused, since
    // the live count only ever lived in liveSetTimers, not on the set itself.
    handleLiveSetChange(exIdx, setIdx, 'time', formatSecondsToTimeString(elapsed));
    setLiveSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: false, startedAt: null, pausedDuration: elapsed }
    }));
  };

  // Cardio sets (Running, Jogging, Cycling, Cross Trainer, Incline Walk,
  // Treadmill Walk) reuse the same per-set stopwatch infra as timed
  // exercises — two differences (see the client's WorkoutTracker.jsx for
  // the matching version):
  // 1. TIME stays live-editable throughout instead of freezing on Complete,
  //    so pausing writes the ticked value into set.time.
  // 2. No GPS/sensor exists to measure real distance, so while running, KM
  //    auto-fills from an assumed average pace (estimateCardioDistanceKm) —
  //    tracked via the timer's `autoKm` flag, true by default, flipped to
  //    false the moment the coach types their own number.
  const handleLiveCardioStopwatchStart = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    // A normal pause leaves the timer entry in place with its pausedDuration
    // — but ticking a set complete deletes the entry entirely (see
    // handleLiveCardioSetComplete), so un-ticking and pressing Start again
    // found no entry here and always restarted from 0, discarding the
    // time/km that had already accumulated. Falling back to the set's own
    // saved `time` field (which survives both complete and un-complete)
    // instead of a bare 0 makes Start always resume from wherever it was
    // actually left, not just within the same uninterrupted run.
    const existingPausedDuration = liveSetTimers[key]?.pausedDuration;
    const pausedDuration = existingPausedDuration != null
      ? existingPausedDuration
      : (parseTimeStringToSeconds(liveExercises[exIdx]?.sets[setIdx]?.time) || 0);
    setLiveSetTimers(prev => ({
      ...prev,
      [key]: { isRunning: true, startedAt: Date.now(), pausedDuration, autoKm: true }
    }));
  };

  const handleLiveCardioKmEdit = (exIdx, setIdx, value) => {
    // distanceKmAuto lives on the set itself (not just the ephemeral timer
    // entry) so a manual KM edit sticks even when there's no active
    // stopwatch — e.g. the coach typed a time by hand first (see
    // handleLiveCardioTimeEdit) and then corrects the KM it auto-filled.
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => si === setIdx ? { ...s, distanceKm: value, distanceKmAuto: false } : s)
      };
    }));
    const key = getSetTimerKey(exIdx, setIdx);
    setLiveSetTimers(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], autoKm: false } } : prev));
  };

  // Typing a time directly (stopwatch never started, or paused and being
  // corrected) used to leave KM frozen at whatever it last was. This mirrors
  // the running-stopwatch auto-fill (estimateCardioDistanceKm) for
  // manually-typed time too, unless the coach has already typed their own
  // KM for this set (distanceKmAuto === false).
  const handleLiveCardioTimeEdit = (exIdx, setIdx, rawValue) => {
    const masked = maskDigitsToTimeString(rawValue);
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, si) => {
          if (si !== setIdx) return s;
          const next = { ...s, time: masked };
          if (s.distanceKmAuto !== false) {
            const seconds = parseTimeStringToSeconds(masked) || 0;
            next.distanceKm = seconds > 0 ? String(estimateCardioDistanceKm(ex.name, seconds)) : '';
          }
          return next;
        })
      };
    }));
  };

  const handleLiveCardioStopwatchPause = (exIdx, setIdx) => {
    const elapsed = getLiveSetElapsedSeconds(exIdx, setIdx);
    handleLiveSetChange(exIdx, setIdx, 'time', formatSecondsToTimeString(elapsed));
    const key = getSetTimerKey(exIdx, setIdx);
    const timer = liveSetTimers[key];
    if (timer?.autoKm) {
      const exName = liveExercises[exIdx]?.name;
      handleLiveSetChange(exIdx, setIdx, 'distanceKm', String(estimateCardioDistanceKm(exName, elapsed)));
    }
    handleLiveSetStopwatchPause(exIdx, setIdx);
  };

  const handleLiveSetStopwatchComplete = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    // If the stopwatch was never started for this set (coach typed the
    // time in by hand instead of running it), there's no liveSetTimers
    // entry — getLiveSetElapsedSeconds would then read 0 and stomp the
    // typed value the moment the set gets ticked. Only fall back to the
    // live timer's elapsed time when a timer entry actually exists;
    // otherwise keep whatever's already in set.time.
    const elapsed = liveSetTimers[key]
      ? getLiveSetElapsedSeconds(exIdx, setIdx)
      : (parseTimeStringToSeconds(liveExercises[exIdx]?.sets[setIdx]?.time) || 0);
    handleLiveSetChange(exIdx, setIdx, 'time', formatSecondsToTimeString(elapsed));
    handleLiveToggleSet(exIdx, setIdx);
    setLiveSetTimers(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  // Ticking a cardio set's checkbox while its stopwatch is still running
  // used to leave that timer ticking in the background — the row showed
  // "completed" styling but the clock and live calories kept climbing
  // underneath. This finalizes the timer first (freeze time, sync the KM
  // estimate if it was still auto-driving) and clears it, THEN marks the
  // set complete.
  const handleLiveCardioSetComplete = (exIdx, setIdx) => {
    const key = getSetTimerKey(exIdx, setIdx);
    const timer = liveSetTimers[key];
    if (timer?.isRunning) {
      const elapsed = getLiveSetElapsedSeconds(exIdx, setIdx);
      handleLiveSetChange(exIdx, setIdx, 'time', formatSecondsToTimeString(elapsed));
      if (timer.autoKm) {
        const exName = liveExercises[exIdx]?.name;
        handleLiveSetChange(exIdx, setIdx, 'distanceKm', String(estimateCardioDistanceKm(exName, elapsed)));
      }
      setLiveSetTimers(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
    handleLiveToggleSet(exIdx, setIdx);
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

  // Latest logged weight (clientMeasurements, freshest) beats the cached
  // clients.weight_kg snapshot on selectedClient.userWeight — see the
  // matching comment on the Weight (kg) stat tile above.
  const resolvedClientWeightKg = parseFloat(clientMeasurements[0]?.measurements?.weight) || parseFloat(selectedClient?.userWeight) || DEFAULT_BODY_WEIGHT_KG;

  const liveElapsedSeconds = computeElapsedSeconds(liveTimerStartedAt, livePauseIntervals);
  // computeLiveCalories only counts COMPLETED sets, so an in-progress cardio
  // set contributed nothing here — the per-row time/kcal and this top
  // readout disagreed. This adds each not-yet-completed cardio set's own
  // live estimate on top, driven by elapsed time regardless of
  // running/paused:
  // - RUNNING: elapsed climbs live off the timer, same as the per-row clock.
  // - PAUSED (not completed): elapsed reads the frozen set.time value that
  //   pausing already synced there, so the total holds steady instead of
  //   dropping to 0 and then jumping back up on resume.
  // - COMPLETED: excluded here on purpose — computeLiveCalories's own
  //   completed-set branch already counts it from the same final
  //   time/distanceKm, so nothing is double-counted or lost when a set gets
  //   ticked or un-ticked.
  const liveRunningCardioKcal = liveExercises.reduce((sum, ex, exIdx) => {
    if (!isCardioExercise(ex.name)) return sum;
    return sum + ex.sets.reduce((s, set, setIdx) => {
      if (set.isCompleted) return s;
      const timer = liveSetTimers[getSetTimerKey(exIdx, setIdx)];
      const isRunning = timer?.isRunning || false;
      const elapsed = isRunning ? getLiveSetElapsedSeconds(exIdx, setIdx) : (parseTimeStringToSeconds(set.time) || 0);
      if (elapsed <= 0) return s;
      const km = (isRunning && timer?.autoKm !== false) ? estimateCardioDistanceKm(ex.name, elapsed) : set.distanceKm;
      return s + estimateCardioKcal(ex.name, km, elapsed, resolvedClientWeightKg);
    }, 0);
  }, 0);
  const liveCaloriesBase = computeLiveCalories(liveExercises, liveTimerStartedAt, livePauseIntervals, resolvedClientWeightKg);
  const liveCalories = { ...liveCaloriesBase, totalKcal: Math.round((liveCaloriesBase.totalKcal + liveRunningCardioKcal) * 10) / 10 };

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
    const bodyweight = isBodyweightExercise(name);
    if (isCardioExercise(name)) {
      newSet = { distanceKm: '', time: '', isCompleted: false };
    } else if (isTimedExercise(name)) {
      newSet = { time: '', isCompleted: false };
    } else if (bodyweight) {
      newSet = { reps: '10', weight: '0', isCompleted: false };
    } else {
      newSet = { reps: '10', weight: '20', isCompleted: false };
    }
    setLiveExercises(prev => [
      ...prev,
      bodyweight ? { name, sets: [newSet], bodyweightMode: true } : { name, sets: [newSet] }
    ]);
  };

  // Bodyweight exercises default to no added weight. An exercise added
  // before this toggle existed (or loaded from an older plan) has no
  // bodyweightMode field at all — infer it from whether any set already has
  // a nonzero weight typed in, so existing data doesn't get clobbered by
  // switching to "BW" and wiping it.
  const getLiveExBwMode = (ex) =>
    ex.bodyweightMode !== undefined ? ex.bodyweightMode : !ex.sets.some(s => Number(s.weight) > 0);

  // Toggling to "+ Weight" clears the weight field so the coach types the
  // plate/vest load; toggling back to Bodyweight zeroes it out again for
  // every set.
  const handleToggleLiveBodyweightMode = (exIdx) => {
    setLiveExercises(prev => prev.map((ex, idx) => {
      if (idx !== exIdx) return ex;
      const nextMode = !getLiveExBwMode(ex);
      return {
        ...ex,
        bodyweightMode: nextMode,
        sets: ex.sets.map(s => ({ ...s, weight: nextMode ? '0' : '' }))
      };
    }));
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
    // Real click, right here — unlocks audio for the rest timer's alarm,
    // which fires later from a setInterval tick (see alarmSound.js).
    unlockAudio();
    const now = Date.now();
    const togglingSetOn = !liveExercises[exIdx]?.sets[setIdx]?.isCompleted;
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
    // Marking a set complete (not un-completing one) auto-starts the rest
    // timer, same as the client's own logger.
    if (togglingSetOn) {
      setRestSecondsRemaining(60);
      setRestTimerActive(true);
      setRestJustFinished(false);
      setRestPulseKey(k => k + 1);
    }
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
        caloriesBurned: liveTimerStartedAt ? computeLiveCalories(liveExercises, liveTimerStartedAt, livePauseIntervals, resolvedClientWeightKg).totalKcal : null
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
      setRawWorkoutLogs(logs || []);
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

  // localStorage key for finished-workout cards the coach dismissed WITHOUT
  // sending a note. Keyed per session (clientId|date) so a NEW session for the
  // same client resurfaces a fresh card. Scoped per coach.
  const dismissedSessionsKey = `dismissedSessionNotes_${resolvedCoachId || 'anon'}`;
  const getDismissedSessions = () => {
    try { return JSON.parse(localStorage.getItem(dismissedSessionsKey) || '[]'); }
    catch { return []; }
  };

  // Keep the slider's active index in range as cards are sent/dismissed —
  // otherwise clearing the last card could leave the index pointing past the
  // end of the (now shorter) array.
  useEffect(() => {
    if (awaitingSlide > 0 && awaitingSlide >= sessionsAwaitingNote.length) {
      setAwaitingSlide(Math.max(0, sessionsAwaitingNote.length - 1));
    }
  }, [sessionsAwaitingNote.length, awaitingSlide]);

  const refreshSessionsAwaitingNote = async () => {
    if (!resolvedCoachId) return;
    const sessions = await databaseService.getSessionsAwaitingCoachNote(resolvedCoachId);
    const dismissed = getDismissedSessions();
    setSessionsAwaitingNote(sessions.filter(s => !dismissed.includes(`${s.clientId}|${s.date}`)));
  };

  // Coach dismisses a finished-workout card without responding — remembered so
  // it doesn't reappear for THIS session (a later session resurfaces one).
  const handleDismissSessionNote = (session) => {
    const key = `${session.clientId}|${session.date}`;
    const dismissed = getDismissedSessions();
    if (!dismissed.includes(key)) {
      localStorage.setItem(dismissedSessionsKey, JSON.stringify([...dismissed, key]));
    }
    setSessionsAwaitingNote(prev => prev.filter(s => `${s.clientId}|${s.date}` !== key));
  };

  // Send a coach note straight from a home-screen finished-workout card. Same
  // saveCoachNote + coach_note push path as the in-detail composer, but scoped
  // to the card's client (not selectedClient). On success the card is removed
  // (the note now covers that session).
  const handleSendSessionNote = async (session) => {
    const message = (coachNoteDrafts[session.clientId] || '').trim();
    if (!message || sendingNoteFor) return;
    setSendingNoteFor(session.clientId);
    try {
      const res = await databaseService.saveCoachNote(session.clientId, resolvedCoachId, message);
      if (!res.success) {
        triggerLiveToast(`⚠️ Couldn't send: ${res.error || 'unknown error'}`);
        return;
      }
      notifyEvent('coach_note', { clientUserId: session.clientId, message });
      setCoachNoteDrafts(prev => { const n = { ...prev }; delete n[session.clientId]; return n; });
      setSessionsAwaitingNote(prev => prev.filter(s => `${s.clientId}|${s.date}` !== `${session.clientId}|${session.date}`));
      triggerLiveToast(`✅ Note sent to ${session.clientName.split(/\s+/)[0]}.`);
    } finally {
      setSendingNoteFor(null);
    }
  };

  // Three ready-to-send suggestions for a finished-workout card, referencing
  // that session's actual stats so the first chip feels personal.
  const buildSessionNoteSuggestions = (session) => {
    const firstName = (session.clientName || '').trim().split(/\s+/)[0] || 'there';
    const statBits = [
      session.durationSeconds != null ? formatDuration(session.durationSeconds) : null,
      session.caloriesBurned != null ? `${session.caloriesBurned} kcal` : null
    ].filter(Boolean).join(', ');
    const opener = statBits
      ? `Great session, ${firstName}! ${statBits} — solid work 💪`
      : `Great work today, ${firstName}! Really solid session 💪`;
    return [
      opener,
      `Proud of your consistency this week — keep it going! 🔥`,
      `How did that feel? Let me know if anything was too easy or too tough.`
    ];
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
    refreshSessionsAwaitingNote();
    const refreshBoth = () => { refreshCoachActiveDrafts(); refreshPendingClientReplies(); refreshSessionsAwaitingNote(); };
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
      refreshSessionsAwaitingNote();
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

  // Manual, coach-triggered nudge once this client's sessions-left ≤ 4 — a
  // push notification only; never sent automatically.
  const handleSendSessionReminder = async () => {
    if (!selectedClient || sendingSessionReminder) return;
    const sessionsLeft = selectedClient.total_sessions != null ? selectedClient.total_sessions - workoutLogs.length : null;
    setSendingSessionReminder(true);
    setSessionReminderSentMsg('');
    try {
      notifyEvent('session_reminder', { clientUserId: selectedClient.id, sessionsLeft });
      setSessionReminderSentMsg(`✅ Reminder sent to ${selectedClient.userName || 'the client'}.`);
    } finally {
      setSendingSessionReminder(false);
      setTimeout(() => setSessionReminderSentMsg(''), 3500);
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
    setSessionReminderSentMsg('');
    setHistoryTimeframe('weekly');
    setHistoryDateStr(getLocalDateString());
    setHistoryWeekOffset(0);
    databaseService.getLatestCoachNoteSentAt(client.id).then(setLastCoachNoteSentAt);
    // Fetch measurement history up front (not just when the Measurements tab
    // is opened) — the "Weight (kg)" stat tile above the tabs needs the
    // client's latest logged weight to not go stale the moment they log it
    // via Measurements instead of the top-level profile edit (the only other
    // path that updates clients.weight_kg, which this tile used to read
    // exclusively).
    setClientMeasurements([]);
    databaseService.getBodyMeasurements(client.id).then(setClientMeasurements);
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
    setRawWorkoutLogs([]);
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
      setRawWorkoutLogs(allLogs);

      // The Weekly History view hard-defaults to "This week" (handleSelectClient
      // resets historyWeekOffset to 0) — if the client's most recent session
      // falls outside it, the chart just looks empty with nothing on screen
      // hinting that a ‹ click would reveal real, recently-logged history.
      // Jump straight to the most recent session's week instead, so a
      // client who genuinely finished a workout never appears to have
      // logged nothing.
      if (grouped.length > 0) {
        const mondayStart = (d) => {
          const copy = new Date(d);
          const day = copy.getDay();
          copy.setDate(copy.getDate() - day + (day === 0 ? -6 : 1));
          copy.setHours(0, 0, 0, 0);
          return copy;
        };
        const startOfThisWeek = mondayStart(new Date());
        const startOfSessionWeek = mondayStart(parseLocalDateString(grouped[0].date));
        if (startOfSessionWeek < startOfThisWeek) {
          const weeksBack = Math.round((startOfThisWeek - startOfSessionWeek) / (7 * 86400000));
          setHistoryWeekOffset(-weeksBack);
        }
      }

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
    // Latest created_at per date, so "has this session been responded to?"
    // can compare against when the session actually landed rather than just
    // its calendar day (see sessionNeedsResponse).
    const createdAtByDate = {};

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
      if (log.created_at && (createdAtByDate[date] == null || log.created_at > createdAtByDate[date])) {
        createdAtByDate[date] = log.created_at;
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
          createdAt: createdAtByDate[dateStr] ?? null,
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

  // Shared by the single-plan save below and the AI-draft batch-assign —
  // strips the editor's in-progress set shape down to what actually gets
  // persisted (same cleanup handleSavePlan always did).
  const cleanEditorExercises = (exercises) => exercises.map(ex => {
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

  // Opens the plan editor exactly as the "Create Workout Plan" button always
  // has — unchanged from before the AI option existed. Used both directly
  // (editing an existing plan) and as the "Build Manually" choice.
  const openManualPlanEditor = () => {
    setIsAiDraftMode(false);
    setAiDraftDays([]);
    setAiDraftSummary('');
    setEditingPlan(null);
    setEditorPlanName('');
    setEditorExercises([
      { name: 'Bench Press', sets: [{ reps: 10, weight: 40 }] }
    ]);
    setExtraAssignClientIds([]);
    setShowCreatePlanChoice(false);
    setShowPlanEditor(true);
  };

  // AIWorkoutBuilderModal's onGenerated — loads the first day into the
  // existing editor and stashes the rest in aiDraftDays for the day tabs.
  // Nothing is saved yet; see handleSavePlan's isAiDraftMode branch.
  const handleAiDraftGenerated = (draft) => {
    const days = (draft.days || []).map(convertAiDayToEditorShape);
    if (days.length === 0) return;
    setAiDraftDays(days);
    setAiDraftSummary(draft.programSummary || '');
    setActiveAiDraftDayIndex(0);
    setEditingPlan(null);
    setEditorPlanName(days[0].planName);
    setEditorExercises(days[0].exercises);
    setExtraAssignClientIds([]);
    setIsAiDraftMode(true);
    setShowAIBuilder(false);
    setShowPlanEditor(true);
  };

  // Switching day tabs while reviewing an AI draft: sync whatever the coach
  // just edited on the current tab back into aiDraftDays before loading the
  // next tab's exercises into the (shared, unchanged) editor state.
  const switchAiDraftDay = (newIndex) => {
    if (newIndex === activeAiDraftDayIndex) return;
    const updated = [...aiDraftDays];
    updated[activeAiDraftDayIndex] = {
      ...updated[activeAiDraftDayIndex],
      planName: editorPlanName,
      exercises: editorExercises
    };
    setAiDraftDays(updated);
    setActiveAiDraftDayIndex(newIndex);
    setEditorPlanName(updated[newIndex].planName);
    setEditorExercises(updated[newIndex].exercises);
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

    // Bulk-assign targets: the currently selected client plus any extras
    // picked via "Assign to more clients" — editing an existing plan stays
    // single-client (that plan already belongs to one client's row), so
    // extras are only honored when creating a fresh plan/AI draft.
    const targetClientIds = editingPlan
      ? [selectedClient.id]
      : Array.from(new Set([selectedClient.id, ...extraAssignClientIds]));

    if (isAiDraftMode) {
      // Batch-assign every reviewed day, to every target client — this is
      // the spec's distinct "Assign Workout Plan" action, only reachable
      // after the coach has seen and can still edit every day via the tabs
      // above.
      setAssigningAiDraft(true);
      try {
        const daysToSave = [...aiDraftDays];
        daysToSave[activeAiDraftDayIndex] = {
          ...daysToSave[activeAiDraftDayIndex],
          planName: editorPlanName,
          exercises: editorExercises
        };
        for (const clientId of targetClientIds) {
          for (const day of daysToSave) {
            if (!day.planName?.trim() || day.exercises.length === 0) continue;
            const plan = {
              id: null,
              userId: clientId,
              planName: day.planName.trim(),
              exercises: cleanEditorExercises(day.exercises),
              createdBy: 'coach',
              isAssigned: true
            };
            await databaseService.saveWorkoutPlan(plan);
          }
          notifyEvent('plan_assigned', {
            clientUserId: clientId,
            planName: daysToSave.length === 1 ? daysToSave[0].planName : `${daysToSave.length} new workout plans`
          });
        }
        setShowPlanEditor(false);
        setIsAiDraftMode(false);
        setAiDraftDays([]);
        setAiDraftSummary('');
        setActiveAiDraftDayIndex(0);
        setEditingPlan(null);
        setEditorPlanName('');
        setEditorExercises([]);
        setExtraAssignClientIds([]);
        fetchClientPlans(selectedClient.id);
      } finally {
        setAssigningAiDraft(false);
      }
      return;
    }

    const cleanExercises = cleanEditorExercises(editorExercises);
    const trimmedPlanName = editorPlanName.trim();
    for (const clientId of targetClientIds) {
      const plan = {
        id: clientId === selectedClient.id && editingPlan ? editingPlan.id : null,
        userId: clientId,
        planName: trimmedPlanName,
        exercises: cleanExercises,
        createdBy: 'coach',
        // The editor's button reads "Assign to client" — this is the deliberate
        // assignment action, so it always sets isAssigned: true, even when
        // editing a plan that started out unassigned (e.g. one auto-saved from
        // Live Log). That's how such a plan becomes visible to the client.
        isAssigned: true
      };
      await databaseService.saveWorkoutPlan(plan);
      // Notify each client their coach sent them a new workout plan.
      notifyEvent('plan_assigned', { clientUserId: clientId, planName: trimmedPlanName });
    }
    setShowPlanEditor(false);
    setEditingPlan(null);
    setEditorPlanName('');
    setEditorExercises([]);
    setExtraAssignClientIds([]);
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
  // "Predates" compares against the session's real createdAt, NOT its calendar
  // day: a coach who'd already sent this client a note earlier the same day
  // would otherwise see no card for anything the client logged afterwards,
  // for the rest of that day. Falls back to start-of-day for legacy rows with
  // no created_at. This still keeps the card from resurfacing for a session
  // from days ago every time the coach reopens the client, since the decision
  // comes from the DB (lastCoachNoteSentAt, fetched in handleSelectClient),
  // not from React state that reset on every remount.
  const sessionNeedsResponse = latestClientSession && (
    !lastCoachNoteSentAt || new Date(lastCoachNoteSentAt) < new Date(latestClientSession.createdAt || `${latestClientSession.date}T00:00:00`)
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

  // Same three suggestions, but for the Live Log's coach-note composer —
  // that note sends alongside THIS in-progress session, so it must reference
  // the live timer/calories, not the client's last SAVED session (which is
  // what coachNoteSuggestions above uses and would show stale, previous-day
  // numbers while a live session is still running).
  const liveCoachNoteSuggestions = (() => {
    const firstName = (selectedClient?.userName || '').trim().split(/\s+/)[0] || 'there';
    const statBits = liveTimerStartedAt
      ? [formatDuration(liveElapsedSeconds), `${liveCalories.totalKcal} kcal`].join(', ')
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
          {!superAdmin && onReplayDemoTour && (
            <button
              type="button"
              onClick={onReplayDemoTour}
              title="Watch the quick app tutorial again"
              aria-label="Watch app tutorial"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                borderRadius: '50%', padding: '8px',
                cursor: 'pointer'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
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
                          <button type="button" title="Resume" style={{
                            background: 'transparent', color: '#fbbf24',
                            border: 'none', padding: '4px 6px', display: 'flex', alignItems: 'center', cursor: 'pointer'
                          }}>
                            <PlayIcon size={22} />
                          </button>
                          <button
                            type="button"
                            title="Discard this live session"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiscardDraftTarget({ userId: draft.userId, userName: draftClient?.userName || 'this client' });
                            }}
                            style={{
                              background: 'transparent', border: 'none',
                              color: '#ef4444', padding: '4px 6px', display: 'flex', alignItems: 'center', cursor: 'pointer'
                            }}
                          >
                            <TrashIcon size={22} />
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

              {/* Client finished a workout, no coach note sent yet — fallback
                  for a missed "workout completed" push. Lives on the home
                  screen (not inside any client's detail tabs) with an inline
                  note composer, so the coach can respond right here. With
                  more than one pending client, this becomes a one-at-a-time
                  slider (arrows + clickable dots) instead of a tall stack. */}
              {sessionsAwaitingNote.length > 0 && (() => {
                const activeIndex = Math.min(awaitingSlide, sessionsAwaitingNote.length - 1);
                const session = sessionsAwaitingNote[activeIndex];
                const statBits = [
                  session.durationSeconds != null ? `⏱ ${formatDuration(session.durationSeconds)}` : null,
                  session.caloriesBurned != null ? `🔥 ${session.caloriesBurned} kcal` : null
                ].filter(Boolean).join('  •  ');
                const isSending = sendingNoteFor === session.clientId;
                const hasMultiple = sessionsAwaitingNote.length > 1;
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ position: 'relative' }}>
                      {hasMultiple && (
                        <button
                          type="button"
                          title="Previous"
                          onClick={() => goToAwaitingSlide((activeIndex - 1 + sessionsAwaitingNote.length) % sessionsAwaitingNote.length, sessionsAwaitingNote.length)}
                          style={{
                            position: 'absolute', top: '50%', left: '6px', transform: 'translateY(-50%)', zIndex: 2,
                            background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', border: '1px solid var(--border-color)',
                            color: '#fff', borderRadius: '50%', width: '30px', height: '30px', flexShrink: 0,
                            fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          ‹
                        </button>
                      )}
                      <div
                        key={`${session.clientId}|${session.date}`}
                        className={`coach-note-card awaiting-slide-${awaitingSlideDir > 0 ? 'next' : 'prev'}`}
                        style={{ width: '100%', margin: 0, boxSizing: 'border-box', ...(hasMultiple ? { paddingLeft: '38px', paddingRight: '38px' } : {}) }}
                      >
                        <div className="coach-note-head">
                          <span className="coach-note-title">
                            ✅ {(session.clientName || 'Client').split(/\s+/)[0]} finished a workout
                            {hasMultiple && (
                              <span style={{ marginLeft: '8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                {activeIndex + 1}/{sessionsAwaitingNote.length}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            title="Dismiss"
                            onClick={() => handleDismissSessionNote(session)}
                            style={{
                              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                              color: 'var(--text-muted)', borderRadius: '50%', width: '24px', height: '24px',
                              fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', flexShrink: 0
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        {statBits && (
                          <div className="coach-note-lastsession" style={{ marginBottom: '8px' }}>
                            {session.workoutName} — {statBits}
                          </div>
                        )}
                        <div className="coach-note-suggestions">
                          {buildSessionNoteSuggestions(session).map((sug, i) => (
                            <button
                              key={i}
                              type="button"
                              className="coach-note-chip"
                              disabled={isSending}
                              onClick={() => setCoachNoteDrafts(prev => ({ ...prev, [session.clientId]: sug }))}
                              title="Tap to use — you can still edit before sending"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="coach-note-textarea"
                          placeholder={`Write a note to ${(session.clientName || 'client').split(/\s+/)[0]}…`}
                          value={coachNoteDrafts[session.clientId] || ''}
                          onChange={(e) => setCoachNoteDrafts(prev => ({ ...prev, [session.clientId]: e.target.value }))}
                          rows={2}
                          disabled={isSending}
                        />
                        <button
                          type="button"
                          className="coach-note-send"
                          disabled={isSending || !(coachNoteDrafts[session.clientId] || '').trim()}
                          onClick={() => handleSendSessionNote(session)}
                          style={{ marginTop: '8px' }}
                        >
                          {isSending ? '⏳ Sending…' : '💬 Send note'}
                        </button>
                      </div>
                      {hasMultiple && (
                        <button
                          type="button"
                          title="Next"
                          onClick={() => goToAwaitingSlide((activeIndex + 1) % sessionsAwaitingNote.length, sessionsAwaitingNote.length)}
                          style={{
                            position: 'absolute', top: '50%', right: '6px', transform: 'translateY(-50%)', zIndex: 2,
                            background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', border: '1px solid var(--border-color)',
                            color: '#fff', borderRadius: '50%', width: '30px', height: '30px', flexShrink: 0,
                            fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          ›
                        </button>
                      )}
                    </div>
                    {hasMultiple && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
                        {sessionsAwaitingNote.map((s, i) => (
                          <button
                            key={`${s.clientId}|${s.date}`}
                            type="button"
                            title={s.clientName}
                            onClick={() => goToAwaitingSlide(i, sessionsAwaitingNote.length)}
                            style={{
                              width: i === activeIndex ? '20px' : '7px', height: '7px', borderRadius: '4px',
                              border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s ease',
                              background: i === activeIndex ? 'var(--primary-accent-light)' : 'rgba(255,255,255,0.18)'
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

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
                <div style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 0',
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
                  {/* Prefer the latest logged measurement (clientMeasurements is
                      fetched fresh in handleSelectClient) over the cached
                      clients.weight_kg snapshot on selectedClient.userWeight —
                      the client logging a new weight via Measurements never
                      used to update that column, so this tile would go stale
                      the moment they did. */}
                  <div className="metric-mini-value">{clientMeasurements[0]?.measurements?.weight || selectedClient.userWeight || '--'}</div>
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
                    {/* Manual renewal nudge — appears once 4 or fewer sessions
                        remain. Never sent automatically; the coach decides. */}
                    {selectedClient.total_sessions != null && (selectedClient.total_sessions - workoutLogs.length) <= 4 && (
                      <button
                        type="button"
                        onClick={handleSendSessionReminder}
                        disabled={sendingSessionReminder}
                        style={{
                          marginTop: '8px', padding: '6px 12px', borderRadius: '20px',
                          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                          color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700,
                          cursor: sendingSessionReminder ? 'default' : 'pointer'
                        }}
                      >
                        {sendingSessionReminder ? '⏳ Sending…' : `🔔 Send renewal reminder (${Math.max(0, selectedClient.total_sessions - workoutLogs.length)} left)`}
                      </button>
                    )}
                    {sessionReminderSentMsg && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#34d399', marginTop: '5px' }}>{sessionReminderSentMsg}</div>
                    )}
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    borderBottom: detailTab === 'plans' ? '2px solid var(--primary-accent-light)' : 'none',
                    color: detailTab === 'plans' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('plans')}
                >
                  <span>📋</span>
                  <span>Send plan</span>
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    borderBottom: detailTab === 'livelog' ? '2px solid #f59e0b' : 'none',
                    color: detailTab === 'livelog' ? '#f59e0b' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('livelog')}
                >
                  <span>🎯</span>
                  <span>Live Log</span>
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    borderBottom: detailTab === 'workout' ? '2px solid var(--primary-accent-light)' : 'none',
                    color: detailTab === 'workout' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('workout')}
                >
                  <span>🏋️</span>
                  <span>History</span>
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    borderBottom: detailTab === 'measurements' ? '2px solid #38bdf8' : 'none',
                    color: detailTab === 'measurements' ? '#38bdf8' : 'var(--text-muted)'
                  }}
                  onClick={() => handleTabChange('measurements')}
                >
                  <span>📏</span>
                  <span>Measurements</span>
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
                    {['weekly', 'daily', 'monthly', 'muscles'].map((tf) => (
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
                  ) : workoutLogs.length === 0 ? (
                    <div className="trainer-empty-state">
                      <div className="trainer-empty-icon">🏋️‍♂️</div>
                      <h5>No Workouts Logged</h5>
                      <p>This client has not logged or synchronized any workout sessions to the database yet.</p>
                    </div>
                  ) : (() => {
                    // Mirrors the client's own WorkoutProgressDashboard: workoutLogs
                    // here is already grouped one entry per date (see groupLogs
                    // above), so this only needs to add the volume/sets totals
                    // each session is missing, then reshapes into a date lookup.
                    const groupedByDate = {};
                    workoutLogs.forEach(s => {
                      // Same rules as the client dashboard (getSetVolumeKg):
                      // warmups excluded, and cardio/timed/loaded-carry rows
                      // contribute no tonnage — a Farmer Walk's `reps` holds
                      // METRES, so weight x reps there was inflating volume.
                      const volume = s.exercises.reduce((sum, ex) => {
                        if (isCardioExercise(ex.name) || isTimedExercise(ex.name) || isLoadedCarryExercise(ex.name)) return sum;
                        return sum + ex.sets.reduce((ss, st) => (
                          st.isWarmup ? ss : ss + (parseFloat(st.weight) || 0) * (parseInt(st.reps) || 0)
                        ), 0);
                      }, 0);
                      const sets = s.exercises.reduce((sum, ex) => sum + ex.sets.filter(st => !st.isWarmup).length, 0);
                      groupedByDate[s.date] = { ...s, volume, sets };
                    });

                    // Monday-start current week, matching the client dashboard.
                    const getStartOfWeek = (d) => {
                      const date = new Date(d);
                      const day = date.getDay();
                      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                      const start = new Date(date.setDate(diff));
                      start.setHours(0, 0, 0, 0);
                      return start;
                    };
                    const weekDays = (() => {
                      const start = getStartOfWeek(new Date());
                      // Shift whole weeks back/forward for the ‹ › navigation.
                      start.setDate(start.getDate() + historyWeekOffset * 7);
                      const days = [];
                      for (let i = 0; i < 7; i++) {
                        const cur = new Date(start);
                        cur.setDate(start.getDate() + i);
                        days.push(getLocalDateString(cur));
                      }
                      return days;
                    })();

                    // Relative wording for the two most recent weeks, an
                    // explicit date range further back.
                    const weekRangeLabel = (() => {
                      if (historyWeekOffset === 0) return 'This week';
                      if (historyWeekOffset === -1) return 'Last week';
                      const ws = parseLocalDateString(weekDays[0]);
                      const we = parseLocalDateString(weekDays[6]);
                      const sameMonth = ws.getMonth() === we.getMonth();
                      return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
                    })();

                    const weekNavBtnStyle = {
                      background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                      color: '#fff', borderRadius: '50%', width: '26px', height: '26px', flexShrink: 0,
                      fontSize: '0.9rem', lineHeight: 1, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: 0
                    };

                    // Weekly aggregation
                    const dailySets = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
                    let weekWorkoutsCount = 0, weekCaloriesRaw = 0;
                    // Volume/sets totals — only the Muscle Analytics tab's header
                    // stat cards need these; the weekly bar chart above only uses
                    // dailySets/weekWorkoutsCount.
                    let weekTotalVolume = 0, weekTotalSets = 0;
                    weekDays.forEach(day => {
                      const s = groupedByDate[day];
                      if (s) {
                        weekWorkoutsCount += 1;
                        weekCaloriesRaw += s.caloriesBurned || 0;
                        weekTotalVolume += s.volume;
                        weekTotalSets += s.sets;
                        dailySets[parseLocalDateString(day).toLocaleDateString('en-US', { weekday: 'short' })] = s.sets;
                      }
                    });
                    const weeklyTotalCalories = Math.round(weekCaloriesRaw * 10) / 10;
                    const muscleAnalyticsWeeklyStats = { workoutsCount: weekWorkoutsCount, totalSets: weekTotalSets, totalVolume: weekTotalVolume, dailySets };

                    // Monthly aggregation (last 30 days)
                    const dailyVolumeHistory = [];
                    const activeDates = new Set();
                    let monthVolume = 0, monthSets = 0, monthWorkouts = 0, monthCaloriesRaw = 0;
                    for (let i = 29; i >= 0; i--) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dateStr = getLocalDateString(d);
                      const s = groupedByDate[dateStr];
                      if (s) {
                        monthVolume += s.volume;
                        monthSets += s.sets;
                        monthWorkouts += 1;
                        monthCaloriesRaw += s.caloriesBurned || 0;
                        activeDates.add(dateStr);
                      }
                      dailyVolumeHistory.push({ date: dateStr, dayNum: d.getDate(), volume: s ? s.volume : 0 });
                    }
                    const monthlyTotalCalories = Math.round(monthCaloriesRaw * 10) / 10;
                    const totalSessionsDone = workoutLogs.length;

                    const daySession = groupedByDate[historyDateStr] || null;

                    // Reusable session summary card (badges + exercise chips) —
                    // clicking jumps straight to that day's Daily view, same as
                    // the client dashboard.
                    const renderSessionCard = (dateKey, session, { highlightToday } = {}) => {
                      const dateLabel = parseLocalDateString(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      const today = highlightToday && isLocalToday(dateKey);
                      return (
                        <div
                          key={dateKey}
                          onClick={() => { setHistoryDateStr(dateKey); setHistoryTimeframe('daily'); }}
                          style={{
                            background: 'rgba(0,0,0,0.15)',
                            border: today ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 'var(--radius-md)',
                            padding: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: today ? 'var(--primary-accent-light)' : '#fff' }}>
                                📅 {dateLabel}{today ? ' · Today' : ''}
                              </div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2.5px' }}>
                                📋 {session.planName || 'Custom Routine'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.sets} sets
                              </span>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.volume.toLocaleString('en-IN')} kg
                              </span>
                              {session.caloriesBurned != null && (
                                <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  🔥 {session.caloriesBurned} kcal
                                </span>
                              )}
                              {session.durationSeconds != null && (
                                <span style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  ⏱ {formatDuration(session.durationSeconds)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {session.exercises.map((ex, exIdx) => (
                              <span key={exIdx} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '20px', color: 'var(--text-muted)' }}>
                                {ex.name} · {ex.sets.length}s
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    };

                    const renderWeeklyBarChart = () => {
                      const keys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      const values = keys.map(k => dailySets[k]);
                      const maxVal = Math.max(...values, 5);
                      const height = 120, width = 320, barWidth = 24, gap = 16, paddingLeft = 25;
                      return (
                        <svg viewBox={`0 0 ${width} ${height}`} className="weekly-bar-chart-svg">
                          <line x1="20" y1="20" x2={width} y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="20" y1="60" x2={width} y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                          <line x1="20" y1="100" x2={width} y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
                          {keys.map((day, idx) => {
                            const val = dailySets[day];
                            const barHeight = (val / maxVal) * 80;
                            const x = paddingLeft + idx * (barWidth + gap);
                            const y = 100 - barHeight;
                            return (
                              <g key={day} className="bar-group">
                                {val > 0 && (
                                  <rect x={x} y={y} width={barWidth} height={barHeight} rx="4" fill="url(#coachEmeraldGradient)" opacity="0.15" style={{ filter: 'blur(4px)' }} />
                                )}
                                <rect x={x} y={y} width={barWidth} height={barHeight} rx="4" fill={val > 0 ? 'url(#coachEmeraldGradient)' : 'rgba(255,255,255,0.03)'} className="chart-bar" />
                                {val > 0 && (
                                  <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fill="var(--primary-accent-light)" fontSize="9" fontWeight="800">{val}</text>
                                )}
                                <text x={x + barWidth / 2} y="115" textAnchor="middle" fill={val > 0 ? '#fff' : 'var(--text-muted)'} fontSize="9" fontWeight="600">{day}</text>
                              </g>
                            );
                          })}
                          <defs>
                            <linearGradient id="coachEmeraldGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                          </defs>
                        </svg>
                      );
                    };

                    const renderMonthlyLineChart = () => {
                      const history = dailyVolumeHistory;
                      const values = history.map(h => h.volume);
                      const maxVal = Math.max(...values, 100);
                      const width = 320, height = 120, padding = 20;
                      const chartWidth = width - padding * 2, chartHeight = height - padding * 2;
                      const getX = (idx) => padding + (idx / 29) * chartWidth;
                      const getY = (val) => padding + chartHeight - (val / maxVal) * chartHeight;
                      let pathD = '', areaD = `M ${getX(0)} ${padding + chartHeight}`;
                      history.forEach((h, idx) => {
                        const x = getX(idx), y = getY(h.volume);
                        pathD += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
                        areaD += ` L ${x} ${y}`;
                      });
                      areaD += ` L ${getX(29)} ${padding + chartHeight} Z`;
                      const activeNodes = history.filter(h => h.volume > 0);
                      return (
                        <svg viewBox={`0 0 ${width} ${height}`} className="monthly-chart-svg">
                          <defs>
                            <linearGradient id="coachAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                          <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                          <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
                          {values.some(v => v > 0) && <path d={areaD} fill="url(#coachAreaGradient)" />}
                          {values.some(v => v > 0) ? (
                            <path d={pathD} fill="none" stroke="var(--primary-accent-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          ) : (
                            <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="3 3" />
                          )}
                          {activeNodes.map((node) => {
                            const origIdx = history.findIndex(h => h.date === node.date);
                            return <circle key={node.date} cx={getX(origIdx)} cy={getY(node.volume)} r="4" fill="var(--primary-accent-light)" stroke="var(--bg-card)" strokeWidth="1" />;
                          })}
                        </svg>
                      );
                    };

                    const renderCalendarHeatmap = () => {
                      const cells = [];
                      for (let i = 29; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const dateStr = getLocalDateString(d);
                        const isActive = activeDates.has(dateStr);
                        const isSelected = dateStr === historyDateStr;
                        cells.push(
                          <div
                            key={dateStr}
                            className={`heatmap-cell ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => { setHistoryDateStr(dateStr); setHistoryTimeframe('daily'); }}
                            title={`${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${isActive ? 'Workout logged 🏋️‍♂️' : 'Rest day ☕'}`}
                          >
                            <span className="cell-num">{d.getDate()}</span>
                            {isActive && <span className="cell-dot">●</span>}
                          </div>
                        );
                      }
                      return (
                        <div className="heatmap-grid-wrapper">
                          <h4 className="heatmap-title">📅 30-Day Workout Frequency</h4>
                          <div className="heatmap-grid">{cells}</div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {historyTimeframe === 'weekly' && (
                          <div className="timeframe-content flex-col gap-4">
                            <div className="chart-widget-card glass-panel">
                              <div className="widget-header justify-between">
                                <h4>📊 Sets Completed per Weekday</h4>
                                {/* Week navigator — ‹ steps back through this
                                    client's history, › returns toward the
                                    present and stops at the current week. */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button type="button" title="Previous week" onClick={() => setHistoryWeekOffset(w => w - 1)} style={weekNavBtnStyle}>‹</button>
                                  <span className="trend-badge" style={{ minWidth: '86px', textAlign: 'center' }}>{weekRangeLabel}</span>
                                  <button
                                    type="button"
                                    title={historyWeekOffset >= 0 ? 'Already on the current week' : 'Next week'}
                                    onClick={() => setHistoryWeekOffset(w => Math.min(0, w + 1))}
                                    disabled={historyWeekOffset >= 0}
                                    style={{ ...weekNavBtnStyle, opacity: historyWeekOffset >= 0 ? 0.35 : 1, cursor: historyWeekOffset >= 0 ? 'default' : 'pointer' }}
                                  >
                                    ›
                                  </button>
                                </div>
                              </div>
                              <div className="chart-wrapper">{renderWeeklyBarChart()}</div>
                            </div>

                            <div className="chart-widget-card glass-panel">
                              <div className="widget-header justify-between" style={{ marginBottom: '12px' }}>
                                <h4>🗂️ {historyWeekOffset === 0 ? "This Week's Sessions" : `Sessions — ${weekRangeLabel}`}</h4>
                                <span className="trend-badge">
                                  {weekWorkoutsCount} days active{weeklyTotalCalories > 0 ? ` · 🔥 ${weeklyTotalCalories} kcal` : ''}
                                </span>
                              </div>
                              {weekWorkoutsCount === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>
                                  {historyWeekOffset === 0 ? 'No workouts logged this week yet.' : 'No workouts logged in this week.'}
                                </p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  {weekDays.filter(day => groupedByDate[day]).map(day => renderSessionCard(day, groupedByDate[day], { highlightToday: true }))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {historyTimeframe === 'daily' && (
                          <div className="timeframe-content flex-col gap-4">
                            <div className="date-picker-bar glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <button
                                onClick={() => setHistoryDateStr(shiftLocalDateString(historyDateStr, -1))}
                                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}
                              >
                                ‹
                              </button>
                              <input
                                type="date"
                                value={historyDateStr}
                                onChange={(e) => setHistoryDateStr(e.target.value)}
                                className="progress-date-input"
                                style={{ flex: 1 }}
                              />
                              <button
                                onClick={() => {
                                  const next = shiftLocalDateString(historyDateStr, 1);
                                  if (next <= getLocalDateString()) setHistoryDateStr(next);
                                }}
                                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}
                              >
                                ›
                              </button>
                            </div>

                            <div className="day-stats-overview glass-panel">
                              <div className="overview-header justify-between">
                                <div>
                                  <h3>
                                    {daySession?.planName
                                      || (isLocalToday(historyDateStr) ? "Today's Progress" : parseLocalDateString(historyDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))}
                                  </h3>
                                  {daySession?.planName && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                                      {isLocalToday(historyDateStr) ? 'Today' : parseLocalDateString(historyDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </div>
                                  )}
                                </div>
                                <span className="active-badge">{daySession ? '🏋️‍♂️ Workout Done' : '☕ Rest Day'}</span>
                              </div>
                              <div className="stats-row-cards mini mt-2">
                                <div className="stat-card inline">
                                  <span className="lbl">Volume:</span>
                                  <strong className="val text-emerald">{(daySession?.volume || 0).toLocaleString('en-IN')} kg</strong>
                                </div>
                                <div className="stat-card inline">
                                  <span className="lbl">Sets:</span>
                                  <strong className="val text-blue">{daySession?.sets || 0} sets</strong>
                                </div>
                                <div className="stat-card inline">
                                  <span className="lbl">Exercises:</span>
                                  <strong className="val" style={{ color: '#a78bfa' }}>{daySession?.exercises.length || 0}</strong>
                                </div>
                                {daySession?.caloriesBurned != null && (
                                  <div className="stat-card inline">
                                    <span className="lbl">🔥 Calories:</span>
                                    <strong className="val" style={{ color: '#fbbf24' }}>{daySession.caloriesBurned} kcal</strong>
                                  </div>
                                )}
                                {daySession?.durationSeconds != null && (
                                  <div className="stat-card inline">
                                    <span className="lbl">⏱ Time:</span>
                                    <strong className="val" style={{ color: '#e5e7eb' }}>{formatDuration(daySession.durationSeconds)}</strong>
                                  </div>
                                )}
                              </div>

                              {daySession && daySession.exercises.length > 0 ? (
                                <div className="daily-exercises-list mt-3">
                                  <h4 className="section-subtitle">Exercise Sets Logged</h4>
                                  <div className="ex-list-wrapper mt-2">
                                    {daySession.exercises.map((exercise, eIdx) => {
                                      const exIsTimedHist = isTimedExercise(exercise.name);
                                      const exIsCardioHist = isCardioExercise(exercise.name);
                                      const exIsLoadedCarryHist = isLoadedCarryExercise(exercise.name);
                                      return (
                                        <div key={eIdx} className="daily-ex-card" style={{ marginBottom: '10px' }}>
                                          <div className="ex-title" style={{ marginBottom: '6px' }}>{exercise.name}</div>
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
                                                ) : exIsLoadedCarryHist ? (
                                                  <>
                                                    <th style={{ width: '40%' }}>Weight</th>
                                                    <th style={{ width: '35%' }}>Meters</th>
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
                              ) : (
                                <div className="no-daily-workouts mt-3">
                                  <p>No workout session found on this date.<br />Use ‹ › to navigate days, or switch to Monthly view to click on an active day.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {historyTimeframe === 'monthly' && (
                          <div className="timeframe-content flex-col gap-4">
                            <div className="stats-row-cards">
                              <div className="stat-card glass-panel">
                                <span className="card-label">Monthly Volume</span>
                                <strong className="card-value text-emerald">{monthVolume.toLocaleString('en-IN')} <span className="value-unit">kg</span></strong>
                                <p className="card-sub">Last 30 days</p>
                              </div>
                              <div className="stat-card glass-panel">
                                <span className="card-label">Monthly Sets</span>
                                <strong className="card-value text-blue">{monthSets} <span className="value-unit">sets</span></strong>
                                <p className="card-sub">Last 30 days</p>
                              </div>
                              <div className="stat-card glass-panel">
                                <span className="card-label">Completed</span>
                                <strong className="card-value text-amber">{monthWorkouts} <span className="value-unit">workouts</span></strong>
                                <p className="card-sub">Last 30 days</p>
                              </div>
                              <div className="stat-card glass-panel">
                                <span className="card-label">🔥 Calories</span>
                                <strong className="card-value" style={{ color: '#fbbf24' }}>{monthlyTotalCalories.toLocaleString('en-IN')} <span className="value-unit">kcal</span></strong>
                                <p className="card-sub">Last 30 days</p>
                              </div>
                            </div>

                            <div className="heatmap-widget-card glass-panel">
                              {renderCalendarHeatmap()}
                            </div>

                            <div className="chart-widget-card glass-panel">
                              <div className="widget-header justify-between">
                                <h4>📈 Monthly Volume Overload Trend</h4>
                                <span className="trend-badge">Progression</span>
                              </div>
                              <div className="chart-wrapper">{renderMonthlyLineChart()}</div>
                            </div>

                            <div className="chart-widget-card glass-panel">
                              <div className="widget-header justify-between" style={{ marginBottom: '12px' }}>
                                <h4>📋 Full Workout History</h4>
                                <span className="trend-badge">{totalSessionsDone} sessions</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {workoutLogs.map(s => renderSessionCard(s.date, groupedByDate[s.date]))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Coach-side view of the same Weekly Muscle Analytics
                            the client sees on their own dashboard — reads this
                            client's rawWorkoutLogs (flat per-set rows, not the
                            grouped session objects `workoutLogs` holds above)
                            since the muscle-group utils key off exercise_name
                            per row. Shares week navigation with the Weekly tab
                            via historyWeekOffset. */}
                        {historyTimeframe === 'muscles' && (
                          <WeeklyMuscleAnalytics
                            logs={rawWorkoutLogs}
                            weekDays={weekDays}
                            weekRangeLabel={weekRangeLabel}
                            weeklyStats={muscleAnalyticsWeeklyStats}
                            weekOffset={historyWeekOffset}
                            setWeekOffset={setHistoryWeekOffset}
                            weekNavBtnStyle={weekNavBtnStyle}
                            bareCards
                          />
                        )}
                      </>
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
                        {isAiDraftMode ? '✨ Review AI Draft' : editingPlan ? '✏️ Edit Workout Plan' : '📋 Create Workout Plan'}
                      </h4>

                      {/* AI draft review — day tabs + the AI's own rationale.
                          Everything below this (name field, exercise list,
                          Add Exercise, sets) is the exact same editor a coach
                          uses for a manual plan; switching tabs just swaps
                          which day's data is loaded into that same state. */}
                      {isAiDraftMode && (
                        <div style={{ marginBottom: '16px' }}>
                          {aiDraftSummary && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '10px', lineHeight: 1.5 }}>
                              💡 {aiDraftSummary}
                            </p>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {aiDraftDays.map((day, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => switchAiDraftDay(idx)}
                                disabled={assigningAiDraft}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '20px',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: assigningAiDraft ? 'default' : 'pointer',
                                  border: idx === activeAiDraftDayIndex ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border-color)',
                                  background: idx === activeAiDraftDayIndex ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255,255,255,0.03)',
                                  color: idx === activeAiDraftDayIndex ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                                }}
                              >
                                {day.dayLabel}{day.focus ? ` · ${day.focus}` : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

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

                      {/* Bulk-assign — only for a fresh plan/AI draft, not
                          while editing one that already belongs to a client. */}
                      {!editingPlan && (
                        <div style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                            Also assign to
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', borderRadius: '20px', padding: '4px 10px' }}>
                              {selectedClient.userName}
                            </span>
                            {extraAssignClientIds.map(id => {
                              const c = clients.find(cl => cl.id === id);
                              if (!c) return null;
                              return (
                                <span key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '20px', padding: '4px 6px 4px 10px' }}>
                                  {c.userName}
                                  <button
                                    type="button"
                                    onClick={() => setExtraAssignClientIds(prev => prev.filter(x => x !== id))}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1, padding: 0 }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => setShowClientPickerModal(true)}
                              style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16,185,129,0.08)', border: '1px dashed rgba(16,185,129,0.35)', color: 'var(--primary-accent-light)', borderRadius: '20px', padding: '4px 10px', cursor: 'pointer' }}
                            >
                              + Add clients
                            </button>
                          </div>
                          {extraAssignClientIds.length > 0 && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                              This plan will be created for {1 + extraAssignClientIds.length} clients, each as their own copy.
                            </p>
                          )}
                        </div>
                      )}

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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <span className="live-logger-ex-name">{ex.name}</span>
                                    <button
                                      type="button"
                                      className="btn-form-guide-sm"
                                      onClick={() => handleShowFormGuide(ex.name)}
                                    >
                                      🎬 Form Guide
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExerciseFromEditor(exIdx)}
                                    style={{ display: 'flex', alignItems: 'center', color: 'var(--danger)', cursor: 'pointer' }}
                                  ><TrashIcon size={16} /></button>
                                </div>

                                <div className="hevy-sets-table">
                                  <div className={`hevy-table-header ${exIsCardio ? 'hevy-set-row--cardio' : ''}`}>
                                    <span className="col-set">SET</span>
                                    <span className="col-prev">PREV</span>
                                    {exIsCardio ? (
                                      <>
                                        <span className="col-weight">KM</span>
                                        <span className="col-reps">TIME</span>
                                      </>
                                    ) : isLoadedCarryExercise(ex.name) ? (
                                      <>
                                        <span className="col-weight">🏋️ KG</span>
                                        <span className="col-reps">METERS</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="col-weight">🏋️ KG</span>
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
                                              <TrashIcon size={16} />
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
                          disabled={assigningAiDraft}
                          onClick={() => {
                            setShowPlanEditor(false);
                            setEditingPlan(null);
                            setEditorPlanName('');
                            setEditorExercises([]);
                            setIsAiDraftMode(false);
                            setAiDraftDays([]);
                            setAiDraftSummary('');
                            setActiveAiDraftDayIndex(0);
                            setExtraAssignClientIds([]);
                          }}
                          style={{ flex: 1, padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: assigningAiDraft ? 'default' : 'pointer', opacity: assigningAiDraft ? 0.5 : 1 }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={assigningAiDraft}
                          onClick={handleSavePlan}
                          style={{ flex: 1, padding: '10px 16px', background: 'var(--primary-accent-light)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: assigningAiDraft ? 'default' : 'pointer', opacity: assigningAiDraft ? 0.7 : 1 }}
                        >
                          {assigningAiDraft
                            ? 'Assigning…'
                            : extraAssignClientIds.length > 0
                            ? `Assign to ${1 + extraAssignClientIds.length} clients`
                            : isAiDraftMode ? 'Assign Workout Plan' : 'Assign to client'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* PLANS LIST VIEW */
                    <div className="plans-list-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} onClick={() => setOpenPlanCardMenuId(null)}>
                      <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Workout Plans</h4>
                        <button
                          type="button"
                          onClick={() => setShowCreatePlanChoice(true)}
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
                          {clientPlans.filter(p => p.createdBy === 'coach').map(plan => {
                            // "Done" = the client has at least one logged session whose
                            // planName matches this plan — workoutLogs is already sorted
                            // latest-first (see groupLogs), so .find() picks up the most
                            // recent completion if they've repeated it.
                            const completedSession = workoutLogs.find(
                              s => s.planName?.trim().toLowerCase() === plan.planName?.trim().toLowerCase()
                            );
                            const assignedDateLabel = plan.createdAt
                              ? new Date(plan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : null;
                            return (
                            <div
                              key={plan.id}
                              className="plan-summary-card glass-panel"
                              style={{
                                padding: '14px 14px 36px',
                                background: completedSession ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.01)',
                                border: completedSession ? '1px solid rgba(16,185,129,0.35)' : '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                position: 'relative'
                              }}
                            >
                              <div className="plan-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <strong style={{ fontSize: '0.9rem', color: '#fff', display: 'block' }}>{plan.planName}</strong>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginTop: '3px' }}>
                                    📋 Assigned to: {selectedClient.userName}
                                    {assignedDateLabel && ` · ${assignedDateLabel}`}
                                  </span>
                                </div>
                                <div className="plan-actions" style={{ position: 'relative' }}>
                                  <button
                                    type="button"
                                    aria-label="Plan options"
                                    onClick={(e) => { e.stopPropagation(); setOpenPlanCardMenuId(openPlanCardMenuId === plan.id ? null : plan.id); }}
                                    style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '1rem', lineHeight: 1, cursor: 'pointer' }}
                                  >
                                    ⋮
                                  </button>
                                  {openPlanCardMenuId === plan.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ position: 'absolute', top: '32px', right: 0, background: '#141b28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', zIndex: 5, minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                                    >
                                      {completedSession && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenPlanCardMenuId(null);
                                            // Jump straight to that session in Workout
                                            // History → Daily, same navigation the
                                            // calendar heatmap/session cards there use.
                                            handleTabChange('workout');
                                            setHistoryDateStr(completedSession.date);
                                            setHistoryTimeframe('daily');
                                          }}
                                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', color: 'var(--primary-accent-light)', fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                          More details →
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenPlanCardMenuId(null);
                                          setIsAiDraftMode(false);
                                          setEditingPlan(plan);
                                          setEditorPlanName(plan.planName);
                                          setEditorExercises(plan.exercises);
                                          setExtraAssignClientIds([]);
                                          setShowPlanEditor(true);
                                        }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setOpenPlanCardMenuId(null);
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
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                                      >
                                        Duplicate
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setOpenPlanCardMenuId(null);
                                          if (confirm('Delete this workout plan?')) {
                                            await databaseService.deleteWorkoutPlan(plan.id, selectedClient.id);
                                            fetchClientPlans(selectedClient.id);
                                          }
                                        }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer' }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="plan-exercises-preview" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {plan.exercises.map((ex, idx) => (
                                  <span key={idx} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '20px', color: 'var(--text-muted)' }}>
                                    {ex.name} ({ex.sets?.length || 0}s)
                                  </span>
                                ))}
                              </div>

                              {completedSession ? (
                                <div
                                  title="Client completed this workout"
                                  style={{
                                    position: 'absolute', bottom: '10px', right: '10px',
                                    width: '22px', height: '22px', borderRadius: '50%',
                                    background: '#10b981', color: '#06251b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.72rem', fontWeight: 900
                                  }}
                                >
                                  ✓
                                </div>
                              ) : (
                                <span
                                  style={{
                                    position: 'absolute', bottom: '10px', right: '10px',
                                    fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
                                    borderRadius: '20px', padding: '2px 8px'
                                  }}
                                >
                                  Pending
                                </span>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── LIVE SESSION LOGGER TAB ─── */}
              {detailTab === 'livelog' && (
                <div className="live-logger-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
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

                  {/* Small "Logging for" line — replaces the old LIVE SESSION
                      badge and client identity card. The Live Log tab itself
                      already says what mode this is, so this just needs to
                      answer "who, and which day" in one small line. */}
                  <div className="live-logging-for-line">
                    Logging for: <strong>{selectedClient?.userName}</strong>
                    <span className="live-logging-for-sep">·</span>
                    <span className="live-logging-for-date-label">📅 {liveDate === getLocalDateString() ? 'Today' : 'Session date'}</span>
                    <input
                      type="date"
                      value={liveDate}
                      onChange={e => setLiveDate(e.target.value)}
                      className="live-logging-for-date-input"
                    />
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
                        </span>
                        <span className="live-timer-kcal">🔥 {liveCalories.totalKcal} kcal</span>
                        <button
                          type="button"
                          onClick={() => setShowClockTimer(true)}
                          title="Timer / Stopwatch"
                          style={{ background: 'transparent', border: 'none', color: '#3b82f6', padding: '4px 6px', display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: 'auto' }}
                        >
                          <StopwatchIcon size={22} />
                        </button>
                        {liveTimerStatus === 'running' ? (
                          <button type="button" className="live-timer-btn" onClick={handlePauseLiveTimer} title="Pause"><PauseIcon size={20} /></button>
                        ) : (
                          <button type="button" className="live-timer-btn" onClick={handleResumeLiveTimer} title="Resume"><PlayIcon size={20} /></button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Plan/Routine configuration — always visible, no toggle */}
                  <div className="live-workout-config-panel">
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
                            fontSize: '14px',
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
                                  ...(isBodyweightExercise(ex.name) ? { bodyweightMode: !ex.sets.some(s => Number(s.weight) > 0) } : {}),
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
                              fontSize: '0.78rem',
                              outline: 'none'
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

                  {/* Exercise List — edge-to-edge: bleeds past the dashboard's
                      16px outer padding so the table reaches the true screen
                      edges, matching the app's standard flush logging layout. */}
                  <div className="live-logger-exercise-list">
                    {liveExercises.map((ex, exIdx) => {
                    const exIsCardio = isCardioExercise(ex.name);
                    const exIsBodyweight = isBodyweightExercise(ex.name);
                    const exBwMode = exIsBodyweight ? getLiveExBwMode(ex) : false;
                    return (
                      <div key={exIdx} className="live-logger-exercise-card">
                        {/* Exercise Header */}
                        <div className="live-logger-ex-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span
                              className="live-logger-ex-name ex-name-clickable"
                              role="button"
                              tabIndex={0}
                              title="View exercise history"
                              onClick={() => setHistoryModalExercise(ex.name)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryModalExercise(ex.name); } }}
                            >
                              {ex.name}
                            </span>
                            <button
                              type="button"
                              className="btn-form-guide-sm"
                              onClick={() => handleShowFormGuide(ex.name)}
                            >
                              🎬 Form Guide
                            </button>
                          </div>
                          <button
                            onClick={() => handleLiveRemoveExercise(exIdx)}
                            style={{ display: 'flex', alignItems: 'center', color: 'var(--danger)', cursor: 'pointer' }}
                          ><TrashIcon size={16} /></button>
                        </div>

                        {/* Bodyweight/+Weight toggle — push-ups, mountain
                            climbers, jumping jacks etc. default to no added
                            weight, but a client may wear a vest or hold a
                            plate, so this lets the coach switch the weight
                            column between a fixed "BW" label and an
                            editable KG input. */}
                        {exIsBodyweight && (
                          <div className="bw-toggle-row">
                            <button
                              type="button"
                              className={`bw-toggle-btn ${exBwMode ? 'active' : ''}`}
                              onClick={() => { if (!exBwMode) handleToggleLiveBodyweightMode(exIdx); }}
                            >
                              Bodyweight
                            </button>
                            <button
                              type="button"
                              className={`bw-toggle-btn ${!exBwMode ? 'active' : ''}`}
                              onClick={() => { if (exBwMode) handleToggleLiveBodyweightMode(exIdx); }}
                            >
                              + Add Weight
                            </button>
                          </div>
                        )}

                        {/* Sets Table */}
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
                                <span className="col-weight">🏋️ KG</span>
                                <span className="col-reps">METERS</span>
                              </>
                            ) : exIsBodyweight ? (
                              <>
                                <span className="col-weight">{exBwMode ? 'BODYWEIGHT' : '🏋️ KG'}</span>
                                <span className="col-reps">REPS</span>
                              </>
                            ) : (
                              <>
                                <span className="col-weight">🏋️ KG</span>
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
                              <div key={setIdx} className={`hevy-set-row ${exIsCardio ? 'hevy-set-row--cardio' : ''} ${set.isCompleted ? 'set-row-completed' : ''} ${set.isWarmup ? 'set-row-warmup' : ''} ${set.setType === 'failure' ? 'set-row-failure' : ''} ${set.setType === 'drop' ? 'set-row-drop' : ''}`}>
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
                                {exIsCardio ? (() => {
                                  const cardioTimerKey = getSetTimerKey(exIdx, setIdx);
                                  const cardioTimer = liveSetTimers[cardioTimerKey];
                                  const cardioRunning = cardioTimer?.isRunning || false;
                                  const liveSeconds = cardioRunning ? getLiveSetElapsedSeconds(exIdx, setIdx) : (parseTimeStringToSeconds(set.time) || 0);
                                  // No GPS/sensor behind this — while running (and until the coach
                                  // types their own number), KM shows an estimate from a typical
                                  // pace for this exercise, ticking up alongside the live time.
                                  const cardioAutoKm = cardioRunning && cardioTimer?.autoKm !== false;
                                  const displayKm = cardioAutoKm ? estimateCardioDistanceKm(ex.name, liveSeconds) : set.distanceKm;
                                  return (
                                    <>
                                      <div className="col-weight set-input-field">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="0"
                                          value={displayKm}
                                          onChange={e => handleLiveCardioKmEdit(exIdx, setIdx, e.target.value)}
                                        />
                                      </div>
                                      <div className="col-reps cardio-time-field">
                                        <button
                                          type="button"
                                          className="btn-cardio-stopwatch"
                                          style={{ color: cardioRunning ? '#e5e7eb' : '#fb923c' }}
                                          onClick={() => (cardioRunning ? handleLiveCardioStopwatchPause(exIdx, setIdx) : handleLiveCardioStopwatchStart(exIdx, setIdx))}
                                          title={cardioRunning ? 'Pause' : 'Start'}
                                        >
                                          {cardioRunning ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                                        </button>
                                        {cardioRunning ? (
                                          <span className="cardio-live-time">{formatSecondsToTimeString(liveSeconds)}</span>
                                        ) : (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="mm:ss"
                                            value={set.time}
                                            onChange={e => handleLiveCardioTimeEdit(exIdx, setIdx, e.target.value)}
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
                                            {isRunning ? (
                                              <span style={{ fontSize: '0.9rem', fontWeight: 500, minWidth: '50px', textAlign: 'center', color: '#fff' }}>
                                                {timeStr}
                                              </span>
                                            ) : (
                                              // Not running — editable directly, same as the cardio
                                              // time field, instead of only settable by running the
                                              // stopwatch live. Pressing Start resumes from whatever's
                                              // typed here (see handleLiveSetStopwatchStart's fallback).
                                              <input
                                                type="text"
                                                inputMode="numeric"
                                                value={set.time || ''}
                                                onChange={(e) => handleLiveSetChange(exIdx, setIdx, 'time', maskDigitsToTimeString(e.target.value))}
                                                placeholder="mm:ss"
                                                className="cardio-time-input"
                                                style={{ minWidth: '50px' }}
                                              />
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <div className="col-reps"></div>
                                  </>
                                ) : (
                                  <>
                                    {exIsBodyweight && exBwMode ? (
                                      <div className="col-weight bw-static-label">BW</div>
                                    ) : (
                                      <div className="col-weight set-input-field">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={set.weight}
                                          onChange={e => handleLiveSetChange(exIdx, setIdx, 'weight', e.target.value)}
                                        />
                                      </div>
                                    )}
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
                                    onClick={() => (isTimedExercise(ex.name) || exIsCardio) && !set.isCompleted ? (exIsCardio ? handleLiveCardioSetComplete(exIdx, setIdx) : handleLiveSetStopwatchComplete(exIdx, setIdx)) : handleLiveToggleSet(exIdx, setIdx)}
                                    title={(isTimedExercise(ex.name) || exIsCardio) && !set.isCompleted ? "Save time and complete" : (set.isCompleted ? 'Mark incomplete' : 'Mark complete')}
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
                                      <TrashIcon size={16} />
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

                  {/* Coach note toggle — the composer below has no Send
                      button of its own: whatever's typed here goes out
                      together with "Save Workout Session", via the same
                      saveCoachNote + coach_note push path, landing on the
                      client's home screen like a push notification —
                      CoachNoteBanner fallback. No new mechanism there. */}
                  <button
                    type="button"
                    className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth"
                    onClick={() => setShowLiveCoachNote(v => !v)}
                    style={{
                      marginTop: '16px',
                      background: showLiveCoachNote ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.05)',
                      border: showLiveCoachNote ? '1px solid rgba(139,92,246,0.45)' : '1px solid rgba(255,255,255,0.12)',
                      color: showLiveCoachNote ? 'var(--primary-accent-light, #a78bfa)' : '#fff'
                    }}
                  >
                    💬 Coach note{coachNoteText.trim() ? ' ✓' : ''} {showLiveCoachNote ? '▲' : '▼'}
                  </button>

                  {showClockTimer && (
                    <ClockTimerModal onClose={() => setShowClockTimer(false)} />
                  )}

                  {/* Floating rest-between-sets timer — same behavior/UI as
                      the client's own logger; --coach sits closer to the
                      bottom edge since this side has no fixed bottom nav
                      bar to clear. Portaled to .app-container for the same
                      reason as the client's version (see WorkoutTracker.jsx)
                      — otherwise it scrolls away with this panel's own
                      internal scroll instead of staying pinned to the
                      screen. */}
                  {restTimerActive && (restSecondsRemaining > 0 || restJustFinished) && createPortal(
                    <div
                      key={restPulseKey}
                      className={`rest-timer-floating-card rest-timer-floating-card--coach ${restJustFinished ? 'rest-timer-pulse-finish' : 'rest-timer-pulse-start'}`}
                    >
                      <div className="rest-timer-header-row">
                        <span className="rest-icon">{restJustFinished ? '✅' : '⏱️'}</span>
                        <span className="rest-timer-label">{restJustFinished ? 'REST OVER' : 'REST TIMER'}</span>
                      </div>

                      {restJustFinished ? (
                        <strong className="rest-timer-finished-msg">Time for the next set!</strong>
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

                    {showLiveCoachNote && (
                      <div className="coach-note-card" style={{ margin: '10px 0 0' }}>
                        <div className="coach-note-head">
                          <span className="coach-note-title">💬 Note for {(selectedClient.userName || 'client').split(/\s+/)[0]}</span>
                          <span className="coach-note-lastsession">Sends with “Save Workout Session”</span>
                        </div>
                        <div className="coach-note-suggestions">
                          {liveCoachNoteSuggestions.map((sug, i) => (
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
                        padding: '0 8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <TrashIcon size={28} />
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
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <TrashIcon size={16} /> Discard
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
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <TrashIcon size={16} /> Discard
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
        onShowFormGuide={handleShowFormGuide}
      />
      <ExerciseGuideModal exercise={activeGuideExercise} onClose={() => setActiveGuideExercise(null)} />

      {/* Tap an exercise's name in the Live Log → full Daily/Weekly/Monthly/
          Yearly history for that exercise. rawWorkoutLogs is already scoped
          to selectedClient (fetched in handleSelectClient), so no extra
          client-name filtering is needed here. */}
      <ExerciseHistoryModal
        exerciseName={historyModalExercise}
        rawLogs={rawWorkoutLogs}
        onClose={() => setHistoryModalExercise(null)}
      />

      {/* "Create Workout Plan" now asks which way to build it, before
          touching any editor state — Build Manually reproduces the button's
          original behavior exactly (openManualPlanEditor). */}
      {showCreatePlanChoice && (
        <div className="payment-gateway-backdrop" onClick={() => setShowCreatePlanChoice(false)}>
          <div
            className="payment-gateway-modal animate-scale-in"
            style={{ maxWidth: '360px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div className="modal-title-box">
                <h3>Create Workout Plan</h3>
              </div>
              <button type="button" className="btn-close-modal" onClick={() => setShowCreatePlanChoice(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={openManualPlanEditor}
                style={{ padding: '14px', textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: '#fff', cursor: 'pointer' }}
              >
                <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '2px' }}>Build Manually</strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Add exercises yourself, exactly as before.</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowCreatePlanChoice(false); setShowAIBuilder(true); }}
                style={{ padding: '14px', textAlign: 'left', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--primary-accent-light)', cursor: 'pointer' }}
              >
                <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '2px' }}>✨ Create Draft with AI</strong>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Generate a starting point from the client's profile — you review and edit everything before it's assigned.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAIBuilder && (
        <AIWorkoutBuilderModal
          client={{
            name: selectedClient?.userName,
            age: selectedClient?.userAge,
            height: selectedClient?.userHeight,
            weight: resolvedClientWeightKg,
            goal: selectedClient?.userGoal,
            calories: selectedClient?.userCalorieTarget,
            protein: selectedClient?.userProteinTarget
          }}
          onClose={() => setShowAIBuilder(false)}
          onGenerated={handleAiDraftGenerated}
        />
      )}

      {/* Bulk-assign client picker — attached clients other than the one
          currently open, so the coach can send this same plan to several
          people at once instead of recreating it per client. */}
      {showClientPickerModal && (
        <div className="payment-gateway-backdrop" onClick={() => setShowClientPickerModal(false)}>
          <div
            className="payment-gateway-modal animate-scale-in"
            style={{ maxWidth: '380px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div className="modal-title-box">
                <h3>Assign to more clients</h3>
              </div>
              <button type="button" className="btn-close-modal" onClick={() => setShowClientPickerModal(false)}>✕</button>
            </div>
            <input
              type="text"
              placeholder="Search clients..."
              value={clientPickerSearch}
              onChange={(e) => setClientPickerSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'rgba(9,14,23,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.85rem', outline: 'none', marginBottom: '10px' }}
            />
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {clients
                .filter(c => c.coach_id === loggedInUserId && c.id !== selectedClient?.id)
                .filter(c => c.userName.toLowerCase().includes(clientPickerSearch.toLowerCase()))
                .map(c => {
                  const checked = extraAssignClientIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: 'var(--radius-sm)', background: checked ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)', border: checked ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setExtraAssignClientIds(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                      />
                      <span style={{ fontSize: '0.85rem', color: '#fff' }}>{c.userName}</span>
                    </label>
                  );
                })}
            </div>
            <button
              type="button"
              onClick={() => setShowClientPickerModal(false)}
              style={{ marginTop: '14px', padding: '10px', background: 'var(--primary-accent-light)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#06251b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Done ({extraAssignClientIds.length} selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainerDashboard;
