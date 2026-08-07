import { useState, useEffect, useRef } from 'react';
import Onboarding from './components/Onboarding';
import ClientOnboardingWizard from './components/ClientOnboardingWizard';
import HomeTracker from './components/HomeTracker';
import FatLossDashboard from './components/FatLossDashboard';
import MuscleDashboard from './components/MuscleDashboard';
import MealCheck from './components/MealCheck';
import BloatingTracker from './components/BloatingTracker';
import SmartMealPlans from './components/SmartMealPlans';
import ProgressDashboard from './components/ProgressDashboard';
import ClientProfile from './components/ClientProfile';
import SmartNudges from './components/SmartNudges';
import NutritionTracker from './components/NutritionTracker';
import WorkoutTracker from './components/WorkoutTracker';
import TrainerDashboard from './components/TrainerDashboard';
import WorkoutProgressDashboard from './components/WorkoutProgressDashboard';
import TourOverlay from './components/TourOverlay';
import CoachTourOverlay from './components/CoachTourOverlay';
import { useTour } from './context/TourContext';
import { useCoachTour } from './context/CoachTourContext';
import databaseService, { isSupabaseConfigured, supabase, isTrainer, TRAINER_EMAILS } from './services/databaseService';
import { subscribeToPush as registerForPushNotifications } from './utils/pushSubscription';
import { useWakeLock } from './hooks/useWakeLock';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Extract recovery token from the URL hash set by Supabase's redirect.
// Used directly in the password update fetch to bypass SDK session-management hangs.
const getRecoveryTokenFromHash = () => {
  const hash = window.location.hash;
  if (/type=recovery/.test(hash) && /access_token=/.test(hash)) {
    return new URLSearchParams(hash.substring(1)).get('access_token') || '';
  }
  return '';
};
import ResetPasswordPage from './components/ResetPasswordPage';
import AuthConfirm from './components/AuthConfirm';
import { isSuperAdmin } from './services/accessControl';
import './index.css'; 


const getDynamicTargets = () => {
  const calorieTarget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
  const userWeight = parseFloat(localStorage.getItem('userWeight') || '70');
  const userProteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '130');
  const userFatsTarget = parseInt(localStorage.getItem('userFatsTarget') || '60');
  const steps = parseInt(localStorage.getItem('userSyncedSteps') || '0');

  // Dynamic water target matching HomeTracker calculations
  const baseCalorieGlasses = calorieTarget / 250;
  const baseWeightGlasses = (userWeight * 35) / 250;
  const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
  const stepBooster = Math.floor(steps / 3000);
  const proteinBooster = userProteinTarget > 100 ? 1 : 0;
  const waterTargetLiters = Math.max(6, baselineTarget + stepBooster + proteinBooster) * 0.25;

  return {
    waterTarget: waterTargetLiters,
    proteinTarget: userProteinTarget,
    fatsTarget: userFatsTarget,
    liftingTarget: 100
  };
};

const generateProgressMockData = () => {
  const targets = getDynamicTargets();
  const water = [];
  const protein = [];
  const fats = [];
  const lifting = [];

  for (let i = 1; i <= 30; i++) {
    water.push({ day: i, val: 0.0, target: targets.waterTarget });
    protein.push({ day: i, val: 0, target: targets.proteinTarget });
    fats.push({ day: i, val: 0, target: targets.fatsTarget });
    lifting.push({ day: i, val: 0.0, target: targets.liftingTarget });
  }

  return { water, protein, fats, lifting };
};

const archiveYesterdayStats = (lastDateStr) => {
  const date = new Date(lastDateStr);
  const dayNum = date.getDate(); // 1 to 31
  const idx = (dayNum - 1) % 30; // index in our 30-day progress arrays
  
  const waterGl = parseInt(localStorage.getItem('waterGlasses') || '0');
  const waterLiters = waterGl * 0.25; 
  
  const eatenCals = parseInt(localStorage.getItem('userLoggedCalories') || '0');
  const proteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '130');
  const budget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
  
  let loggedProt = parseInt(localStorage.getItem('userLoggedProtein') || '0');
  if (loggedProt === 0 && eatenCals > 0) {
    const ratio = budget > 0 ? eatenCals / budget : 0;
    loggedProt = Math.round(proteinTarget * ratio);
  }
  
  let loggedFat = parseInt(localStorage.getItem('userLoggedFats') || '0');
  if (loggedFat === 0 && eatenCals > 0) {
    const fatsTarget = parseInt(localStorage.getItem('userFatsTarget') || '60');
    const ratio = budget > 0 ? eatenCals / budget : 0;
    loggedFat = Math.round(fatsTarget * ratio);
  }

  let history = null;
  const storedHistory = localStorage.getItem('monthlyProgressHistory');
  if (storedHistory) {
    try {
      history = JSON.parse(storedHistory);
    } catch (e) {
      console.error(e);
    }
  }
  
  if (!history) {
    history = generateProgressMockData();
  }
  
  if (history.water[idx]) history.water[idx].val = waterLiters;
  if (history.protein[idx]) history.protein[idx].val = loggedProt;
  if (history.fats[idx]) history.fats[idx].val = loggedFat;
  
  localStorage.setItem('monthlyProgressHistory', JSON.stringify(history));
};

const resetDailyLogs = () => {
  localStorage.setItem('waterGlasses', '0');
  localStorage.setItem('userSyncedSteps', '0');
  
  localStorage.setItem('homeMealBreakfast', '0');
  localStorage.setItem('homeMealLunch', '0');
  localStorage.setItem('homeMealDinner', '0');
  localStorage.setItem('homeMealSnacks', '0');
  localStorage.setItem('userLoggedCalories', '0');
  
  localStorage.setItem('userLoggedProtein', '0');
  localStorage.setItem('userLoggedCarbs', '0');
  localStorage.setItem('userLoggedFats', '0');
  
  localStorage.setItem('walkLunchDinner', 'false');
  localStorage.setItem('strollsLogged', '0');
  
  window.dispatchEvent(new Event('waterUpdated'));
  window.dispatchEvent(new Event('stepsUpdated'));
  window.dispatchEvent(new Event('nutritionUpdated'));
};

