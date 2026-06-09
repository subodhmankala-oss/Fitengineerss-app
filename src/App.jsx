import { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
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
import databaseService, { isSupabaseConfigured, supabase } from './services/databaseService';
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

const trackerKeys = [
  'waterGlasses', 'userSyncedSteps', 'userLoggedCalories', 
  'userLoggedProtein', 'userLoggedCarbs', 'userLoggedFats',
  'homeMealBreakfast', 'homeMealLunch', 'homeMealDinner', 'homeMealSnacks',
  'walkLunchDinner', 'strollsLogged', 'monthlyProgressHistory'
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
        localStorage.removeItem(key);
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
    
    // Progress Dashboard Zero-Baseline
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
    localStorage.setItem('monthlyProgressHistory', JSON.stringify(freshHistory));
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

    // Register with backend Vercel API
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: userName || 'Warrior',
        subscription: subscription
      })
    });
    console.log('Registered with Vercel Web Push backend for lock-screen nudges.');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};

function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('onboardingComplete') === 'true');
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'home');
  const [userGoal, setUserGoal] = useState(() => localStorage.getItem('userGoal') || '');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') || '');

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const processSessionUser = async (user) => {
      try {
        const email = user.email;
        const googleName = user.user_metadata?.full_name || user.user_metadata?.name;

        const profile = await databaseService.getUserProfileByEmail(email);
        
        const hasCompleteProfile = profile && 
                                   profile.userName && 
                                   profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN' && profile.userAge !== '' &&
                                   profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN' && profile.userHeight !== '' &&
                                   profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN' && profile.userWeight !== '';

        if (hasCompleteProfile) {
          // If the profile has a placeholder name, update it with their real Google name
          let finalName = profile.userName;
          if (googleName && (profile.userName.toLowerCase().includes('test') || profile.userName === 'Warrior' || profile.userName === '')) {
            finalName = googleName;
            profile.userName = googleName;
            // Sync update back to DB
            databaseService.saveUserProfile({
              email,
              userName: finalName,
              userAge: profile.userAge,
              userHeight: profile.userHeight,
              userWeight: profile.userWeight,
              userActivity: profile.userActivity,
              userGoal: profile.userGoal,
              userDiet: profile.userDiet,
              userCalorieTarget: profile.userCalorieTarget,
              userProteinTarget: profile.userProteinTarget,
              userFatsTarget: profile.userFatsTarget
            });
          }
          
          const alreadyOnboarded = localStorage.getItem('onboardingComplete') === 'true';
          
          await databaseService.loadProfileIntoLocalStorage(profile, email);
          localStorage.setItem('userName', finalName);
          setUserGoal(profile.userGoal);
          setUserEmail(email);
          
          if (alreadyOnboarded) {
            setOnboardingComplete(true);
          } else {
            localStorage.setItem('onboardingComplete', 'false');
            setOnboardingComplete(false);
          }
        } else {
          // Incomplete profile! Direct to onboarding Step 2 by setting email and name
          localStorage.setItem('userEmail', email);
          const nameToUse = (profile && profile.userName && !profile.userName.toLowerCase().includes('test')) 
            ? profile.userName 
            : (googleName || '');
          
          if (nameToUse) {
            localStorage.setItem('userName', nameToUse);
          } else {
            localStorage.removeItem('userName');
          }

          // Cache any existing database values to prefill onboarding
          if (profile) {
            if (profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN') localStorage.setItem('userAge', profile.userAge);
            if (profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN') localStorage.setItem('userHeight', profile.userHeight);
            if (profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN') localStorage.setItem('userWeight', profile.userWeight);
            if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
            if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
            if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
          }
          setUserEmail(email);
          setOnboardingComplete(false);
        }
      } catch (err) {
        console.error("Error processing session user:", err);
        setOnboardingComplete(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        await processSessionUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        localStorage.clear();
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
      const lastSavedDate = localStorage.getItem('lastSavedDate');
      const todayStr = new Date().toDateString();
      if (lastSavedDate && lastSavedDate !== todayStr) {
        archiveYesterdayStats(lastSavedDate);
        resetDailyLogs();
      }
      localStorage.setItem('lastSavedDate', todayStr);
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
        let body = "Screen locked. Step away, stay active, and keep winning your day!";
        if (glassesLeft > 0) {
          body = `🔒 Screen locked. Remember to keep hydrated: ${glassesLeft} glasses remaining today! 💧`;
        }
        showBackgroundNotification("🔒 Focus Mode Active", body);
      } else if (document.visibilityState === 'visible') {
        // Screen unlocked or tab focused
        lastEventTime = now;
        let body = "Do a quick posture check! Stand up, stretch, and grab some water.";
        if (glassesLeft > 0) {
          body = `🔓 Welcome back! Quick posture check + take a sip. Need ${glassesLeft} more glasses of water today! 💧`;
        }
        showBackgroundNotification("🔓 Welcome Back!", body);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [onboardingComplete, notificationPermission]);

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
              'userEmail'
            ];
            const tempStorage = {};
            keysToKeep.forEach(k => {
              tempStorage[k] = localStorage.getItem(k);
            });
            localStorage.clear();
            Object.keys(tempStorage).forEach(k => {
              if (tempStorage[k] !== null) localStorage.setItem(k, tempStorage[k]);
            });

            // Load this new client's isolated database/cache (initializes fresh zero baseline if new)
            loadActiveUserCache(newName);

            // Sync User Profile and initial fresh history to Supabase Cloud Database!
            const freshHistory = JSON.parse(localStorage.getItem('monthlyProgressHistory'));
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
              userIssue: tempStorage['userIssue']
            };
            databaseService.saveUserProfile(profile);
            databaseService.saveProgressHistory(freshHistory);

            // Set lastSavedDate to today to prime rollover checks correctly
            const todayStr = new Date().toDateString();
            localStorage.setItem('lastSavedDate', todayStr);
          } else {
            // Same user logged back in! Check if date changed
            const lastSavedDate = localStorage.getItem('lastSavedDate');
            const todayStr = new Date().toDateString();
            if (lastSavedDate && lastSavedDate !== todayStr) {
              archiveYesterdayStats(lastSavedDate);
              resetDailyLogs();
            }
            localStorage.setItem('lastSavedDate', todayStr);
          }

          localStorage.setItem('onboardingComplete', 'true');
          const goal = localStorage.getItem('userGoal');
          if (goal) setUserGoal(goal);
          setOnboardingComplete(true);
        }} />
      </div>
    );
  }

  const handleLogout = () => {
    // Sign out from Supabase Auth if active
    databaseService.signOut().catch(err => console.error("Sign out error:", err));

    // Preserve name to check if next user is same or different
    const name = localStorage.getItem('userName');
    if (name) {
      saveActiveUserCache(name);
      localStorage.setItem('lastUserName', name);
    }

    localStorage.removeItem('onboardingComplete');
    localStorage.removeItem('userGoal');
    localStorage.removeItem('userIssue');
    
    // Invalidate PWA cache and old service workers to force reload the fresh code
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
    }

    setOnboardingComplete(false);
    setUserGoal('');
    setUserEmail('');
    setActiveTab('home');

    // Perform hard reload after 150ms
    setTimeout(() => {
      window.location.reload();
    }, 150);
  };

  const renderHomeDashboard = () => {
    switch (userGoal) {
      case 'Fat Loss':
        return <FatLossDashboard setActiveTab={setActiveTab} handleLogout={handleLogout} />;
      case 'Muscle Building':
        return <MuscleDashboard setActiveTab={setActiveTab} handleLogout={handleLogout} />;
      case 'Gut Fix':
      default:
        return <HomeTracker setActiveTab={setActiveTab} handleLogout={handleLogout} />;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return renderHomeDashboard();
      case 'mealCheck': return <MealCheck setActiveTab={setActiveTab} />;
      case 'bloating': return <BloatingTracker setActiveTab={setActiveTab} />;
      case 'mealPlan': return <SmartMealPlans />;
      case 'nutrition': return <NutritionTracker setActiveTab={setActiveTab} />;
      case 'workouts': return <WorkoutTracker />;
      case 'progress': return <ProgressDashboard />;
      case 'chat': return <CoachChat />;
      default: return renderHomeDashboard();
    }
  };

  const isNavVisible = true;


  return (
    <div className="app-container">
      <SmartNudges />
      
      <main className="main-content">
        {renderContent()}
      </main>
      
      {isNavVisible && (
        <nav className="bottom-nav">
          <button className={`nav-item ${['home', 'nutrition', 'mealCheck', 'bloating'].includes(activeTab) ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </span>
            <span>Home</span>
          </button>
          <button className={`nav-item ${activeTab === 'mealPlan' ? 'active' : ''}`} onClick={() => setActiveTab('mealPlan')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.528V3a1 1 0 0 1 1-1h0" />
                <path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21" />
              </svg>
            </span>
            <span>Nutrition</span>
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
          <button className={`nav-item ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
                <line x1="3" y1="20" x2="21" y2="20"/>
              </svg>
            </span>
            <span>Progress</span>
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
    </div>
  );
}

export default App;
