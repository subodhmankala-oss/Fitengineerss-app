import React, { useState, useEffect } from 'react';
import MealScanner from './MealScanner';
import './FatLossDashboard.css';

const FatLossDashboard = ({ setActiveTab, handleLogout }) => {
  const [userName, setUserName] = useState('Warrior');
  const [calorieBudget, setCalorieBudget] = useState(1300);
  const [showScanner, setShowScanner] = useState(false);
  const [score, setScore] = useState(4);
  const [checks, setChecks] = useState({
    protein: true,
    steps: false,
    noLiquidCalories: false
  });

  // HealthifyMe Logging States
  const [meals, setMeals] = useState({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snacks: 0
  });

  const [steps, setSteps] = useState(0);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  // Custom onboarding attributes for dynamic water calculations
  const [userWeight, setUserWeight] = useState(70);
  const [userProteinTarget, setUserProteinTarget] = useState(100);
  const [userCarbsTarget, setUserCarbsTarget] = useState(180);
  const [userFatsTarget, setUserFatsTarget] = useState(60);
  const [loggedMacros, setLoggedMacros] = useState({
    protein: 0,
    carbs: 0,
    fats: 0
  });

  // Wearable tracking simulation states
  const [isSyncingSteps, setIsSyncingSteps] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState("Just now");
  const [isSyncingWater, setIsSyncingWater] = useState(false);
  const [waterLastSyncTime, setWaterLastSyncTime] = useState("Just now");

  // HTML5 Notification permissions in the header
  const [notificationPermission, setNotificationPermission] = useState('default');

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const handlePermissionSync = () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    };
    window.addEventListener('notificationPermissionChanged', handlePermissionSync);
    return () => window.removeEventListener('notificationPermissionChanged', handlePermissionSync);
  }, []);

  const handleNotificationToggle = async () => {
    const currentlyActive = localStorage.getItem('coachAlertsEnabled') === 'true' || (notificationPermission === 'granted' && localStorage.getItem('coachAlertsEnabled') !== 'false');

    if (currentlyActive) {
      localStorage.setItem('coachAlertsEnabled', 'false');
      window.dispatchEvent(new Event('notificationPermissionChanged'));
      setToastMessage("🔕 Coaching alerts are now inactive.");
      setTimeout(() => setToastMessage(''), 3500);
    } else {
      localStorage.setItem('coachAlertsEnabled', 'true');
      window.dispatchEvent(new Event('notificationPermissionChanged'));

      if (!('Notification' in window)) {
        setToastMessage("🔔 Coaching alerts enabled!");
        setTimeout(() => setToastMessage(''), 3500);
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      window.dispatchEvent(new Event('notificationPermissionChanged'));

      if (permission === 'granted') {
        const options = {
          body: "Coach Subodh will now push daily morning, afternoon, and night motivation to your screen!",
          icon: '/logo.png',
          badge: '/logo.png',
          vibrate: [200, 100, 200],
          tag: 'fitengineers-coach-welcome',
          renotify: true,
          requireInteraction: true,
          silent: false
        };

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification("Notifications Active! 🎯", options);
          }).catch(() => {
            try {
              new Notification("Notifications Active! 🎯", options);
            } catch (err) {
              console.error("Native notification failed:", err);
            }
          });
        } else {
          try {
            new Notification("Notifications Active! 🎯", options);
          } catch (e) {
            console.error("Browser notification failed: ", e);
          }
        }
        setToastMessage("🔔 Coaching alerts enabled successfully!");
        setTimeout(() => setToastMessage(''), 3500);
      } else {
        setToastMessage("🔔 Coaching alerts enabled! (Desktop notifications blocked by browser)");
        setTimeout(() => setToastMessage(''), 3500);
      }
    }
  };


  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) setUserName(storedName);

    const storedBudget = localStorage.getItem('userCalorieTarget');
    if (storedBudget) setCalorieBudget(parseInt(storedBudget));

    // Restore saved meal breakdown from localStorage (or use defaults)
    const savedBreakfast = localStorage.getItem('homeMealBreakfast');
    const savedLunch     = localStorage.getItem('homeMealLunch');
    const savedDinner    = localStorage.getItem('homeMealDinner');
    const savedSnacks    = localStorage.getItem('homeMealSnacks');

    const effectiveMeals = {
      breakfast: savedBreakfast !== null ? parseInt(savedBreakfast) : 0,
      lunch:     savedLunch     !== null ? parseInt(savedLunch)     : 0,
      dinner:    savedDinner    !== null ? parseInt(savedDinner)    : 0,
      snacks:    savedSnacks    !== null ? parseInt(savedSnacks)    : 0,
    };
    setMeals(effectiveMeals);

    // Always write to localStorage so other pages read correct eaten calories
    localStorage.setItem('homeMealBreakfast', effectiveMeals.breakfast.toString());
    localStorage.setItem('homeMealLunch',     effectiveMeals.lunch.toString());
    localStorage.setItem('homeMealDinner',    effectiveMeals.dinner.toString());
    localStorage.setItem('homeMealSnacks',    effectiveMeals.snacks.toString());
    const initTotal = effectiveMeals.breakfast + effectiveMeals.lunch + effectiveMeals.dinner + effectiveMeals.snacks;
    localStorage.setItem('userLoggedCalories', initTotal.toString());
    window.dispatchEvent(new Event('nutritionUpdated'));

    const loadMeals = () => {
      const savedBfast = localStorage.getItem('homeMealBreakfast');
      const savedLch   = localStorage.getItem('homeMealLunch');
      const savedDnr   = localStorage.getItem('homeMealDinner');
      const savedSnk   = localStorage.getItem('homeMealSnacks');
      setMeals({
        breakfast: savedBfast !== null ? parseInt(savedBfast) : 0,
        lunch:     savedLch     !== null ? parseInt(savedLch)     : 0,
        dinner:    savedDnr    !== null ? parseInt(savedDnr)    : 0,
        snacks:    savedSnk    !== null ? parseInt(savedSnk)    : 0,
      });

      const loggedProtein = parseInt(localStorage.getItem('userLoggedProtein') || '0');
      const loggedCarbs   = parseInt(localStorage.getItem('userLoggedCarbs') || '0');
      const loggedFats    = parseInt(localStorage.getItem('userLoggedFats') || '0');
      setLoggedMacros({
        protein: loggedProtein,
        carbs: loggedCarbs,
        fats: loggedFats
      });

      // Sync targets dynamically
      const storedProtein = localStorage.getItem('userProteinTarget');
      if (storedProtein) setUserProteinTarget(parseInt(storedProtein));

      const storedCarbs = localStorage.getItem('userCarbsTarget');
      if (storedCarbs) setUserCarbsTarget(parseInt(storedCarbs));

      const storedFats = localStorage.getItem('userFatsTarget');
      if (storedFats) setUserFatsTarget(parseInt(storedFats));
    };

    const loadWater = () => {
      const storedWater = localStorage.getItem('waterGlasses');
      if (storedWater) {
        setWaterGlasses(parseInt(storedWater));
      } else {
        setWaterGlasses(0);
      }
    };

    const loadSteps = () => {
      const storedSteps = localStorage.getItem('userSyncedSteps');
      if (storedSteps) {
        setSteps(parseInt(storedSteps));
      } else {
        setSteps(0);
      }
    };

    loadWater();
    loadSteps();
    loadMeals(); // Populates macros on startup

    // Hydrate weight and protein target
    const storedWeight = localStorage.getItem('userWeight');
    if (storedWeight) setUserWeight(parseFloat(storedWeight));

    const storedProtein = localStorage.getItem('userProteinTarget');
    if (storedProtein) setUserProteinTarget(parseInt(storedProtein));

    const storedCarbs = localStorage.getItem('userCarbsTarget');
    if (storedCarbs) setUserCarbsTarget(parseInt(storedCarbs));

    const storedFats = localStorage.getItem('userFatsTarget');
    if (storedFats) setUserFatsTarget(parseInt(storedFats));

    window.addEventListener('waterUpdated', loadWater);
    window.addEventListener('stepsUpdated', loadSteps);
    window.addEventListener('nutritionUpdated', loadMeals);

    return () => {
      window.removeEventListener('waterUpdated', loadWater);
      window.removeEventListener('stepsUpdated', loadSteps);
      window.removeEventListener('nutritionUpdated', loadMeals);
    };
  }, []);

  // Dynamic water calculation logic:
  // 1. Calorie Budget base (1 glass per 250 kcal targeted/eaten)
  const baseCalorieGlasses = calorieBudget / 250;
  // 2. Body weight baseline (standard baseline is ~35ml per kg of weight -> weight * 35 / 250 glasses)
  const baseWeightGlasses = (userWeight * 35) / 250;
  // Baseline targets average
  const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
  
  // 3. Step/Activity adjustment: +1 glass for every 3,000 active steps walked (physical behavior)
  const stepBooster = Math.floor(steps / 3000);
  
  // 4. Macro adjustment: High protein (>100g) requires extra hydration booster (+1 for >100g, +2 for >150g)
  const proteinBooster = userProteinTarget > 150 ? 2 : (userProteinTarget > 100 ? 1 : 0);

  const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);
  const waterSafetyLimit = recommendedWaterTarget + 4;

  const toggleCheck = (key) => {
    setChecks(prev => {
      const newChecks = { ...prev, [key]: !prev[key] };
      const newScore = Object.values(newChecks).filter(Boolean).length * 2; 
      setScore(newScore);
      return newChecks;
    });
  };

  // HealthifyMe Core Layout Metrics
  const caloriesEaten = meals.breakfast + meals.lunch + meals.dinner + meals.snacks;
  // Steps calorie burning estimation (approx 0.04 kcal per step)
  const caloriesBurned = Math.round(steps * 0.04);
  const netCalories = caloriesEaten - caloriesBurned;
  const remainingCalories = calorieBudget - netCalories;

  const handleMealIncrement = (mealKey, amount) => {
    setMeals(prev => {
      const next = {
        ...prev,
        [mealKey]: Math.max(0, prev[mealKey] + amount)
      };
      localStorage.setItem('homeMealBreakfast', next.breakfast.toString());
      localStorage.setItem('homeMealLunch',     next.lunch.toString());
      localStorage.setItem('homeMealDinner',    next.dinner.toString());
      localStorage.setItem('homeMealSnacks',    next.snacks.toString());
      const totalEaten = next.breakfast + next.lunch + next.dinner + next.snacks;
      localStorage.setItem('userLoggedCalories', totalEaten.toString());
      window.dispatchEvent(new Event('nutritionUpdated'));
      return next;
    });
  };

  const syncStepsFromWearable = () => {
    if (isSyncingSteps) return;
    setIsSyncingSteps(true);
    
    // Simulate smart watch / phone data retrieval
    setTimeout(() => {
      const simulatedNewSteps = Math.floor(Math.random() * 600) + 200; // 200 - 800 steps
      setSteps(prev => {
        const nextSteps = prev + simulatedNewSteps;
        localStorage.setItem('userSyncedSteps', nextSteps.toString());
        setTimeout(() => window.dispatchEvent(new Event('stepsUpdated')), 0);
        return nextSteps;
      });
      setIsSyncingSteps(false);
      
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      
      setToastMessage(`⚡ Smart Sync: Synced +${simulatedNewSteps} steps from watch.`);
      setTimeout(() => setToastMessage(''), 3000);
    }, 1200);
  };

  const logQuickGlass = () => {
    if (waterGlasses >= recommendedWaterTarget) {
      setToastMessage(`🎯 Goal Met! You have already hit your daily hydration target.`);
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }
    const nextGlasses = waterGlasses + 1;
    setWaterGlasses(nextGlasses);
    localStorage.setItem('waterGlasses', nextGlasses.toString());
    window.dispatchEvent(new Event('waterUpdated'));
    
    if (nextGlasses === recommendedWaterTarget) {
      setToastMessage(`🎯 Perfect! You've hit your daily hydration target of ${recommendedWaterTarget} glasses! 💧`);
    } else {
      setToastMessage("Great job taking that sip! Every drop counts! 💧");
    }
    setTimeout(() => setToastMessage(''), 3500);
  };

  const syncWaterFromSmartBottle = () => {
    if (isSyncingWater) return;
    setIsSyncingWater(true);
    
    // Simulate smart bottle sips sync handshake
    setTimeout(() => {
      const simulatedSips = Math.floor(Math.random() * 2) + 1; // +1 or +2 glasses
      setWaterGlasses(prev => {
        const nextGlasses = Math.min(prev + simulatedSips, recommendedWaterTarget);
        localStorage.setItem('waterGlasses', nextGlasses.toString());
        setTimeout(() => window.dispatchEvent(new Event('waterUpdated')), 0);
        return nextGlasses;
      });
      setIsSyncingWater(false);
      
      const now = new Date();
      setWaterLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      
      setToastMessage(`⚡ Smart Sync: Synced +${simulatedSips} sips from smart bottle.`);
      setTimeout(() => setToastMessage(''), 3000);
    }, 1200);
  };

  const completedChecklistItems = (checks.protein ? 1 : 0) + (checks.steps ? 1 : 0) + (checks.noLiquidCalories ? 1 : 0);
  const completionPercentage = Math.round((completedChecklistItems / 3) * 100);

  const circumference = 2 * Math.PI * 40;
  const progressRatio = Math.min(Math.max(caloriesEaten / calorieBudget, 0), 1);
  const strokeDashoffset = circumference - progressRatio * circumference;

  const isAlertActive = localStorage.getItem('coachAlertsEnabled') === 'true' || (notificationPermission === 'granted' && localStorage.getItem('coachAlertsEnabled') !== 'false');

  return (
    <div className="fat-loss-container animate-slide-up">
      {/* 1. HealthifyMe Top Profile Bar */}
      <div className="healthify-header">
        <div className="profile-info-group">
          <div className="avatar-circle">💪</div>
          <div className="greeting-text">
            <span>Good Morning,</span>
            <h2>{userName}</h2>
          </div>
        </div>
        <div className="header-badges">
          <span className="streak-badge">🔥 5 Day Streak</span>
          <button 
            className="btn-logout" 
            onClick={handleNotificationToggle} 
            title={isAlertActive ? "Coaching Alerts Active 🟢" : "Turn On Coaching Alerts 🟡"}
            style={{
              color: isAlertActive ? '#10b981' : '#fbbf24',
              borderColor: isAlertActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(251, 191, 36, 0.35)',
              background: isAlertActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(251, 191, 36, 0.08)',
              boxShadow: isAlertActive ? '0 0 10px rgba(16, 185, 129, 0.15)' : '0 0 10px rgba(251, 191, 36, 0.15)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className="icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill={isAlertActive ? "#10b981" : "none"} 
                stroke={isAlertActive ? "#10b981" : "#fbbf24"} 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{ 
                  transition: 'all 0.2s ease', 
                  filter: isAlertActive ? 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' : 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.4))'
                }}
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
          </button>

          <button 
            className="btn-logout scanner-btn" 
            onClick={() => setShowScanner(true)} 
            title="Scan Meal & Calories"
            style={{
              color: '#10b981',
              borderColor: 'rgba(16, 185, 129, 0.3)',
              background: 'rgba(16, 185, 129, 0.08)',
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <span className="icon">📸</span>
          </button>
          <button className="btn-logout" onClick={handleLogout} title="Reset Profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v7" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="reminder-toast animate-in">
          <span>✨</span> {toastMessage}
        </div>
      )}

      {/* 2. HealthifyMe Calorie Ring Hub Widget */}
      <div className="calorie-summary-widget glass-panel">
        <div className="hub-header">
          <h3>Calorie Budget Net</h3>
          <span className="info-btn" onClick={() => setActiveTab('nutrition')}>View Macro Distribution ➔</span>
        </div>

        <div className="hub-layout">
          <div className="circular-progress-ring">
            <svg width="110" height="110" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" className="circle-bg" />
              <circle 
                cx="50" 
                cy="50" 
                r="40" 
                className="circle-fill" 
                style={{ strokeDasharray: circumference, strokeDashoffset }} 
              />
            </svg>
            <div className="ring-content">
              <span className="ring-number">{remainingCalories}</span>
              <span className="ring-label">Kcal Left</span>
            </div>
          </div>

          <div className="calorie-math-col">
            <div className="math-row">
              <div className="math-item">
                <span className="math-title">Budget</span>
                <span className="math-value text-muted-white">{calorieBudget}</span>
              </div>
              <span className="math-operator">-</span>
              <div className="math-item">
                <span className="math-title">Eaten</span>
                <span className="math-value text-emerald">{caloriesEaten}</span>
              </div>
              <span className="math-operator">+</span>
              <div className="math-item">
                <span className="math-title">Burned</span>
                <span className="math-value text-amber">{caloriesBurned}</span>
              </div>
            </div>
            
            <div className="net-status-banner mt-2">
              <span>{netCalories > calorieBudget ? "⚠️ Calorie Limit Exceeded" : "🎯 You are in caloric deficit"}</span>
            </div>
          </div>
        </div>

        {/* Remaining Macro Summary Row */}
        <div className="macro-summary-row mt-3" style={{ display: 'flex', gap: '12px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
          <div className="macro-summary-item" style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>🍗 Protein Left</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffb74d' }}>{Math.max(0, userProteinTarget - loggedMacros.protein)}g</span>
            <span style={{ display: 'block', fontSize: '0.65rem', color: '#475569' }}>of {userProteinTarget}g</span>
          </div>
          <div className="macro-summary-item" style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>🌾 Carbs Left</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#60a5fa' }}>{Math.max(0, userCarbsTarget - loggedMacros.carbs)}g</span>
            <span style={{ display: 'block', fontSize: '0.65rem', color: '#475569' }}>of {userCarbsTarget}g</span>
          </div>
          <div className="macro-summary-item" style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>🥑 Fats Left</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f87171' }}>{Math.max(0, userFatsTarget - loggedMacros.fats)}g</span>
            <span style={{ display: 'block', fontSize: '0.65rem', color: '#475569' }}>of {userFatsTarget}g</span>
          </div>
        </div>
      </div>

      {/* 3. HealthifyMe Meal Logging Category Rows */}
      <div className="tracker-section">
        <h3 className="section-label">Track Today's Meals</h3>
        
        <div className="meal-tracker-rows">
          <div className="meal-row-card glass-panel">
            <div className="meal-row-left">
              <span className="meal-avatar">🍳</span>
              <div className="meal-details-text">
                <h4>Breakfast</h4>
                <p>Target: ~350 kcal • Logged: {meals.breakfast} kcal</p>
              </div>
            </div>
            <div className="meal-row-right">
              <button className="btn-quick-adjust minus" onClick={() => handleMealIncrement('breakfast', -50)}>-</button>
              <button className="btn-quick-adjust plus" onClick={() => handleMealIncrement('breakfast', 50)}>+</button>
            </div>
          </div>

          <div className="meal-row-card glass-panel">
            <div className="meal-row-left">
              <span className="meal-avatar">🥗</span>
              <div className="meal-details-text">
                <h4>Lunch</h4>
                <p>Target: ~500 kcal • Logged: {meals.lunch} kcal</p>
              </div>
            </div>
            <div className="meal-row-right">
              <button className="btn-quick-adjust minus" onClick={() => handleMealIncrement('lunch', -50)}>-</button>
              <button className="btn-quick-adjust plus" onClick={() => handleMealIncrement('lunch', 50)}>+</button>
            </div>
          </div>

          <div className="meal-row-card glass-panel">
            <div className="meal-row-left">
              <span className="meal-avatar">🍗</span>
              <div className="meal-details-text">
                <h4>Dinner</h4>
                <p>Target: ~400 kcal • Logged: {meals.dinner} kcal</p>
              </div>
            </div>
            <div className="meal-row-right">
              <button className="btn-quick-adjust minus" onClick={() => handleMealIncrement('dinner', -50)}>-</button>
              <button className="btn-quick-adjust plus" onClick={() => handleMealIncrement('dinner', 50)}>+</button>
            </div>
          </div>

          <div className="meal-row-card glass-panel">
            <div className="meal-row-left">
              <span className="meal-avatar">🍎</span>
              <div className="meal-details-text">
                <h4>Snacks</h4>
                <p>Target: ~150 kcal • Logged: {meals.snacks} kcal</p>
              </div>
            </div>
            <div className="meal-row-right">
              <button className="btn-quick-adjust minus" onClick={() => handleMealIncrement('snacks', -50)}>-</button>
              <button className="btn-quick-adjust plus" onClick={() => handleMealIncrement('snacks', 50)}>+</button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. HealthifyMe Side-by-Side Activity Grid */}
      <div className="activity-logging-grid">
        <div className="activity-split-card glass-panel">
          <div className="activity-split-header">
            <span>👟 Steps Log</span>
            <span className="wearable-badge">⚡ Smart Sync</span>
          </div>
          <div className="activity-split-body">
            <div className="giant-stat">{steps} <span className="stat-unit">steps</span></div>
            <div className="wearable-sync-detail">
              <span>● Watch connected</span>
              <span>Last: {lastSyncTime}</span>
            </div>
            <p className="sub-detail mt-1">{caloriesBurned} kcal burned</p>
            <div className="quick-add-row mt-2">
              <button 
                className={`btn-quick-log sync-action-btn ${isSyncingSteps ? 'syncing' : ''}`}
                onClick={syncStepsFromWearable}
                disabled={isSyncingSteps}
              >
                {isSyncingSteps ? (
                  <>
                    <span className="spinner-icon">🔄</span> Syncing Device...
                  </>
                ) : (
                  <>
                    <span className="wearable-icon">⌚</span> Refresh Sync
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="activity-split-card glass-panel">
          <div className="activity-split-header">
            <span>💧 Water Log</span>
            <span className="wearable-badge" style={{ color: '#60a5fa', background: 'rgba(96, 165, 250, 0.08)', borderColor: 'rgba(96, 165, 250, 0.2)' }}>⚡ Smart Sync</span>
          </div>
          <div className="activity-split-body">
            <div className="giant-stat">
              {waterGlasses} <span className="stat-unit">/ {recommendedWaterTarget} glasses</span>
            </div>
            
            <div className="wearable-sync-detail">
              <span>● Bottle connected</span>
              <span>Last: {waterLastSyncTime}</span>
            </div>

            <div className="water-progress-container mt-1">
              <div className="water-progress-track">
                <div 
                  className={`water-progress-bar ${
                    waterGlasses > waterSafetyLimit 
                      ? 'danger-glow' 
                      : waterGlasses >= recommendedWaterTarget 
                      ? 'success-glow' 
                      : 'active-glow'
                  }`}
                  style={{ width: `${Math.min((waterGlasses / recommendedWaterTarget) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="water-target-breakdown mt-2">
              <span className="water-info-label">Limit: {waterSafetyLimit} gls</span>
              <span className="water-target-label">Target: {recommendedWaterTarget} gls</span>
            </div>

            <div className="quick-add-row mt-2" style={{ display: 'flex', gap: '8px' }}>
              <button 
                className={`btn-quick-log sync-action-btn ${isSyncingWater ? 'syncing' : ''} ${waterGlasses >= recommendedWaterTarget ? 'limit-reached' : ''}`}
                onClick={syncWaterFromSmartBottle}
                disabled={waterGlasses >= recommendedWaterTarget || isSyncingWater}
                style={{ flex: 1.5 }}
              >
                {isSyncingWater ? (
                  <>
                    <span className="spinner-icon">🔄</span> Syncing...
                  </>
                ) : waterGlasses >= recommendedWaterTarget ? (
                  '🔒 Goal Met'
                ) : (
                  <>
                    <span className="wearable-icon">🍶</span> Sync Bottle
                  </>
                )}
              </button>
              <button 
                className="btn-quick-log manual-btn"
                onClick={logQuickGlass}
                disabled={waterGlasses >= recommendedWaterTarget}
                style={{ flex: 1, minWidth: '40px', padding: '0 8px', background: 'rgba(255, 255, 255, 0.03)' }}
              >
                {waterGlasses >= recommendedWaterTarget ? '🔒' : '+1'}
              </button>
            </div>

            {waterGlasses < recommendedWaterTarget ? (
              <div className="water-coaching-banner under mt-2 animate-in">
                <span>💧</span> Need {recommendedWaterTarget - waterGlasses} more glasses today
              </div>
            ) : waterGlasses <= waterSafetyLimit ? (
              <div className="water-coaching-banner success mt-2 animate-in">
                <span>✨</span> Hydration target achieved!
              </div>
            ) : (
              <div className="water-coaching-banner danger mt-2 animate-in">
                <span>⚠️</span> Over safe hydration limit!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Deficit Goal Checklist */}
      <div className="tracker-section mt-4">
        <div className="checklist-header-wrapper" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <h3 className="section-label" style={{ margin: 0 }}>Deficit Accountability</h3>
          <span className="percentage-badge" style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#f59e0b',
            background: 'rgba(245, 158, 11, 0.1)',
            padding: '4px 10px',
            borderRadius: '20px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            transition: 'all 0.3s ease',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.05)'
          }}>
            {completionPercentage}% Complete
          </span>
        </div>

        {/* Modern Progress Bar */}
        <div className="checklist-progress-container" style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '3px',
          marginBottom: '16px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.02)'
        }}>
          <div className="checklist-progress-bar" style={{
            width: `${completionPercentage}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
            borderRadius: '3px',
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
          }} />
        </div>

        <div className="checklist-grid">
          <button className={`toggle-card ${checks.protein ? 'active' : ''}`} onClick={() => toggleCheck('protein')}>
            <span className="icon">🥩</span>
            <span className="text">Eat {userProteinTarget}g Protein Target</span>
          </button>
          <button className={`toggle-card ${checks.steps ? 'active' : ''}`} onClick={() => toggleCheck('steps')}>
            <span className="icon">👟</span>
            <span className="text">10k Steps Walked</span>
          </button>
          <button className={`toggle-card ${checks.noLiquidCalories ? 'active' : ''}`} onClick={() => toggleCheck('noLiquidCalories')}>
            <span className="icon">🥤</span>
            <span className="text">Zero Liquid Calories</span>
          </button>
        </div>
      </div>

      {/* Quick Actions tab navigation shortcuts */}
      <div className="tracker-section">
        <h3 className="section-label">Quick Actions</h3>
        <div className="action-buttons">
          <button className="action-btn primary" onClick={() => setActiveTab('nutrition')}>
            <span className="icon">🥗</span>
            <span className="text">Track Macros & Calories</span>
            <span className="arrow">→</span>
          </button>
          <button className="action-btn" onClick={() => setActiveTab('progress')}>
            <span className="icon">📈</span>
            <span className="text">Strength Analytics</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </div>

      {showScanner && <MealScanner onClose={() => setShowScanner(false)} />}
    </div>
  );
};

export default FatLossDashboard;
