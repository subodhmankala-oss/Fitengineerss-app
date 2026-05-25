import React, { useState, useEffect } from 'react';
import './SmartReminders.css';

const appreciations = [
  "Great job taking that sip! Every drop counts! 💧",
  "Fantastic! That's how we build consistent habits! 🌟",
  "Superb! Hydration is the secret to high performance! ⚡",
  "Awesome! Cheering for your small moves! 🥛",
  "Brilliant! Step by step, glass by glass! 🌊"
];

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

const afternoonQuotes = [
  "Mid-day check-in! Don't let afternoon fatigue stall your momentum. Hydrate, stretch, and stay laser-focused! ⚡",
  "Consistency is what transforms average attempts into legendary achievements. Keep ticking off those daily targets! 📊",
  "Afternoon momentum! Stand up, take a deep breath, and log those steps. Activity is the antidote to sluggishness! 🚶‍♂️",
  "Action beats intention every single time. Have you drank your water and eaten your protein? Stay on track! 🥩",
  "Mid-day check! Lock in your lunch-hour walk. Your insulin sensitivity and gut health will thank you later! 🍱",
  "No slacking! The afternoon slump is just a state of mind. Recharge with a glass of water and a brief stroll. 🥤",
  "Keep grinding! Small disciplines repeated daily lead to massive transformations. Focus on the next correct step! 🎯",
  "Afternoon power! You've come too far to give up on today's goals. Finish the second half of the day strong! 💥",
  "Stay consistent! Great things are built stone by stone. Log your lunch, hit your macros, and keep moving! 🥑",
  "Check your alignment! Are your choices this afternoon matching the goals you set this morning? Make it happen! 🚀"
];

const nightQuotes = [
  "Outstanding effort today! Now it's time to prioritize recovery. Sleep is where the real muscle growth happens. 🌙",
  "Good night! Unwind your mind, dim the lights, and let your nervous system return to a peaceful balance. 💤",
  "Reflection time: Be proud of the effort you put in today. Recovery is just as important as the grind! 🌌",
  "Time to recharge. High sleep quality is the cornerstone of protein synthesis and cellular repair. Sleep deep! 🛌",
  "Unwind and release. You did your absolute best today. Rest now, wake up ready to conquer tomorrow! 🕊️",
  "Good night, champion. Shut off all screens, let your mind settle, and allow your body to heal and recover. 📴",
  "As the day ends, remember that patience and consistency are your greatest strengths. Rest up for the journey ahead. 🌠",
  "Night check-in: Hydration is set, calories are logged, and mind is clear. Sleep well and recover fully. 🧼",
  "Relax your shoulders and breathe. Every day is a step closer to your ultimate self. Sleep tight! 🌃",
  "Prioritize your rest tonight. Tomorrow's strength is built on tonight's deep recovery. Sweet dreams! 🌟"
];

const SmartReminders = () => {
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [toastMessage, setToastMessage] = useState('');
  const [walkLunchDinner, setWalkLunchDinner] = useState(false);
  const [walkTimer, setWalkTimer] = useState(30 * 60); // 30 minutes in seconds
  const [strollsLogged, setStrollsLogged] = useState(0);
  const [showMorning, setShowMorning] = useState(true);
  const [showNight, setShowNight] = useState(true);
  
  // Smart Hydration Wearable Sync states
  const [isSyncingWater, setIsSyncingWater] = useState(false);
  const [waterLastSyncTime, setWaterLastSyncTime] = useState('Just now');
  
  // States for dynamic water calculation
  const [calorieBudget, setCalorieBudget] = useState(1800);
  const [userWeight, setUserWeight] = useState(70);
  const [userProteinTarget, setUserProteinTarget] = useState(100);
  const [steps, setSteps] = useState(4800);

  // Custom morning, afternoon, and night quote indices
  const [morningQuote, setMorningQuote] = useState('');
  const [afternoonQuote, setAfternoonQuote] = useState('');
  const [nightQuote, setNightQuote] = useState('');
  const [showAfternoon, setShowAfternoon] = useState(true);

  useEffect(() => {
    // Load stored values
    const storedWater = localStorage.getItem('waterGlasses');
    if (storedWater) setWaterGlasses(parseInt(storedWater));

    const storedLunchWalk = localStorage.getItem('walkLunchDinner');
    if (storedLunchWalk) setWalkLunchDinner(storedLunchWalk === 'true');

    const storedStrolls = localStorage.getItem('strollsLogged');
    if (storedStrolls) setStrollsLogged(parseInt(storedStrolls));

    // Choose quotes based on day of the year to ensure a different one every day but consistent for a calendar day
    const today = new Date();
    const dateIndex = today.getDate() + today.getMonth() * 31;
    setMorningQuote(morningQuotes[dateIndex % morningQuotes.length]);
    setAfternoonQuote(afternoonQuotes[dateIndex % afternoonQuotes.length]);
    setNightQuote(nightQuotes[dateIndex % nightQuotes.length]);

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

      <hr className="divider" />

      {/* Automated Broadcast Messages: Morning & Night */}
      <div className="reminder-section">
        <div className="reminder-info mb-2">
          <h4>Automated Coach Broadcasts</h4>
          <p>Everyday wellness & motivational delivery</p>
        </div>

        <div className="broadcast-grid">
          {showMorning && (
            <div className="broadcast-card morning animate-scale-in">
              <div className="card-header">
                <span>☀️ Morning Wellness Broadcast</span>
                <button className="close-btn" onClick={() => setShowMorning(false)}>×</button>
              </div>
              <p className="broadcast-text">"{morningQuote}"</p>
            </div>
          )}

          {showAfternoon && (
            <div className="broadcast-card afternoon animate-scale-in">
              <div className="card-header">
                <span>⚡ Afternoon Consistency Broadcast</span>
                <button className="close-btn" onClick={() => setShowAfternoon(false)}>×</button>
              </div>
              <p className="broadcast-text">"{afternoonQuote}"</p>
            </div>
          )}

          {showNight && (
            <div className="broadcast-card night animate-scale-in">
              <div className="card-header">
                <span>🌙 Night Recovery Broadcast</span>
                <button className="close-btn" onClick={() => setShowNight(false)}>×</button>
              </div>
              <p className="broadcast-text">"{nightQuote}"</p>
            </div>
          )}

          {!showMorning && !showAfternoon && !showNight && (
            <p className="no-broadcasts">Broadcasts checked for the day! Keep grinding! 👍</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SmartReminders;