const checkAndHandleDateRollover = () => {
  const lastSavedDate = localStorage.getItem('lastSavedDate');
  const todayStr = new Date().toDateString();
  if (lastSavedDate && lastSavedDate !== todayStr) {
    archiveYesterdayStats(lastSavedDate);
    resetDailyLogs();
    localStorage.setItem('lastSavedDate', todayStr);
    return true;
  } else if (!lastSavedDate) {
    localStorage.setItem('lastSavedDate', todayStr);
  }
  return false;
};

const clearLocalStoragePreservingChats = () => {
  const preserved = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('local_chat_') || key.startsWith('client_') || key.startsWith('remembered') || key === 'lastUserName' || key === 'last_logged_in_email')) {
      preserved[key] = localStorage.getItem(key);
    }
  }
  localStorage.clear();
  Object.keys(preserved).forEach(key => {
    localStorage.setItem(key, preserved[key]);
  });
};

const trackerKeys = [
  'waterGlasses', 'userSyncedSteps', 'userLoggedCalories', 
  'userLoggedProtein', 'userLoggedCarbs', 'userLoggedFats',
  'homeMealBreakfast', 'homeMealLunch', 'homeMealDinner', 'homeMealSnacks',
  'walkLunchDinner', 'strollsLogged', 'monthlyProgressHistory', 'workoutSessions'
];

const saveActiveUserCache = (userName) => {
  if (!userName) return;
  const keyPrefix = `client_${userName.toLowerCase().replace(/\s+/g, '')}_`;
  trackerKeys.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(`${keyPrefix}${key}`, val);
    } else {
      localStorage.removeItem(`${keyPrefix}${key}`);
    }
  });
};

const generateFreshHistory = () => {
  const calorieTarget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
  const userWeight = parseFloat(localStorage.getItem('userWeight') || '70');
  const userProteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '130');
  const userFatsTarget = parseInt(localStorage.getItem('userFatsTarget') || '60');
  
  const baseCalorieGlasses = calorieTarget / 250;
  const baseWeightGlasses = (userWeight * 35) / 250;
  const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
  const waterTargetLiters = Math.max(6, baselineTarget) * 0.25;

  const freshHistory = { water: [], protein: [], fats: [], lifting: [] };
  for (let i = 1; i <= 30; i++) {
    freshHistory.water.push({ day: i, val: 0.0, target: waterTargetLiters });
    freshHistory.protein.push({ day: i, val: 0, target: userProteinTarget });
    freshHistory.fats.push({ day: i, val: 0, target: userFatsTarget });
    freshHistory.lifting.push({ day: i, val: 0.0, target: 100 });
  }
  return freshHistory;
};

const loadActiveUserCache = (userName) => {
  if (!userName) return;
  const keyPrefix = `client_${userName.toLowerCase().replace(/\s+/g, '')}_`;
  
  const hasSavedData = localStorage.getItem(`${keyPrefix}waterGlasses`) !== null || 
                       localStorage.getItem(`${keyPrefix}monthlyProgressHistory`) !== null;
  
  if (hasSavedData) {
    trackerKeys.forEach(key => {
      const val = localStorage.getItem(`${keyPrefix}${key}`);
      if (val !== null) {
        localStorage.setItem(key, val);
      } else {
        if (key === 'monthlyProgressHistory') {
          localStorage.setItem(key, JSON.stringify(generateFreshHistory()));
        } else if (key === 'workoutSessions') {
          if (userName.toLowerCase() === 'sridhar') {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, '[]');
          }
        } else {
          localStorage.removeItem(key);
        }
      }
    });
  } else {
    // New user! Initialize everything to completely fresh zero baseline
    localStorage.setItem('waterGlasses', '0');
    localStorage.setItem('userSyncedSteps', '0');
    localStorage.setItem('userLoggedCalories', '0');
    localStorage.setItem('userLoggedProtein', '0');
    localStorage.setItem('userLoggedCarbs', '0');
    localStorage.setItem('userLoggedFats', '0');
    localStorage.setItem('homeMealBreakfast', '0');
    localStorage.setItem('homeMealLunch', '0');
    localStorage.setItem('homeMealDinner', '0');
    localStorage.setItem('homeMealSnacks', '0');
    localStorage.setItem('walkLunchDinner', 'false');
    localStorage.setItem('strollsLogged', '0');
    
    localStorage.setItem('monthlyProgressHistory', JSON.stringify(generateFreshHistory()));
    
    if (userName.toLowerCase() === 'sridhar') {
      localStorage.removeItem('workoutSessions');
    } else {
      localStorage.setItem('workoutSessions', '[]');
    }
  }
  
  window.dispatchEvent(new Event('waterUpdated'));
  window.dispatchEvent(new Event('stepsUpdated'));
  window.dispatchEvent(new Event('nutritionUpdated'));
};

// registerForPushNotifications moved to utils/pushSubscription.js
// (subscribeToPush) so it can be shared with TrainerDashboard.jsx without a
// circular import back into this file.

// ── Shared local-notification helper ──
// Shows a notification on THIS device (works while the app is open, backgrounded,
// or the screen is locked, via the service worker). Kept kind and professional
// in every message the callers pass in.
const showLocalNotification = (title, body, tag = 'fitengineers-nudge') => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => { try { new Notification(title, options); } catch (e) { /* ignore */ } });
  } else {
    try { new Notification(title, options); } catch (e) { /* ignore */ }
  }
};

