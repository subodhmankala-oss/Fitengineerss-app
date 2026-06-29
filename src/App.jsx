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
import CoachChat from './components/CoachChat';
import SmartNudges from './components/SmartNudges';
import NutritionTracker from './components/NutritionTracker';
import WorkoutTracker from './components/WorkoutTracker';
import TrainerDashboard from './components/TrainerDashboard';
import AdminDashboard from './components/AdminDashboard';
import WorkoutProgressDashboard from './components/WorkoutProgressDashboard';
import databaseService, { isSupabaseConfigured, supabase, isTrainer, TRAINER_EMAILS } from './services/databaseService';
import ResetPasswordPage from './components/ResetPasswordPage';
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

const registerForPushNotifications = async (userName) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Generated VAPID Public Key
      const vapidPublicKey = 'BIupVfv6kg0G6uCsUWYciNynMR5xs6F3dl3QWXjRWGFkfZzvBPClM_FSLCEInVTDF0wtMkk5sDfbmWH1b2RMuqk';
      
      const convertVapidKey = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const convertedKey = convertVapidKey(vapidPublicKey);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
    }

    // Convert subscription to JSON and attach user's real email
    const subJson = typeof subscription.toJSON === 'function'
      ? subscription.toJSON()
      : JSON.parse(JSON.stringify(subscription));
    subJson.userEmail = localStorage.getItem('userEmail') || '';

    // Register with backend Vercel API
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: userName || 'Warrior',
        subscription: subJson
      })
    });
    console.log('Registered with Vercel Web Push backend for lock-screen nudges.');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};

