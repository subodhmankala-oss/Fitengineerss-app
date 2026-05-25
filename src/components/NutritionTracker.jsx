import React, { useState, useEffect } from 'react';
import './NutritionTracker.css';

const NutritionTracker = ({ setActiveTab }) => {
  // Toast notifications for logger actions
  const [toastMessage, setToastMessage] = useState('');

  // Load target goals from profile or healthy defaults
  const [targets, setTargets] = useState({
    calories: 1800,
    protein: 130,
    carbs: 180,
    fats: 60
  });

  // Current logged intake state
  const [logged, setLogged] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0
  });

  // Steps for burned calories (mirrors HomeTracker formula)
  const [steps, setSteps] = useState(() => {
    const storedSteps = localStorage.getItem('userSyncedSteps');
    if (storedSteps) return parseInt(storedSteps);
    const goal = localStorage.getItem('userGoal');
    if (goal === 'Fat Loss') return 5500;
    if (goal === 'Muscle Building') return 6000;
    return 4800; // Gut Fix / default
  });

  // Developer simulation panel state
  const [showSliders, setShowSliders] = useState(false);

  useEffect(() => {
    // 1. Fetch user-defined targets from profile onboarding
    const calorieTarget = localStorage.getItem('userCalorieTarget');
    const proteinTarget = localStorage.getItem('userProteinTarget');
    const carbsTarget   = localStorage.getItem('userCarbsTarget');
    const fatsTarget    = localStorage.getItem('userFatsTarget');

    const activeTargets = {
      calories: calorieTarget ? parseInt(calorieTarget) : 1800,
      protein:  proteinTarget ? parseInt(proteinTarget) : 130,
      carbs:    carbsTarget   ? parseInt(carbsTarget)   : 180,
      fats:     fatsTarget    ? parseInt(fatsTarget)    : 60
    };
    setTargets(activeTargets);

    // ── Build logged calories from HomeTracker meal keys (primary source of truth) ──
    const homeMealCalories = (() => {
      const b = parseInt(localStorage.getItem('homeMealBreakfast') || '0');
      const l = parseInt(localStorage.getItem('homeMealLunch')     || '0');
      const d = parseInt(localStorage.getItem('homeMealDinner')    || '0');
      const s = parseInt(localStorage.getItem('homeMealSnacks')    || '0');
      // Only trust it if at least one meal key exists
      const hasMealData = localStorage.getItem('homeMealBreakfast') !== null
                       || localStorage.getItem('homeMealLunch')      !== null;
      return hasMealData ? b + l + d + s : null;
    })();

    // 2. Fallback chain: homeMeal total → userLoggedCalories → 65% simulation
    const loggedProtein  = localStorage.getItem('userLoggedProtein');
    const loggedCarbs    = localStorage.getItem('userLoggedCarbs');
    const loggedFats     = localStorage.getItem('userLoggedFats');
    const loggedCalories = localStorage.getItem('userLoggedCalories');

    if (homeMealCalories !== null) {
      // Primary: use real meal data from HomeTracker
      // Derive macro estimates proportionally from the calorie ratio
      const ratio = activeTargets.calories > 0 ? homeMealCalories / activeTargets.calories : 0;
      const initLogged = {
        calories: homeMealCalories,
        protein:  loggedProtein  ? parseInt(loggedProtein)  : Math.round(activeTargets.protein  * ratio),
        carbs:    loggedCarbs    ? parseInt(loggedCarbs)    : Math.round(activeTargets.carbs    * ratio),
        fats:     loggedFats     ? parseInt(loggedFats)     : Math.round(activeTargets.fats     * ratio),
      };
      setLogged(initLogged);
      localStorage.setItem('userLoggedCalories', homeMealCalories.toString());
    } else if (loggedCalories) {
      // Secondary: use previously saved logged values
      setLogged({
        protein:  loggedProtein  ? parseInt(loggedProtein)  : 0,
        carbs:    loggedCarbs    ? parseInt(loggedCarbs)    : 0,
        fats:     loggedFats     ? parseInt(loggedFats)     : 0,
        calories: parseInt(loggedCalories)
      });
    }
    // No fallback 65% simulation — show real data only

    // ── Listen for HomeTracker meal updates in real time ──
    const handleNutritionSync = () => {
      const b = parseInt(localStorage.getItem('homeMealBreakfast') || '0');
      const l = parseInt(localStorage.getItem('homeMealLunch')     || '0');
      const d = parseInt(localStorage.getItem('homeMealDinner')    || '0');
      const s = parseInt(localStorage.getItem('homeMealSnacks')    || '0');
      const synced = b + l + d + s;
      setLogged(prev => {
        const ratio = activeTargets.calories > 0 ? synced / activeTargets.calories : 0;
        return {
          calories: synced,
          protein:  parseInt(localStorage.getItem('userLoggedProtein')  || String(Math.round(activeTargets.protein  * ratio))),
          carbs:    parseInt(localStorage.getItem('userLoggedCarbs')    || String(Math.round(activeTargets.carbs    * ratio))),
          fats:     parseInt(localStorage.getItem('userLoggedFats')     || String(Math.round(activeTargets.fats     * ratio))),
        };
      });
    };

    // ── Load steps to compute burned calories (same as HomeTracker) ──
    const loadSteps = () => {
      const storedSteps = localStorage.getItem('userSyncedSteps');
      if (storedSteps) {
        setSteps(parseInt(storedSteps));
      } else {
        const goal = localStorage.getItem('userGoal');
        if (goal === 'Fat Loss') setSteps(5500);
        else if (goal === 'Muscle Building') setSteps(6000);
        else setSteps(4800);
      }
    };
    loadSteps();
    window.addEventListener('stepsUpdated', loadSteps);

    window.addEventListener('nutritionUpdated', handleNutritionSync);
    return () => {
      window.removeEventListener('nutritionUpdated', handleNutritionSync);
      window.removeEventListener('stepsUpdated', loadSteps);
    };
  }, []);

  // Helper to persist logged state locally
  const updateLoggedState = (newLogged) => {
    setLogged(newLogged);
    localStorage.setItem('userLoggedProtein', newLogged.protein.toString());
    localStorage.setItem('userLoggedCarbs', newLogged.carbs.toString());
    localStorage.setItem('userLoggedFats', newLogged.fats.toString());
    localStorage.setItem('userLoggedCalories', newLogged.calories.toString());
  };

  // ── EXACT same formula as HomeTracker ──
  // Home:      remaining = budget - (eaten - burned)
  // Nutrition: remaining = target - (logged - burned)  ← now matches
  const caloriesBurned    = Math.round(steps * 0.04);
  const netCalories       = logged.calories - caloriesBurned;
  const remainingCalories = targets.calories - netCalories;
  const missingProtein    = targets.protein - logged.protein;
  const missingCarbs      = targets.carbs   - logged.carbs;
  const missingFats       = targets.fats    - logged.fats;

  // Alerts logic
  const isLagging = remainingCalories > 50 || missingProtein > 5 || missingCarbs > 5 || missingFats > 5;

  const getAlertContent = () => {
    if (!isLagging) {
      return {
        type: 'success',
        title: 'All Targets Locked! 🎯',
        body: 'Incredible precision! You have fully satisfied your daily caloric budget and macro targets. Coach Subodh is extremely proud of your precision accountability! Let\'s lock it in.',
        action: 'Goal: Perfect balance achieved!'
      };
    }

    let missingList = [];
    if (missingProtein > 5) missingList.push(`${missingProtein}g Protein`);
    if (missingCarbs > 5) missingList.push(`${missingCarbs}g Carbs`);
    if (missingFats > 5) missingList.push(`${missingFats}g Fats`);

    let listStr = '';
    if (missingList.length === 1) listStr = missingList[0];
    else if (missingList.length === 2) listStr = `${missingList[0]} and ${missingList[1]}`;
    else if (missingList.length > 2) {
      listStr = `${missingList.slice(0, -1).join(', ')}, and ${missingList[missingList.length - 1]}`;
    }

    let suggestion = 'Add a quick premium meal block to satisfy the remaining budget!';
    if (missingProtein > 20 && missingFats > 10) {
      suggestion = 'Try 3 scrambled eggs with slice of whole-wheat toast & half avocado.';
    } else if (missingProtein > 15) {
      suggestion = 'A double scoop whey protein shake or 150g chicken breast will instantly lock this.';
    } else if (missingFats > 8) {
      suggestion = 'Eat a handful of walnuts or stir a tablespoon of almond butter into warm oatmeal.';
    } else if (missingCarbs > 20) {
      suggestion = 'Consume a cup of jasmine rice or double medium bananas to satisfy the carbohydrate deficit.';
    }

    return {
      type: 'warning',
      title: 'Macro Deficit Detected ⚠️',
      body: `You are lagging by ${remainingCalories} kcal today. Precision analytics show you still need: ${listStr}.`,
      action: `Coach Subodh Suggestion: ${suggestion}`
    };
  };

  const alert = getAlertContent();

  // Helper to get status badge content for macro targets
  const getMacroStatus = (loggedVal, targetVal) => {
    const ratio = loggedVal / targetVal;
    if (ratio >= 0.95 && ratio <= 1.05) {
      return { text: '🎯 Locked', className: 'status-locked' };
    } else if (ratio > 1.05) {
      return { text: '🔥 Surplus', className: 'status-surplus' };
    } else {
      return { text: '⚠️ Lagging', className: 'status-lagging' };
    }
  };

  // Preset quick food logging triggers
  const quickPresets = [
    { name: 'Protein Shake', protein: 30, carbs: 3, fats: 1, kcal: 140, icon: '🥛', desc: 'Whey + water' },
    { name: 'Oats & Banana', protein: 6, carbs: 45, fats: 4, kcal: 240, icon: '🥣', desc: 'Carb & fiber fuel' },
    { name: 'Eggs & Avocado', protein: 14, carbs: 4, fats: 15, kcal: 200, icon: '🍳', desc: 'Healthy fats + egg whites' },
    { name: 'Chicken & Rice', protein: 40, carbs: 45, fats: 6, kcal: 400, icon: '🍗', desc: 'Ultimate muscle food' },
    { name: 'Mixed Nuts', protein: 5, carbs: 6, fats: 15, kcal: 180, icon: '🥜', desc: 'Premium micro-fats' }
  ];

  const handleAddPreset = (food) => {
    const nextLogged = {
      protein: logged.protein + food.protein,
      carbs: logged.carbs + food.carbs,
      fats: logged.fats + food.fats,
      calories: logged.calories + food.kcal
    };
    updateLoggedState(nextLogged);
    
    setToastMessage(`⚡ Quick Log: Added ${food.icon} ${food.name}! (+${food.protein}g Protein, +${food.kcal} kcal)`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Auto-log Coach suggestion
  const handleAutoLogCoach = () => {
    const nextLogged = {
      protein: Math.max(logged.protein, targets.protein),
      carbs: Math.max(logged.carbs, targets.carbs),
      fats: Math.max(logged.fats, targets.fats),
      calories: Math.max(logged.calories, targets.calories)
    };
    updateLoggedState(nextLogged);
    setToastMessage(`🚀 Smart Auto-Log: Coach Subodh's suggestions fully logged! Deficit closed. ✨`);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Adjust sliders
  const handleSliderChange = (key, val) => {
    const nextLogged = { ...logged, [key]: parseInt(val) };
    // Maintain standard 4/4/9 thermodynamic scale logic automatically for sliders
    if (key !== 'calories') {
      nextLogged.calories = (nextLogged.protein * 4) + (nextLogged.carbs * 4) + (nextLogged.fats * 9);
    }
    updateLoggedState(nextLogged);
  };

  // Calculations for Calorie SVG Progress Circle (radius: 52, center: 60)
  const calorieRadius = 52;
  const calorieCircumference = 2 * Math.PI * calorieRadius;
  const calorieProgressRatio = Math.min(Math.max(logged.calories / targets.calories, 0), 1);
  const calorieStrokeDashoffset = calorieCircumference - calorieProgressRatio * calorieCircumference;

  // Macro progress ring specs (radius: 30, center: 36)
  const macroRadius = 30;
  const macroCircumference = 2 * Math.PI * macroRadius;

  return (
    <div className="nutrition-container animate-slide-up">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="reminder-toast animate-in">
          <span>✨</span> {toastMessage}
        </div>
      )}

      {/* Screen Header */}
      <div className="screen-header">
        <button className="back-btn" onClick={() => setActiveTab('home')}>
          <span className="icon">←</span> Dashboard
        </button>
        <h1 className="screen-title">Accountability</h1>
        <p className="screen-subtitle">Your personalized daily thermodynamic macro targets</p>
      </div>

      {/* Premium Circular Calories Hub */}
      <div className="calories-central-widget glass-panel">
        <div className="hub-layout">
          <div className="circular-progress-hub">
            <svg width="130" height="130" viewBox="0 0 120 120" className="radial-svg">
              <circle cx="60" cy="60" r={calorieRadius} className="radial-bg" />
              <circle 
                cx="60" 
                cy="60" 
                r={calorieRadius} 
                className="radial-fill calorie-radial" 
                style={{ 
                  strokeDasharray: calorieCircumference, 
                  strokeDashoffset: calorieStrokeDashoffset 
                }} 
              />
            </svg>
            <div className="radial-content">
              <span className="radial-stat-number">{remainingCalories}</span>
              <span className="radial-stat-label">{remainingCalories >= 0 ? 'Kcal Left' : 'Kcal Surplus'}</span>
            </div>
          </div>

          <div className="calorie-math-col">
            <h3>Today's Budget Summary</h3>
            <p className="summary-explain">Energy intake vs science-backed limits calculated for your body composition.</p>
            
            <div className="math-operator-row">
              <div className="math-operand">
                <span className="math-label">Target</span>
                <span className="math-stat">{targets.calories}</span>
              </div>
              <span className="math-operator">−</span>
              <div className="math-operand">
                <span className="math-label">Logged</span>
                <span className="math-stat highlight-eaten">{logged.calories}</span>
              </div>
              <span className="math-operator">=</span>
              <div className="math-operand">
                <span className="math-label">Remaining</span>
                <span className={`math-stat highlight-remaining ${remainingCalories < 0 ? 'surplus' : 'deficit'}`}>
                  {Math.abs(remainingCalories)}
                </span>
              </div>
            </div>
            
            <div className={`budget-status-banner ${remainingCalories < 0 ? 'surplus' : 'deficit'}`}>
              {remainingCalories >= 0 ? (
                <span>🎯 In caloric deficit — perfect for fat burn and recovery</span>
              ) : (
                <span>🔥 Caloric Surplus — supportive of muscular hypertrophy and gainz</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Premium 3-Column Macro Grid - Centered & Vertically Stacked to Prevent Overlaps */}
      <div className="macro-dials-grid">
        {/* Protein Card */}
        <div className="macro-dial-card glass-panel protein-accent">
          <div className="macro-dial-header">
            <h4>🥩 Protein</h4>
            <span className={`status-badge ${getMacroStatus(logged.protein, targets.protein).className}`}>
              {getMacroStatus(logged.protein, targets.protein).text}
            </span>
          </div>
          <div className="macro-dial-body">
            <div className="macro-radial-wrapper">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={macroRadius} className="radial-bg" />
                <circle 
                  cx="36" 
                  cy="36" 
                  r={macroRadius} 
                  className="radial-fill protein-radial" 
                  style={{ 
                    strokeDasharray: macroCircumference, 
                    strokeDashoffset: macroCircumference - Math.min(Math.max(logged.protein / targets.protein, 0), 1) * macroCircumference 
                  }} 
                />
              </svg>
              <div className="macro-radial-stat">
                <span>{Math.round((logged.protein / targets.protein) * 100)}%</span>
              </div>
            </div>
            <div className="macro-details-text">
              <div className="macro-values">
                <span className="logged-val protein">{logged.protein}g</span>
                <span className="divider">/</span>
                <span className="target-val">{targets.protein}g</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carbs Card */}
        <div className="macro-dial-card glass-panel carbs-accent">
          <div className="macro-dial-header">
            <h4>🍚 Carbs</h4>
            <span className={`status-badge ${getMacroStatus(logged.carbs, targets.carbs).className}`}>
              {getMacroStatus(logged.carbs, targets.carbs).text}
            </span>
          </div>
          <div className="macro-dial-body">
            <div className="macro-radial-wrapper">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={macroRadius} className="radial-bg" />
                <circle 
                  cx="36" 
                  cy="36" 
                  r={macroRadius} 
                  className="radial-fill carbs-radial" 
                  style={{ 
                    strokeDasharray: macroCircumference, 
                    strokeDashoffset: macroCircumference - Math.min(Math.max(logged.carbs / targets.carbs, 0), 1) * macroCircumference 
                  }} 
                />
              </svg>
              <div className="macro-radial-stat">
                <span>{Math.round((logged.carbs / targets.carbs) * 100)}%</span>
              </div>
            </div>
            <div className="macro-details-text">
              <div className="macro-values">
                <span className="logged-val carbs">{logged.carbs}g</span>
                <span className="divider">/</span>
                <span className="target-val">{targets.carbs}g</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fats Card */}
        <div className="macro-dial-card glass-panel fats-accent">
          <div className="macro-dial-header">
            <h4>🥑 Fats</h4>
            <span className={`status-badge ${getMacroStatus(logged.fats, targets.fats).className}`}>
              {getMacroStatus(logged.fats, targets.fats).text}
            </span>
          </div>
          <div className="macro-dial-body">
            <div className="macro-radial-wrapper">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={macroRadius} className="radial-bg" />
                <circle 
                  cx="36" 
                  cy="36" 
                  r={macroRadius} 
                  className="radial-fill fats-radial" 
                  style={{ 
                    strokeDasharray: macroCircumference, 
                    strokeDashoffset: macroCircumference - Math.min(Math.max(logged.fats / targets.fats, 0), 1) * macroCircumference 
                  }} 
                />
              </svg>
              <div className="macro-radial-stat">
                <span>{Math.round((logged.fats / targets.fats) * 100)}%</span>
              </div>
            </div>
            <div className="macro-details-text">
              <div className="macro-values">
                <span className="logged-val fats">{logged.fats}g</span>
                <span className="divider">/</span>
                <span className="target-val">{targets.fats}g</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lagging Coach Subodh Alert Card */}
      <div className={`alert-card mt-2 ${alert.type === 'success' ? 'success' : 'danger'}`}>
        <div className="alert-header">
          <span className="alert-icon">{alert.type === 'success' ? '🏆' : '⚠️'}</span>
          <h3>{alert.title}</h3>
        </div>
        <p className="alert-body">{alert.body}</p>
        <div className="alert-action">
          <strong>Action:</strong> {alert.action}
        </div>
        
        {alert.type === 'warning' && (
          <button 
            className="btn-auto-log-coach mt-3" 
            onClick={handleAutoLogCoach}
          >
            🚀 Auto-Log Coach Suggestion
          </button>
        )}
      </div>

      {/* Quick Food Logger Panel */}
      <div className="quick-logger-panel glass-panel mt-4">
        <div className="quick-logger-header">
          <h3>⚡ Quick Food Logger</h3>
          <p className="logger-desc">Instantly log standard gym foods and watch the circular macros fill up!</p>
        </div>
        
        <div className="presets-grid mt-2">
          {quickPresets.map((food, idx) => (
            <div 
              key={idx} 
              className="preset-tile glass-panel" 
              onClick={() => handleAddPreset(food)}
            >
              <div className="preset-icon">{food.icon}</div>
              <h4 className="preset-name">{food.name}</h4>
              <p className="preset-desc">{food.desc}</p>
              <div className="preset-macros">
                <span>+{food.protein}g P</span>
                <span>+{food.kcal} Kcal</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* developer sliders Panel inside an elegant expandable drawer */}
      <div className="simulation-drawer-container mt-4">
        <button 
          className="btn-toggle-sliders glass-panel" 
          onClick={() => setShowSliders(!showSliders)}
        >
          <span>{showSliders ? '🛠️ Hide Developer Sliders' : '🛠️ Open Developer Sliders'}</span>
          <span className="toggle-icon">{showSliders ? '▲' : '▼'}</span>
        </button>

        {showSliders && (
          <div className="glass-panel simulation-panel mt-2 animate-slide-down">
            <h3>Simulate Custom Intake</h3>
            <p className="simulation-desc">Manually drag custom inputs to calibrate progress bars and trigger edge-case status layouts.</p>
            
            <div className="slider-control">
              <div className="slider-label">
                <span>🥩 Custom Protein</span>
                <strong>{logged.protein}g / {targets.protein}g</strong>
              </div>
              <input 
                type="range" 
                min="0" 
                max={targets.protein * 1.5} 
                value={logged.protein} 
                onChange={(e) => handleSliderChange('protein', e.target.value)} 
              />
            </div>

            <div className="slider-control">
              <div className="slider-label">
                <span>🍚 Custom Carbs</span>
                <strong>{logged.carbs}g / {targets.carbs}g</strong>
              </div>
              <input 
                type="range" 
                min="0" 
                max={targets.carbs * 1.5} 
                value={logged.carbs} 
                onChange={(e) => handleSliderChange('carbs', e.target.value)} 
              />
            </div>

            <div className="slider-control">
              <div className="slider-label">
                <span>🥑 Custom Fats</span>
                <strong>{logged.fats}g / {targets.fats}g</strong>
              </div>
              <input 
                type="range" 
                min="0" 
                max={targets.fats * 1.5} 
                value={logged.fats} 
                onChange={(e) => handleSliderChange('fats', e.target.value)} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NutritionTracker;