// ── Daily wellness schedule (coach-connected clients) ──
// Times are the client's device-local clock (IST for this audience). Each slot
// fires at most once per day. Messages are supportive and professional.
const MORNING_MOTIVATION = [
  "Good morning. Today is another chance to invest in yourself — one steady, intentional choice at a time. Let's make it count. ☀️",
  "Rise and shine. Progress is built on consistency, not perfection. Show up for yourself today and the results will follow. 💪",
  "Good morning. Your body is capable of remarkable things when you treat it with care. Start today strong and hydrated. 🌿",
  "A fresh morning, a fresh start. Small disciplined actions today become the strength you'll be proud of tomorrow. 🌅",
  "Good morning. Fuel your body well, move with purpose, and be kind to yourself. You've got everything it takes. 🙌"
];
const DAILY_SLOTS = [
  {
    id: 'morning', hour: 8, minute: 0,
    title: 'Good Morning ☀️',
    body: () => MORNING_MOTIVATION[new Date().getDate() % MORNING_MOTIVATION.length]
  },
  {
    id: 'brunch', hour: 11, minute: 0,
    title: 'Mid-Morning Reset 🚶',
    body: () => "Time for a short reset. Take a 5–10 minute walk to loosen up, and keep your hydration steady — aim for 2.5–3 litres of water across the day. Small habits, big results. 💧"
  },
  {
    id: 'lunch', hour: 13, minute: 0,
    title: 'Post-Lunch Movement 🍱',
    body: () => "Try not to sit right after lunch. A gentle 10-minute walk now supports your digestion and metabolism, and keeps your energy steady through the afternoon. 🌿"
  },
  {
    id: 'dinner', hour: 19, minute: 30,
    title: 'Dinner Reminder 🍽️',
    body: () => "Time to wind down with dinner. Focus on a high-protein, balanced plate to support your recovery and strength. Try to eat a little earlier so your body can rest well tonight. 🥗"
  },
  {
    id: 'evening', hour: 21, minute: 30,
    title: 'Well Done Today 🌙',
    body: () => "You showed up and gave your best today, and that matters. Rest deeply tonight, let your body recover, and we'll do it all again tomorrow. Proud of you. ✨"
  }
];