function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('onboardingComplete') === 'true');
  const [showClientWizard, setShowClientWizard] = useState(() => {
    // Show wizard if client has logged in before but hasn't completed onboarding
    return localStorage.getItem('onboardingComplete') === 'true' &&
           localStorage.getItem('onboardingCompleted') === 'false' &&
           (localStorage.getItem('userRole') === 'client' || !localStorage.getItem('userRole'));
  });
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'home');
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

  // Password Reset Modal States
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);

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

        const profile = await databaseService.getUserProfileByEmail(email);
        console.log("Login successful. Role found: " + (profile?.role || 'none'));
        const isSuperAdminEmail = email.toLowerCase() === 'subodhmankala@gmail.com';

        // Coach access suspended by the super admin (malpractice block).
        // Enforced centrally so it applies on every login/refresh, not just the
        // coach login form. Super admin can never block themselves out.
        if (profile && profile.role === 'coach' && profile.coachIsBlocked === true && !isSuperAdminEmail) {
          localStorage.removeItem('pendingCoachLogin');
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
        const pendingCoachLogin = localStorage.getItem('pendingCoachLogin') === 'true';
        const isApprovedCoach =
          TRAINER_EMAILS.includes(email.toLowerCase()) ||
          resolvedRole === 'coach' ||
          resolvedRole === 'super-admin' ||
          resolvedRole === 'admin';

        if (pendingCoachLogin) {
          localStorage.removeItem('pendingCoachLogin');
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

  // ── Global Push Notifications Background Service ──
  useEffect(() => {
    if (!('Notification' in window) || notificationPermission !== 'granted') return;

    const checkSchedule = () => {
      checkAndHandleDateRollover();
      const now = new Date();
      const hours = now.getHours();
      const dateStr = now.toDateString();

      const morningQuotes = [
        "Rise and conquer! Your health is an investment, not an expense. Make today's choices count! ☀️",
        "Good morning! Great bodies are built on consistency, not convenience. Lock in your habits early today! 🍳",
        "Wake up! The difference between who you are and who you want to be is what you do today. Let's execute! 💪",
        "Rise and grind! Prioritize your wellness today. A hydrated body is a high-performing engine! 💧",
        "Good morning, champion! A fresh start to win your day. Remember: food is fuel, and movement is medicine! 🍏",
        "Wake up with intent! Your energy today determines your trajectory tomorrow. Let's get moving! 🏃‍♂️",
        "Morning! Start your day by checking off your hydration. Fuel your mind and body for peak performance! 🌊",
        "Happy morning! Do not let yesterday's slip-ups ruin today's progress. Show up and be awesome! ✨",
        "Rise up! The best project you will ever work on is YOU. Treat yourself with care and respect today. 🙌",
        "Good morning! Focus on control: your food, your movements, your thoughts. Let's make today exceptional! 🏆"
      ];

      // Calculate dynamic targets & leftovers for active notifications
      const calorieTarget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
      const userWeight = parseFloat(localStorage.getItem('userWeight') || '70');
      const userProteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '100');
      const steps = parseInt(localStorage.getItem('userSyncedSteps') || '0');

      const baseCalorieGlasses = calorieTarget / 250;
      const baseWeightGlasses = (userWeight * 35) / 250;
      const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
      const stepBooster = Math.floor(steps / 3000);
      const proteinBooster = userProteinTarget > 100 ? 1 : 0;
      const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);

      const waterGlasses = parseInt(localStorage.getItem('waterGlasses') || '0');
      const glassesLeft = Math.max(0, recommendedWaterTarget - waterGlasses);

      const eatenCals = parseInt(localStorage.getItem('userLoggedCalories') || '0');
      let loggedProt = parseInt(localStorage.getItem('userLoggedProtein') || '0');
      if (loggedProt === 0 && eatenCals > 0) {
        loggedProt = Math.round(userProteinTarget * (eatenCals / calorieTarget));
      }
      const proteinLeft = Math.max(0, userProteinTarget - loggedProt);

      const showBackgroundNotification = (title, body) => {
        const options = {
          body,
          icon: '/logo.png',
          badge: '/logo.png',
          vibrate: [200, 100, 200],
          tag: 'fitengineers-coach-nudge',
          renotify: true,
          requireInteraction: true,
          silent: false
        };

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, options);
          }).catch(() => {
            try {
              new Notification(title, options);
            } catch (err) {
              console.error("Native notification fallback failed:", err);
            }
          });
        } else {
          try {
            new Notification(title, options);
          } catch (e) {
            console.error("Browser notification failed: ", e);
          }
        }
      };

      // Only dispatch hourly check-ins between 8 AM and 10 PM (active waking hours)
      if (hours >= 8 && hours <= 22) {
        const hourlyStorageKey = `last_hourly_fired_${hours}_${dateStr}`;
        const hasFiredThisHourToday = localStorage.getItem(hourlyStorageKey) === 'true';

        if (!hasFiredThisHourToday) {
          let title = "Fitengineers Coach 🥗";
          let body = "";

          if (hours === 8) {
            // Morning Motivation
            const idx = now.getDate() + now.getMonth() * 31;
            title = "Good Morning! ☀️";
            body = morningQuotes[idx % morningQuotes.length];
          } else if (hours === 13) {
            // Post-Lunch Walk
            title = "🍱 Post-Lunch Metabolic Check";
            body = "Optimize your insulin response and digestion by taking a quick 10-minute stroll post-meal. Movement is medicine!";
          } else if (hours === 20) {
            // Post-Dinner Walk
            title = "🚶‍♂️ Post-Dinner Digestion Check";
            body = "Support healthy metabolic clearance and gut motility with a gentle 10-minute post-dinner walk before you wind down.";
          } else if (hours === 22) {
            // Bedtime Appreciation
            title = "🌙 Sleep Well & Recover";
            body = "Regardless of today's tracking completion, acknowledge your efforts. Fitness is a lifetime journey. Rest deeply tonight, recover, and we will execute tomorrow with renewed strength. You got this.";
          } else {
            // General active hours: Cycle between Hydration, Protein, and Screen time
            const cycleIndex = hours % 3;
            if (cycleIndex === 0) {
              // Hydration Check
              title = "💧 Fluid Intake Status";
              if (glassesLeft > 0) {
                body = `You currently have ${glassesLeft} glasses remaining to hit your daily target of ${recommendedWaterTarget} glasses today. Keep sip-syncing!`;
              } else {
                body = `Outstanding consistency! You have fully satisfied your daily target of ${recommendedWaterTarget} glasses. Stay hydrated!`;
              }
            } else if (cycleIndex === 1) {
              // Protein Check
              title = "🥩 Protein Intake Check";
              if (proteinLeft > 0) {
                body = `You currently need ${proteinLeft}g of protein to satisfy your daily target of ${userProteinTarget}g. Prioritize a clean protein source in your next meal!`;
              } else {
                body = `Excellent macro precision! Your daily target of ${userProteinTarget}g protein is fully satisfied to support complete recovery.`;
              }
            } else {
              // Screen Time scrolling nudge
              title = "📈 High-Performance Focus";
              body = "Put the phone down, step away from passive scrolling, and redirect your focus toward meaningful, productive work. Elevate your discipline today!";
            }
          }

          if (body) {
            showBackgroundNotification(title, body);
            localStorage.setItem(hourlyStorageKey, 'true');
            localStorage.setItem('last_fired_hour', String(hours));
          }
        }
      }
    };

    // Delay the initial check-in by 30 seconds on startup to prevent immediate notification pops upon opening the app.
    const startupTimeout = setTimeout(checkSchedule, 30000);
    const interval = setInterval(checkSchedule, 60000); // Check every minute
    return () => {
      clearTimeout(startupTimeout);
      clearInterval(interval);
    };
  }, [onboardingComplete, notificationPermission]);

  // ── Lock / Unlock Push Notifications (Visibility API) ──
  useEffect(() => {
    if (!onboardingComplete) return;
    if (!('Notification' in window) || notificationPermission !== 'granted') return;

    let lastEventTime = 0;

    const handleVisibilityChange = () => {
      checkAndHandleDateRollover();
      const now = Date.now();
      // Throttle notifications to prevent double firing or spam (minimum 15 seconds between notifications)
      if (now - lastEventTime < 15000) return;

      const calorieTarget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
      const userWeight = parseFloat(localStorage.getItem('userWeight') || '70');
      const userProteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '100');
      const steps = parseInt(localStorage.getItem('userSyncedSteps') || '0');

      const baseCalorieGlasses = calorieTarget / 250;
      const baseWeightGlasses = (userWeight * 35) / 250;
      const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
      const stepBooster = Math.floor(steps / 3000);
      const proteinBooster = userProteinTarget > 100 ? 1 : 0;
      const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);

      const waterGlasses = parseInt(localStorage.getItem('waterGlasses') || '0');
      const glassesLeft = Math.max(0, recommendedWaterTarget - waterGlasses);

      const showBackgroundNotification = (title, body) => {
        const options = {
          body,
          icon: '/logo.png',
          badge: '/logo.png',
          vibrate: [200, 100, 200],
          tag: 'fitengineers-coach-nudge',
          renotify: true,
          requireInteraction: true,
          silent: false
        };

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, options);
          }).catch(() => {
            try {
              new Notification(title, options);
            } catch (err) {
              console.error("Native notification fallback failed:", err);
            }
          });
        } else {
          try {
            new Notification(title, options);
          } catch (e) {
            console.error("Browser notification failed: ", e);
          }
        }
      };

      if (document.visibilityState === 'hidden') {
        // Screen locked or tab closed
        lastEventTime = now;
        let title = "🚶 Posture Check";
        let body = "Step away, stay active, and keep winning your day!";
        if (glassesLeft > 0) {
          title = "💧 Fluid Intake Status";
          body = `Remember to keep hydrated: ${glassesLeft} glasses remaining today! 💧`;
        }
        showBackgroundNotification(title, body);
      } else if (document.visibilityState === 'visible') {
        // Screen unlocked or tab focused
        lastEventTime = now;
        let title = "🚶 Posture Check";
        let body = "Do a quick posture check! Stand up, stretch, and grab some water.";
        if (glassesLeft > 0) {
          title = "💧 Fluid Intake Status";
          body = `Quick posture check + take a sip. Need ${glassesLeft} more glasses of water today! 💧`;
        }
        showBackgroundNotification(title, body);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [onboardingComplete, notificationPermission]);

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
              'onboardingComplete', 'userName', 'userAge', 'userHeight', 'userWeight', 
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
          // Show wizard if this client has not yet completed 4-step onboarding
          const completedWizard = localStorage.getItem('onboardingCompleted');
          const role = localStorage.getItem('userRole') || 'client';
          if (completedWizard !== 'true' && (role === 'client' || !role)) {
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
    return <WorkoutProgressDashboard handleLogout={handleLogout} />;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return renderHomeDashboard();
      case 'workouts': return <WorkoutTracker />;
      case 'chat': return <CoachChat />;
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
                await databaseService.updatePassword(newResetPassword);
                setResetPasswordSuccess(true);
                setTimeout(() => {
                  setShowResetPasswordModal(false);
                  setNewResetPassword('');
                  setResetPasswordSuccess(false);
                  window.location.reload();
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
        />
      </div>
    );
  }

  if (isAdmin || isCoach) {
    return (
      <div className="app-container">
        <TrainerDashboard handleLogout={handleLogout} />
        {renderResetPasswordModal()}
      </div>
    );
  }

  return (
    <div className="app-container">
      <SmartNudges />
      
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
          <button className={`nav-item ${activeTab === 'workouts' ? 'active' : ''}`} onClick={() => setActiveTab('workouts')}>
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
          <button className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </span>
            <span>Coach</span>
          </button>
        </nav>
      )}
      {renderResetPasswordModal()}
    </div>
  );
}

export default App;
