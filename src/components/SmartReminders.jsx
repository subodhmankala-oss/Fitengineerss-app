import React, { useState, useEffect } from 'react';
import './SmartReminders.css';

const appreciations = [
  "Great job taking that sip! Every drop counts! 💧",
  "Fantastic! That's how we build consistent habits! 🌟",
  "Superb! Hydration is the secret to high performance! ⚡",
  "Awesome! Cheering for your small moves! 🥛",
  "Brilliant! Step by step, glass by glass! 🌊"
];

const SmartReminders = () => {
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const [walkLunchDinner, setWalkLunchDinner] = useState(false);
  const [walkTimer, setWalkTimer] = useState(30 * 60); // 30 minutes in seconds
  const [strollsLogged, setStrollsLogged] = useState(0);
  
  // Smart Hydration Wearable Sync states
  const [isSyncingWater, setIsSyncingWater] = useState(false);
  const [waterLastSyncTime, setWaterLastSyncTime] = useState('Just now');
  
  // States for dynamic water calculation
  const [calorieBudget, setCalorieBudget] = useState(1800);
  const [userWeight, setUserWeight] = useState(70);
  const [userProteinTarget, setUserProteinTarget] = useState(100);
  const [steps, setSteps] = useState(4800);



  useEffect(() => {
    // Load stored values
    const storedWater = localStorage.getItem('waterGlasses');
    if (storedWater) setWaterGlasses(parseInt(storedWater));

    const storedLunchWalk = localStorage.getItem('walkLunchDinner');
    if (storedLunchWalk) setWalkLunchDinner(storedLunchWalk === 'true');

    const storedStrolls = localStorage.getItem('strollsLogged');
    if (storedStrolls) setStrollsLogged(parseInt(storedStrolls));

    // Load other metrics for dynamic water calculations
    const hydrateMetrics = () => {
      const storedBudget = localStorage.getItem('userCalorieTarget');
      if (storedBudget) setCalorieBudget(parseInt(storedBudget));

      const storedWeight = localStorage.getItem('userWeight');
      if (storedWeight) setUserWeight(parseFloat(storedWeight));

      const storedProtein = localStorage.getItem('userProteinTarget');
      if (storedProtein) setUserProteinTarget(parseInt(storedProtein));

      const storedSteps = localStorage.getItem('userSyncedSteps');
      if (storedSteps) setSteps(parseInt(storedSteps));
    };

    hydrateMetrics();

    // Listen to custom updates to stay in sync
    const handleWaterUpdate = () => {
      const latestWater = localStorage.getItem('waterGlasses');
      if (latestWater) setWaterGlasses(parseInt(latestWater));
    };

    window.addEventListener('waterUpdated', handleWaterUpdate);
    window.addEventListener('stepsUpdated', hydrateMetrics);

    return () => {
      window.removeEventListener('waterUpdated', handleWaterUpdate);
      window.removeEventListener('stepsUpdated', hydrateMetrics);
    };
  }, []);

  // Dynamic water calculation logic
  const baseCalorieGlasses = calorieBudget / 250;
  const baseWeightGlasses = (userWeight * 35) / 250;
  const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
  const stepBooster = Math.floor(steps / 3000);
  const proteinBooster = userProteinTarget > 150 ? 2 : (userProteinTarget > 100 ? 1 : 0);

  const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);
  const waterSafetyLimit = recommendedWaterTarget + 4;

  // Walk countdown timer simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setWalkTimer(prev => {
        if (prev <= 1) {
          // Reset timer and show alert
          return 30 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const logGlass = () => {
    if (waterGlasses >= recommendedWaterTarget) {
      setToastMessage(`🔒 Goal Met! Hydration locked at daily target of ${recommendedWaterTarget} glasses.`);
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
      const randomMsg = appreciations[Math.floor(Math.random() * appreciations.length)];
      setToastMessage(randomMsg);
    }
    setTimeout(() => setToastMessage(''), 4000);
  };

  const syncWaterFromSmartBottle = () => {
    if (isSyncingWater) return;
    setIsSyncingWater(true);

    setTimeout(() => {
      // Simulate reading sips from a smart Bluetooth water bottle or watch
      const randomSips = Math.floor(Math.random() * 2) + 1; // Sync +1 or +2 glasses
      
      setWaterGlasses(prev => {
        const nextGlasses = Math.min(prev + randomSips, recommendedWaterTarget);
        localStorage.setItem('waterGlasses', nextGlasses.toString());
        
        // Notify others
        window.dispatchEvent(new Event('waterUpdated'));
        
        if (nextGlasses >= recommendedWaterTarget) {
          setToastMessage(`🔒 Smart Sync: Hydration capped at goal (${recommendedWaterTarget} glasses) to maintain optimal digestion.`);
        } else {
          setToastMessage(`⚡ Smart Sync: Synced sips from Smart Bottle (+${randomSips} glass${randomSips > 1 ? 'es' : ''})! 💧`);
        }
        return nextGlasses;
      });

      setIsSyncingWater(false);
      const now = new Date();
      setWaterLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setToastMessage(''), 4000);
    }, 1200);
  };

  const handleLunchWalkToggle = () => {
    const nextVal = !walkLunchDinner;
    setWalkLunchDinner(nextVal);
    localStorage.setItem('walkLunchDinner', nextVal.toString());
  };

  const logStroll = () => {
    const nextStrolls = strollsLogged + 1;
    setStrollsLogged(nextStrolls);
    localStorage.setItem('strollsLogged', nextStrolls.toString());
    setWalkTimer(30 * 60); // Reset timer

    setToastMessage("Outstanding stroll! Digestion boosted and steps locked! 🚶‍♂️⚡");
    setTimeout(() => setToastMessage(''), 4000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="smart-reminders-panel glass-panel mt-4">
      <div className="reminders-header">
        <span className="bell-icon">🔔</span>
        <h3>Smart Reminders & Routine</h3>
      </div>

      {toastMessage && (
        <div className="reminder-toast animate-in">
          <span>✨</span> {toastMessage}
        </div>
      )}

      {/* Water Tracker with dynamic target & safety limit */}
      <div className="reminder-section">
        <div className="reminder-info">
          <div className="water-title-row">
            <h4>Water Intake Tracker</h4>
            <span className="wearable-badge water-sync">⚡ Smart Sync ● Bottle connected</span>
          </div>
          <p>Target: {recommendedWaterTarget} Glasses ({recommendedWaterTarget * 0.25}L) • Limit: {waterSafetyLimit} Glasses</p>
        </div>
        <div className="water-tracker-actions">
          <div className="glasses-count">
            {Array.from({ length: Math.min(waterGlasses, 10) }).map((_, i) => (
              <span key={i} className="water-drop-active animate-scale-in">💧</span>
            ))}
            {waterGlasses === 0 && <span className="no-glasses">0 Glasses logged</span>}
            {waterGlasses > 10 && <span className="glasses-plus">+{waterGlasses - 10} more!</span>}
          </div>
          
          <div className="water-sync-status-row">
            <span className="water-sync-time">Last synced sips: {waterLastSyncTime}</span>
          </div>

          <div className="water-buttons-row">
            <button 
              className={`btn-sync-water ${waterGlasses >= recommendedWaterTarget ? 'limit-reached' : ''} ${isSyncingWater ? 'syncing' : ''}`}
              onClick={syncWaterFromSmartBottle}
              disabled={waterGlasses >= recommendedWaterTarget || isSyncingWater}
            >
              {isSyncingWater ? (
                <>
                  <span className="spinner-icon">🔄</span> Syncing Smart Bottle...
                </>
              ) : waterGlasses >= recommendedWaterTarget ? (
                '🔒 Goal Met'
              ) : (
                <>
                  <span className="smart-bottle-icon">🍶</span> Sync Smart Bottle
                </>
              )}
            </button>

            <button 
              className="btn-manual-water-log"
              onClick={logGlass}
              disabled={waterGlasses >= recommendedWaterTarget}
              title="Log sips manually when smart bottle is offline"
            >
              {waterGlasses >= recommendedWaterTarget ? '🔒 Goal Met' : '➕ Log Glass'}
            </button>
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* Walk after Lunch & Dinner and Every 30-40 Minutes */}
      <div className="reminder-section">
        <div className="reminder-info">
          <h4>Daily Walk Alerts</h4>
          <p>Enhance insulin sensitivity & gut health</p>
        </div>
        
        <div className="walk-controls">
          <label className={`checkbox-card ${walkLunchDinner ? 'checked' : ''}`}>
            <input 
              type="checkbox" 
              checked={walkLunchDinner} 
              onChange={handleLunchWalkToggle} 
            />
            <span className="icon">🍱</span>
            <span className="text">Walk 10 mins post Lunch & Dinner</span>
          </label>

          <div className="timer-card">
            <div className="timer-info">
              <span className="icon">⏱️</span>
              <div className="timer-text-col">
                <strong>Stroll Every 30-40 Mins</strong>
                <p>Next stroll due in: <span className="timer-countdown">{formatTime(walkTimer)}</span></p>
              </div>
            </div>
            <button className="btn-log-stroll" onClick={logStroll}>
              Log Short Stroll ({strollsLogged})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartReminders;