function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('onboardingComplete') === 'true');
  const [showClientWizard, setShowClientWizard] = useState(() => {
    // Show wizard if client has logged in before but hasn't completed onboarding
    return localStorage.getItem('onboardingComplete') === 'true' &&
           localStorage.getItem('onboardingCompleted') === 'false' &&
           (localStorage.getItem('userRole') === 'client' || !localStorage.getItem('userRole'));
  });
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'home');
  // First-login spotlight walkthrough — shown once per role, replayable via a help button.
  const demoTourCheckedRef = useRef(false);
  const clientTour = useTour();
  const coachTour = useCoachTour();
  const [userGoal, setUserGoal] = useState(() => localStorage.getItem('userGoal') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') || '');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole') || '');
  const lastProcessedEmailRef = useRef('');

  // Gate: set when a logged-in session's email_confirmed_at is null (email/password
  // signup that hasn't clicked the confirmation link yet). Takes priority over the
  // normal onboarding/login screen until cleared.
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('idle');
  const [resendError, setResendError] = useState('');

  // Password Reset Modal States — initialise from URL hash so the very first render
  // already shows the modal when Supabase redirects back with #access_token=...&type=recovery,
  // before onAuthStateChange has had a chance to fire.
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(() => {
    const hash = window.location.hash;
    return /type=recovery/.test(hash) && /access_token=/.test(hash);
  });
  // Capture the recovery access token at init so the form can use it directly via
  // raw fetch — the Supabase SDK's updateUser hangs on this project for unknown reasons.
  const [recoveryAccessToken] = useState(() => getRecoveryTokenFromHash());
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);

  // First-login demo tour: show a short walkthrough once per role, after any
  // required onboarding wizard is out of the way. Re-checks whenever the
  // gating state changes (e.g. right after the client wizard completes) but
  // only ever flips it on once via the ref guard, so replaying (see the help
  // button) or dismissing it doesn't get immediately re-triggered.
  useEffect(() => {
    if (demoTourCheckedRef.current) return;
    if (!userEmail || !onboardingComplete) return;
    if (showClientWizard || pendingConfirmationEmail || showResetPasswordModal) return;

    const admin = isSuperAdmin(userEmail) || userRole === 'super-admin' || userRole === 'admin';
    const coach = isTrainer(userEmail) || userRole === 'coach';
    if (admin) { demoTourCheckedRef.current = true; return; }

    if (coach) {
      // Coaches get the same interactive spotlight tour as clients — it
      // opens a sample "Demo Client" row and walks through Manage → Send
      // plan → Live Log → History (see CoachTourOverlay.jsx).
      coachTour.start();
    } else {
      // Clients get the interactive spotlight tour instead of the modal —
      // it starts on the Home screen and follows real navigation into the
      // Workout tab (see the bottom-nav effect below and WorkoutTracker.jsx).
      clientTour.start();
    }
    demoTourCheckedRef.current = true;
  }, [userEmail, userRole, onboardingComplete, showClientWizard, pendingConfirmationEmail, showResetPasswordModal, clientTour, coachTour]);

  // Spotlight step 1→2: the bottom-nav Workout button is highlighted from
  // the Home screen; once the user actually navigates to the Workout tab
  // (however they got there — bottom nav or a dashboard CTA), move on.
  useEffect(() => {
    if (activeTab === 'workouts') clientTour.advanceIfStep(1, 2);
  }, [activeTab, clientTour]);

  // Resume-refresh: if the app was backgrounded (tab hidden, phone locked, or
  // the PWA suspended) for more than 15 minutes, force a full reload the moment
  // it's foregrounded again — mirrors Instagram/Facebook reloading stale state
  // on reopen. This refreshes data, it does not log the user out.
  useEffect(() => {
    const REFRESH_AFTER_MS = 15 * 60 * 1000;
    const STORAGE_KEY = 'appLastHiddenAt';

    const checkAndRefresh = () => {
      const lastHidden = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (lastHidden && Date.now() - lastHidden > REFRESH_AFTER_MS) {
        // Clear first so a reload can never re-trigger itself in a loop.
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }
    };

    // Covers "closed and relaunched": if the process was killed while
    // backgrounded, this is a fresh mount and no 'visible' event fires for
    // it — check once immediately instead.
    checkAndRefresh();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
      } else if (document.visibilityState === 'visible') {
        checkAndRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const processSessionUser = async (user) => {
      try {
        const email = user.email;
        const googleName = user.user_metadata?.full_name || user.user_metadata?.name;

        if (lastProcessedEmailRef.current === email) {
          // Avoid duplicate processing/database hits on same user to prevent state resets
          return;
        }
        lastProcessedEmailRef.current = email;

        // Central email-confirmation gate. OAuth providers (Google) are pre-verified
        // and always have email_confirmed_at set, so this only ever blocks email/password
        // signups that haven't clicked their confirmation link — it never touches the
        // invite-code flow, which only runs against an already-authenticated session.
        if (!user.email_confirmed_at) {
          lastProcessedEmailRef.current = '';
          setOnboardingComplete(false);
          setPendingConfirmationEmail(email);
          return;
        }
        setPendingConfirmationEmail('');

        // Stamp last_login for the Super-Admin activity dashboard on every
        // resolved session — not just a fresh credential submit (that path
        // is databaseService.signIn's own stamp). Persisted/restored
        // sessions and OAuth logins land here too, so this is what keeps
        // "Active today" accurate for clients who stay logged in across
        // days. Fire-and-forget, guarded above by lastProcessedEmailRef so
        // it only fires once per app session per user.
        databaseService.touchLastLogin(email);

        // When a coach-tab login is underway, handleCoachEmailLogin is the sole
        // authority for routing: it verifies a coaches row actually exists and either
        // enters the coach dashboard or signs out + shows "No coach account found".
        // Bail out here so this generic session handler doesn't race ahead and route
        // the freshly-authenticated session into the client wizard by table lookup,
        // which would swallow that rejection. The form clears the flag when done.
        if (localStorage.getItem('coachLoginInProgress') === 'true') {
          lastProcessedEmailRef.current = '';
          return;
        }

        let profile = await databaseService.getUserProfileByEmail(email);
        // A null result here used to be trusted outright as "this user
        // doesn't exist yet" and fed straight into the auto-create path below,
        // which overwrites any EXISTING profile (coach_id: null + placeholder
        // defaults) via upsert on user_id — so a single transient lookup
        // failure (e.g. right after a fresh auth session, see
        // getUserProfileByEmail) could silently wipe a real client's coach
        // link and data. One short retry before trusting a null costs at
        // most ~600ms on the rare path where it's needed, and this is the one
        // place a wrong guess is destructive rather than just a blank screen.
        if (!profile) {
          await new Promise(r => setTimeout(r, 600));
          profile = await databaseService.getUserProfileByEmail(email);
        }
        console.log("Login successful. Role found: " + (profile?.role || 'none'));
        const isSuperAdminEmail = email.toLowerCase() === 'subodhmankala@gmail.com';

        // Coach access suspended by the super admin (malpractice block).
        // Enforced centrally so it applies on every login/refresh, not just the
        // coach login form. Super admin can never block themselves out.
        if (profile && profile.role === 'coach' && profile.coachIsBlocked === true && !isSuperAdminEmail) {
          sessionStorage.removeItem('pendingCoachLogin');
          await databaseService.signOut();
          clearLocalStoragePreservingChats();
          setUserEmail('');
          setUserRole('');
          setOnboardingComplete(false);
          lastProcessedEmailRef.current = '';
          alert("Your coach access has been suspended. Please contact the Fitengineers team.");
          return;
        }

        const resolvedRole = profile?.role || '';
        // SECURITY BUG FIX (2026-07-09): this flag was in localStorage, but
        // signInWithGoogle() calls supabase.auth.signOut() as a "clean slate"
        // step BEFORE the OAuth redirect — that fires a SIGNED_OUT event which
        // runs clearLocalStoragePreservingChats() (a full localStorage.clear()
        // minus a small whitelist), wiping this flag before the redirect even
        // happens. A coach's Google sign-in then came back with no flag, got
        // treated as a brand-new client, and was routed into the CLIENT
        // 4-step onboarding wizard. sessionStorage survives the same-tab OAuth
        // redirect just as well and is completely untouched by
        // localStorage.clear(), so it can't be collaterally wiped this way.
        const pendingCoachLogin = sessionStorage.getItem('pendingCoachLogin') === 'true';
        const isApprovedCoach =
          TRAINER_EMAILS.includes(email.toLowerCase()) ||
          resolvedRole === 'coach' ||
          resolvedRole === 'super-admin' ||
          resolvedRole === 'admin';

        if (pendingCoachLogin) {
          sessionStorage.removeItem('pendingCoachLogin');
          localStorage.setItem('userEmail', email);
          if (googleName) localStorage.setItem('userName', googleName);

          if (isApprovedCoach) {
            if (profile) {
              await databaseService.loadProfileIntoLocalStorage(profile, email);
              setUserRole(profile.role);
            } else {
              localStorage.setItem('userName', googleName || 'Coach');
              const finalRole = email.toLowerCase() === 'subodhmankala@gmail.com' ? 'super-admin' : 'coach';
              localStorage.setItem('userRole', finalRole);
              setUserRole(finalRole);
            }
            setUserEmail(email);
            localStorage.setItem('onboardingComplete', 'true');
            setOnboardingComplete(true);
            return;
          }

          localStorage.setItem('pendingCoachApply', 'true');
          setUserEmail(email);
          setUserRole('coach_pending');
          setOnboardingComplete(false);
          return;
        }
        
        if (!isApprovedCoach) {
          // It's a client user! Route straight to dashboard.
          // Self-heal: this session is definitively a CLIENT, so any lingering
          // coach-signup flag from an earlier abandoned coach attempt on this
          // device must not survive it — a stale pendingCoachApply otherwise
          // forces the coach sign-up form on the next Onboarding mount (e.g.
          // right after this OAuth redirect, or the next logout).
          localStorage.removeItem('pendingCoachApply');
          // First, check if client row exists. If not, create with coach_id = null and defaults.
          let clientProfile = profile;
          if (!clientProfile) {
            const defaultName = googleName || email.split('@')[0] || 'Warrior';
            try {
              await databaseService.saveUserProfile({
                userName: defaultName,
                email: email,
                role: 'client',
                coach_id: null,
                userAge: '30',
                userHeight: '175',
                userWeight: '70',
                userActivity: 'Moderately Active',
                userGoal: 'Fat Loss',
                userDiet: 'Non-Vegetarian',
                userCalorieTarget: '2000',
                userProteinTarget: '120',
                userCarbsTarget: '220',
                userFatsTarget: '70',
                verified: false
              });
              clientProfile = await databaseService.getUserProfileByEmail(email);
            } catch (err) {
              console.error("Error auto-creating user profile in session handler:", err);
            }
          }

          if (clientProfile) {
            await databaseService.loadProfileIntoLocalStorage(clientProfile, email);
            setUserRole(clientProfile.role);
            // Backfill a real name from the Google display name when the stored
            // one is still the "Warrior" placeholder (or blank / the email
            // prefix) — clients created before the name was captured show
            // "Warrior" otherwise. localStorage updates instantly for the UI;
            // the DB sync is best-effort (never block login on it).
            const currentName = (clientProfile.userName || '').trim().toLowerCase();
            const emailPrefix = email.split('@')[0].toLowerCase();
            if (googleName && (currentName === '' || currentName === 'warrior' || currentName === emailPrefix)) {
              localStorage.setItem('userName', googleName);
              databaseService.saveUserProfile({
                ...clientProfile,
                userName: googleName,
                email,
                role: clientProfile.role || 'client',
                coach_id: clientProfile.coach_id || null
              }).catch(e => console.warn('Client name backfill from Google failed (non-fatal):', e));
            }
          } else {
            // Fallback storage if db fails
            localStorage.setItem('userName', googleName || email.split('@')[0] || 'Warrior');
            localStorage.setItem('userEmail', email);
            localStorage.setItem('userRole', 'client');
            localStorage.setItem('userAge', '30');
            localStorage.setItem('userHeight', '175');
            localStorage.setItem('userWeight', '70');
            localStorage.setItem('userActivity', 'Moderately Active');
            localStorage.setItem('userGoal', 'Fat Loss');
            localStorage.setItem('userCalorieTarget', '2000');
            localStorage.setItem('userProteinTarget', '120');
            localStorage.setItem('userCarbsTarget', '220');
            localStorage.setItem('userFatsTarget', '70');
            localStorage.setItem('onboardingCompleted', 'false');
            setUserRole('client');
          }
          if (clientProfile?.userGoal) setUserGoal(clientProfile.userGoal);
          setUserEmail(email);
          localStorage.setItem('onboardingComplete', 'true');
          setOnboardingComplete(true);
          // Show wizard if onboarding_completed is false (new client)
          if (clientProfile?.onboarding_completed === false || clientProfile?.onboarding_completed === null || !clientProfile?.onboarding_completed) {
            setShowClientWizard(true);
          } else {
            setShowClientWizard(false);
          }
          return;
        }

        // Approved coach or trainer login flow
        const hasCompleteProfile = profile && 
                                   profile.userName && 
                                   profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN' && profile.userAge !== '' &&
                                   profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN' && profile.userHeight !== '' &&
                                   profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN' && profile.userWeight !== '';

        const isUserTrainer = isTrainer(email);

        if (isUserTrainer || hasCompleteProfile) {
          // If the profile has a placeholder name, update it with their real Google name
          let finalName = profile?.userName || 'Trainer';
          if (googleName && (finalName.toLowerCase().includes('test') || finalName === 'Warrior' || finalName === '')) {
            finalName = googleName;
          }
          
          if (profile) {
            await databaseService.loadProfileIntoLocalStorage(profile, email);
            setUserRole(profile.role);
          } else {
            localStorage.setItem('userName', finalName);
            localStorage.setItem('userEmail', email);
            const fallbackRole = isUserTrainer ? (email.toLowerCase() === 'subodhmankala@gmail.com' ? 'super-admin' : 'coach') : 'client';
            localStorage.setItem('userRole', fallbackRole);
            setUserRole(fallbackRole);
          }
          if (profile?.userGoal) setUserGoal(profile.userGoal);
          setUserEmail(email);
          
          localStorage.setItem('onboardingComplete', 'true');
          setOnboardingComplete(true);
        } else {
          // Incomplete trainer profile!
          localStorage.setItem('userEmail', email);
          const nameToUse = (profile && profile.userName && !profile.userName.toLowerCase().includes('test')) 
            ? profile.userName 
            : (googleName || '');
          
          if (nameToUse) {
            localStorage.setItem('userName', nameToUse);
          } else {
            localStorage.removeItem('userName');
          }

          if (profile) {
            if (profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN') localStorage.setItem('userAge', profile.userAge);
            if (profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN') localStorage.setItem('userHeight', profile.userHeight);
            if (profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN') localStorage.setItem('userWeight', profile.userWeight);
            if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
            if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
            if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
            setUserRole(profile.role);
          } else {
            setUserRole('client');
          }
          setUserEmail(email);
          setOnboardingComplete(false);
        }
      } catch (err) {
        console.error("Error processing session user:", err);
        lastProcessedEmailRef.current = '';
        setOnboardingComplete(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPasswordModal(true);
        return; // Don't run processSessionUser — just show the reset form
      }
      if (session && session.user) {
        await processSessionUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        const activeEmail = localStorage.getItem('userEmail') || userEmail;
        if (activeEmail) {
          localStorage.setItem('last_logged_in_email', activeEmail);
        }
        const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
        const rememberedPassword = localStorage.getItem('rememberedPassword') || '';
        const lastUserName = localStorage.getItem('lastUserName') || '';
        
        lastProcessedEmailRef.current = '';
        clearLocalStoragePreservingChats();
        
        if (rememberedEmail) localStorage.setItem('rememberedEmail', rememberedEmail);
        if (rememberedPassword) localStorage.setItem('rememberedPassword', rememberedPassword);
        if (lastUserName) localStorage.setItem('lastUserName', lastUserName);
        
        setOnboardingComplete(false);
        setUserGoal('');
        setUserEmail('');
        setActiveTab('home');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep active tab state persisted across reloads/reopens
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Keep the screen from auto-locking/dimming while the app is actually in
  // use (past login/onboarding) — most noticeable during a live cardio set
  // where the client's hands are on a treadmill/bike, not the phone.
  useWakeLock(onboardingComplete);

  // ─── Real-Time Cloud Database Synchronizer ───
  useEffect(() => {
    if (!onboardingComplete) return;

    let lastSyncedString = '';

    const syncTodayStateToCloud = () => {
      const waterGlasses = localStorage.getItem('waterGlasses') || '0';
      const syncedSteps = localStorage.getItem('userSyncedSteps') || '0';
      const loggedCalories = localStorage.getItem('userLoggedCalories') || '0';
      const loggedProtein = localStorage.getItem('userLoggedProtein') || '0';
      const loggedFats = localStorage.getItem('userLoggedFats') || '0';
      const walkLunchDinner = localStorage.getItem('walkLunchDinner') || 'false';
      const todayStr = new Date().toISOString().split('T')[0];

      const currentStateString = `${waterGlasses}_${syncedSteps}_${loggedCalories}_${loggedProtein}_${loggedFats}_${walkLunchDinner}`;

      if (currentStateString !== lastSyncedString) {
        databaseService.saveTrackerLog({
          date: todayStr,
          waterGlasses,
          syncedSteps,
          loggedCalories,
          loggedProtein,
          loggedFats,
          walkLunchDinner
        });
        lastSyncedString = currentStateString;
      }
    };

    // Debounced real-time cloud synchronizer (polls local cache every 5s for uploads)
    const syncInterval = setInterval(syncTodayStateToCloud, 5000);
    return () => clearInterval(syncInterval);
  }, [onboardingComplete]);

  useEffect(() => {
    const isComplete = localStorage.getItem('onboardingComplete');
    if (isComplete === 'true') {
      setOnboardingComplete(true);
      const goal = localStorage.getItem('userGoal');
      if (goal) setUserGoal(goal);

      // Check date rollover on startup
      checkAndHandleDateRollover();
    }
  }, []);

  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );

  useEffect(() => {
    const handlePermissionSync = () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    };
    window.addEventListener('notificationPermissionChanged', handlePermissionSync);
    return () => window.removeEventListener('notificationPermissionChanged', handlePermissionSync);
  }, []);

  useEffect(() => {
    const userName = localStorage.getItem('userName');
    if (notificationPermission === 'granted' && userName) {
      registerForPushNotifications(userName);
    }
  }, [notificationPermission, onboardingComplete]);

  // ── Daily Wellness Schedule (coach-connected clients only) ──
  // Fires the day's structured supportive nudges (morning → evening) at their
  // set local times, each at most once per day. These run on THIS device while
  // the app is open or backgrounded; the Vercel cron + web-push backend
  // (api/send-nudges) covers pure lock-screen delivery when the app is fully
  // closed. Only coach-connected clients receive the wellness schedule.
  useEffect(() => {
    if (!onboardingComplete) return;
    if (!('Notification' in window) || notificationPermission !== 'granted') return;

    const isCoachConnectedClient = () => {
      const role = localStorage.getItem('userRole') || 'client';
      return role !== 'coach' && role !== 'super-admin' && role !== 'admin'
        && localStorage.getItem('clientLinkedToCoach') === 'true';
    };

    const checkSchedule = () => {
      checkAndHandleDateRollover();
      if (!isCoachConnectedClient()) return;
      const now = new Date();
      const dateStr = now.toDateString();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      DAILY_SLOTS.forEach((slot) => {
        // 5-minute catch window: if the app happens to open a couple minutes
        // after the slot time, it still delivers (once) rather than skipping.
        const inWindow = hours === slot.hour && minutes >= slot.minute && minutes < slot.minute + 5;
        if (!inWindow) return;
        const key = `nudge_${slot.id}_${dateStr}`;
        if (localStorage.getItem(key) === 'true') return;
        showLocalNotification(slot.title, slot.body(), `fitengineers-${slot.id}`);
        localStorage.setItem(key, 'true');
      });
    };

    const startupTimeout = setTimeout(checkSchedule, 15000);
    const interval = setInterval(checkSchedule, 60000); // Check every minute
    return () => {
      clearTimeout(startupTimeout);
      clearInterval(interval);
    };
  }, [onboardingComplete, notificationPermission]);

  // ── Screen-Time / Excessive-Use Nudge ──
  // Encourages the client to step away when they've been continuously in the
  // app for a long stretch (passive scrolling). Tracks how long the app has
  // been continuously in the foreground; after the threshold it delivers one
  // gentle "take a break" nudge, then resets. The counter resets whenever the
  // app is backgrounded (they already stepped away).
  useEffect(() => {
    if (!onboardingComplete) return;
    if (!('Notification' in window) || notificationPermission !== 'granted') return;

    const CONTINUOUS_USE_LIMIT_MS = 20 * 60 * 1000; // 20 minutes of continuous use
    const COOLDOWN_MS = 30 * 60 * 1000;             // don't re-nudge for 30 min

    let foregroundSince = document.visibilityState === 'visible' ? Date.now() : null;
    let lastNudgeAt = 0;

    const screenTimeMessages = [
      "You've been on your phone for a little while now. This is a gentle nudge to stand up, stretch, and take a short walk — your body will thank you. 🚶",
      "Time for a quick break. Set the phone down for a few minutes, move around, and grab some water. You'll come back refreshed. 💧",
      "A friendly reminder to look up from the screen. A short walk or a few stretches right now does wonders for your focus and energy. 🌿"
    ];

    const check = () => {
      if (document.visibilityState !== 'visible' || foregroundSince == null) return;
      const now = Date.now();
      if (now - foregroundSince >= CONTINUOUS_USE_LIMIT_MS && now - lastNudgeAt >= COOLDOWN_MS) {
        const msg = screenTimeMessages[Math.floor(Math.random() * screenTimeMessages.length)];
        showLocalNotification('Time for a Break 🌿', msg, 'fitengineers-screentime');
        lastNudgeAt = now;
        foregroundSince = now; // restart the continuous-use window
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        foregroundSince = Date.now();
      } else {
        foregroundSince = null; // stepped away — reset the counter
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(check, 60000); // Check every minute
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [onboardingComplete, notificationPermission]);

  // PKCE / token_hash email-link flow. Links of the form
  // /auth/confirm?token_hash=...&type=... are verified here client-side, which
  // survives Gmail's link scanner (it does a plain GET and never runs this JS,
  // so the one-time token isn't consumed before the human clicks).
  if (window.location.pathname === '/auth/confirm') {
    return <AuthConfirm />;
  }

  // Expired / already-used auth link (Supabase puts the failure in the URL hash,
  // e.g. #error=access_denied&error_code=otp_expired). Without this, an expired
  // confirmation/reset link has no session, so the app falls through to the
  // onboarding wizard instead of telling the user the link is dead. Show a clear
  // message + a way back to login instead.
  if (typeof window !== 'undefined' && /error_code=otp_expired|error=access_denied/.test(window.location.hash || '')) {
    const backToLogin = async () => {
      try { await databaseService.signOut(); } catch (e) { /* */ }
      localStorage.clear();
      window.location.href = window.location.origin;
    };
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109, 40, 217, 0.15), transparent 40%), #030712' }}>
        <div style={{ maxWidth: '420px', width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⏳</div>
          <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>This link has expired</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
            That email link is no longer valid — it may have already been used, or expired. Head back to the login screen and request a new one (use the most recent email and open it promptly).
          </p>
          <button
            onClick={backToLogin}
            style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (window.location.pathname === '/reset-password') {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109, 40, 217, 0.15), transparent 40%), #030712' }}>
        <ResetPasswordPage />
      </div>
    );
  }

  if (pendingConfirmationEmail) {
    const handleResendConfirmation = async () => {
      setResendStatus('sending');
      setResendError('');
      try {
        const { error } = await supabase.auth.resend({ type: 'signup', email: pendingConfirmationEmail });
        if (error) throw error;
        setResendStatus('sent');
      } catch (err) {
        setResendStatus('error');
        setResendError(err.message || 'Failed to resend confirmation email.');
      }
    };

    const handleUseDifferentAccount = async () => {
      try {
        await databaseService.signOut();
      } catch (err) {
        console.error('Sign out error:', err);
      }
      localStorage.clear();
      window.location.reload();
    };

    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109, 40, 217, 0.15), transparent 40%), #030712' }}>
        <div style={{ maxWidth: '420px', width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📧</div>
          <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>Confirm your email to continue</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
            We sent a confirmation link to <strong style={{ color: '#fff' }}>{pendingConfirmationEmail}</strong>. Click it, then come back and tap "I've confirmed" below.
          </p>

          {resendStatus === 'sent' && (
            <p style={{ color: '#10b981', fontSize: '0.82rem', marginBottom: '16px' }}>✅ Confirmation email resent — check your inbox.</p>
          )}
          {resendStatus === 'error' && (
            <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '16px' }}>{resendError}</p>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
          >
            ✓ I've confirmed — Refresh
          </button>
          <button
            onClick={handleResendConfirmation}
            disabled={resendStatus === 'sending'}
            style={{ width: '100%', padding: '12px', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: resendStatus === 'sending' ? 'default' : 'pointer' }}
          >
            {resendStatus === 'sending' ? 'Sending...' : 'Resend confirmation email'}
          </button>
          <button
            onClick={handleUseDifferentAccount}
            style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <div className="app-container">
        <Onboarding key={userEmail || 'guest'} onComplete={() => {
          const prevName = localStorage.getItem('lastUserName');
          const newName = localStorage.getItem('userName');
          
          if (!prevName || prevName !== newName) {
            // Save the previous user's tracking data to their partition cache before swapping
            if (prevName) {
              saveActiveUserCache(prevName);
            }

            // New user! Preserve onboarding keys but clear all old tracker data & monthly history
            const keysToKeep = [
              'onboardingComplete', 'onboardingCompleted', 'userName', 'userAge', 'userHeight', 'userWeight',
              'userActivity', 'userGoal', 'userIssue', 'userDiet',
              'userCalorieTarget', 'userProteinTarget', 'userCarbsTarget', 'userFatsTarget',
              'userEmail', 'rememberedEmail', 'rememberedPassword', 'lastUserName',
              'userRole', 'userPhone', 'userBrand', 'userPaymentStatus', 'userCoachId'
            ];
            const tempStorage = {};
            keysToKeep.forEach(k => {
              tempStorage[k] = localStorage.getItem(k);
            });
            clearLocalStoragePreservingChats();
            Object.keys(tempStorage).forEach(k => {
              if (tempStorage[k] !== null) localStorage.setItem(k, tempStorage[k]);
            });

            // Load this new client's isolated database/cache (initializes fresh zero baseline if new)
            loadActiveUserCache(newName);

            // Sync User Profile and initial fresh history to Supabase Cloud Database!
            let freshHistory = JSON.parse(localStorage.getItem('monthlyProgressHistory'));
            if (!freshHistory) {
              freshHistory = generateFreshHistory();
              localStorage.setItem('monthlyProgressHistory', JSON.stringify(freshHistory));
            }
            const profile = {
              email: tempStorage['userEmail'] || localStorage.getItem('userEmail'),
              userName: tempStorage['userName'] || newName,
              userAge: tempStorage['userAge'],
              userHeight: tempStorage['userHeight'],
              userWeight: tempStorage['userWeight'],
              userActivity: tempStorage['userActivity'],
              userGoal: tempStorage['userGoal'],
              userDiet: tempStorage['userDiet'],
              userCalorieTarget: tempStorage['userCalorieTarget'],
              userProteinTarget: tempStorage['userProteinTarget'],
              userCarbsTarget: tempStorage['userCarbsTarget'],
              userFatsTarget: tempStorage['userFatsTarget'],
              userIssue: tempStorage['userIssue'],
              role: tempStorage['userRole'] || 'client',
              phone: tempStorage['userPhone'],
              brand: tempStorage['userBrand'],
              payment_status: tempStorage['userPaymentStatus'] || 'active',
              coach_id: tempStorage['userCoachId'] || localStorage.getItem('pendingInviteCoachId')
            };
            databaseService.saveUserProfile(profile);
            databaseService.saveProgressHistory(freshHistory);

            // Set lastSavedDate to today to prime rollover checks correctly
            const todayStr = new Date().toDateString();
            localStorage.setItem('lastSavedDate', todayStr);
          } else {
            // Same user logged back in! Restore cache and check if date changed
            loadActiveUserCache(newName);
            checkAndHandleDateRollover();
          }

          localStorage.setItem('onboardingComplete', 'true');
          const goal = localStorage.getItem('userGoal');
          if (goal) setUserGoal(goal);
          setUserEmail(localStorage.getItem('userEmail') || '');
          setUserRole(localStorage.getItem('userRole') || 'client');
          setOnboardingComplete(true);
          // Show wizard only for clients who haven't completed 4-step onboarding
          const completedWizard = localStorage.getItem('onboardingCompleted');
          const role = localStorage.getItem('userRole') || 'client';
          const isCoachRole = role === 'coach' || role === 'super-admin' || role === 'admin';
          if (!isCoachRole && completedWizard !== 'true' && (role === 'client' || !role)) {
            localStorage.setItem('onboardingCompleted', 'false');
            setShowClientWizard(true);
          } else {
            setShowClientWizard(false);
          }
        }} />
      </div>
    );
  }

  const handleLogout = async () => {
    const activeEmail = localStorage.getItem('userEmail') || userEmail;
    const activeRole = localStorage.getItem('userRole') || userRole;

    // Sign out from Supabase Auth if active and wait for it to complete
    try {
      await databaseService.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }

    // Clear all local storage keys explicitly as required
    localStorage.clear();

    // Re-save prefilled email for persistence
    if (activeEmail) {
      localStorage.setItem('last_logged_in_email', activeEmail);
    }
    // Remember which tab (coach vs client) they were using, so the login
    // screen defaults back to it instead of always landing on Client.
    if (activeRole === 'coach' || activeRole === 'super-admin') {
      localStorage.setItem('lastAuthUserType', 'coach');
    }
    
    // Invalidate PWA cache and old service workers to force reload the fresh code
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      } catch (err) {
        console.error("Service worker unregister error:", err);
      }
    }
    if ('caches' in window) {
      try {
        const names = await caches.keys();
        for (let name of names) {
          await caches.delete(name);
        }
      } catch (err) {
        console.error("Cache clear error:", err);
      }
    }

    lastProcessedEmailRef.current = '';
    setOnboardingComplete(false);
    setShowClientWizard(false);
    setUserGoal('');
    setUserEmail('');
    setActiveTab('home');

    // Perform hard reload immediately since all async operations are completed!
    window.location.reload();
  };

  const renderHomeDashboard = () => {
    return <WorkoutProgressDashboard handleLogout={handleLogout} onNavigateToWorkouts={() => setActiveTab('workouts')} />;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return renderHomeDashboard();
      case 'workouts': return <WorkoutTracker />;
      case 'profile': return <ClientProfile handleLogout={handleLogout} onReplayDemoTour={() => { setActiveTab('home'); clientTour.restart(); }} />;
      default: return renderHomeDashboard();
    }
  };

  const isNavVisible = true;

  const renderResetPasswordModal = () => {
    if (!showResetPasswordModal) return null;
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
        zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'rgba(20, 20, 20, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '16px'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 800, textAlign: 'center' }}>
            🔒 Reset Your Password
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', textAlign: 'center' }}>
            Enter your new secure password below to complete the recovery.
          </p>

          {resetPasswordError && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#ef4444', fontSize: '0.78rem', textAlign: 'center' }}>
              ❌ {resetPasswordError}
            </div>
          )}

          {resetPasswordSuccess ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#10b981', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <span>✅ Password updated successfully!</span>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Redirecting you to the app...</span>
            </div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (newResetPassword.length < 6) {
                setResetPasswordError('Password must be at least 6 characters.');
                return;
              }
              setResetPasswordLoading(true);
              setResetPasswordError('');
              try {
                // Use raw fetch with the access token from the URL hash — the Supabase SDK's
                // updateUser/auth endpoints hang on this project, so we bypass them entirely.
                const token = recoveryAccessToken;
                if (!token) throw new Error('Recovery session expired. Please request a new reset email.');
                const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ password: newResetPassword })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.msg || data.error_description || data.error || 'Failed to update password.');
                setResetPasswordSuccess(true);
                setTimeout(() => {
                  setShowResetPasswordModal(false);
                  setNewResetPassword('');
                  setResetPasswordSuccess(false);
                  window.location.href = window.location.origin;
                }, 2000);
              } catch (err) {
                setResetPasswordError(err.message || 'Failed to update password.');
              } finally {
                setResetPasswordLoading(false);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af' }}>New Password</label>
                <input
                  type="password"
                  placeholder="Min 6 characters"
                  value={newResetPassword}
                  onChange={e => setNewResetPassword(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none'
                  }}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={resetPasswordLoading}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
                  border: 'none', borderRadius: '8px', padding: '12px', fontSize: '0.85rem',
                  fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s',
                  opacity: resetPasswordLoading ? 0.6 : 1
                }}
              >
                {resetPasswordLoading ? 'Saving...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  // Recovery sign-in is active, so a plain close would drop the user
                  // into the dashboard/wizard. Sign out and return to the login screen
                  // for a clean exit back to sign in / coach sign up.
                  setShowResetPasswordModal(false);
                  setNewResetPassword('');
                  setResetPasswordError('');
                  try { await databaseService.signOut(); } catch (e) { /* */ }
                  localStorage.clear();
                  window.location.href = window.location.origin;
                }}
                style={{
                  background: 'none', border: 'none', color: '#9ca3af',
                  fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', alignSelf: 'center'
                }}
              >
                Cancel & back to login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  };

  const isAdmin = isSuperAdmin(userEmail) || userRole === 'super-admin' || userRole === 'admin';
  const isCoach = isTrainer(userEmail) || userRole === 'coach';

  // A password-recovery link both opens the reset form AND establishes a session,
  // so without this guard the session routing (onboarding wizard / dashboard) wins
  // and the user never sees the reset form. Intercept it at the top level so the
  // reset form always takes precedence, regardless of the account's role/onboarding.
  if (showResetPasswordModal) {
    return (
      <div className="app-container">
        {renderResetPasswordModal()}
      </div>
    );
  }

  // Show onboarding wizard for new clients (before the main dashboard)
  if (showClientWizard && !isAdmin && !isCoach) {
    return (
      <div className="app-container">
        <ClientOnboardingWizard
          onComplete={() => {
            setShowClientWizard(false);
            localStorage.setItem('onboardingCompleted', 'true');
          }}
          onBackToLogin={handleLogout}
        />
      </div>
    );
  }

  if (isAdmin || isCoach) {
    return (
      <div className="app-container">
        <TrainerDashboard
          handleLogout={handleLogout}
          onReplayDemoTour={isAdmin ? undefined : () => coachTour.restart()}
        />
        {renderResetPasswordModal()}
        {!isAdmin && <CoachTourOverlay />}
      </div>
    );
  }

  return (
    <div className="app-container">
      <SmartNudges />
      <TourOverlay />

      <main className="main-content">
        {renderContent()}
      </main>
      
      {isNavVisible && (
        <nav className="bottom-nav">
          <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </span>
            <span>Home</span>
          </button>
          <button data-tour="nav-workout" className={`nav-item ${activeTab === 'workouts' ? 'active' : ''}`} onClick={() => setActiveTab('workouts')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
                <path d="m2.5 21.5 1.4-1.4" />
                <path d="m20.1 3.9 1.4-1.4" />
                <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
                <path d="m9.6 14.4 4.8-4.8" />
              </svg>
            </span>
            <span>Workout</span>
          </button>
          <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
            </span>
            <span>Profile</span>
          </button>
        </nav>
      )}
      {renderResetPasswordModal()}
    </div>
  );
}

export default App;
