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
import './index.css'; 

const generateProgressMockData = () => {
  const water = [];
  const protein = [];
  const fats = [];
  const lifting = [];

  for (let i = 1; i <= 30; i++) {
    const wVal = parseFloat((3.0 + Math.sin(i / 1.5) * 1.0 + Math.random() * 0.4).toFixed(1));
    water.push({ day: i, val: wVal, target: 4.0 });

    const pVal = Math.round(115 + Math.cos(i / 2) * 20 + Math.random() * 15);
    protein.push({ day: i, val: pVal, target: 130 });

    const fVal = Math.round(42 + Math.sin(i / 3) * 10 + Math.random() * 8);
    fats.push({ day: i, val: fVal, target: 50 });

    const baseL = 90 + Math.floor(i / 4) * 5;
    const lVal = baseL + (i % 4 === 0 ? 2 : 0) + Math.floor(Math.random() * 3);
    lifting.push({ day: i, val: lVal, target: 100 });
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

function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [userGoal, setUserGoal] = useState('');

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

  if (!onboardingComplete) {
    return (
      <div className="app-container">
        <Onboarding onComplete={() => {
          const prevName = localStorage.getItem('lastUserName');
          const newName = localStorage.getItem('userName');
          
          if (prevName && prevName !== newName) {
            // New user! Preserve onboarding keys but clear all old tracker data & monthly history
            const keysToKeep = [
              'onboardingComplete', 'userName', 'userAge', 'userHeight', 'userWeight', 
              'userActivity', 'userGoal', 'userIssue', 'userDiet', 
              'userCalorieTarget', 'userProteinTarget', 'userCarbsTarget', 'userFatsTarget'
            ];
            const tempStorage = {};
            keysToKeep.forEach(k => {
              tempStorage[k] = localStorage.getItem(k);
            });
            localStorage.clear();
            Object.keys(tempStorage).forEach(k => {
              if (tempStorage[k] !== null) localStorage.setItem(k, tempStorage[k]);
            });
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
    // Preserve name to check if next user is same or different
    const name = localStorage.getItem('userName');
    if (name) localStorage.setItem('lastUserName', name);

    localStorage.removeItem('onboardingComplete');
    localStorage.removeItem('userGoal');
    localStorage.removeItem('userIssue');
    setOnboardingComplete(false);
    setUserGoal('');
    setActiveTab('home');
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

  const isNavVisible = ['home', 'mealPlan', 'workouts', 'progress', 'chat'].includes(activeTab);


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
          <button className={`nav-item ${activeTab === 'mealPlan' ? 'active' : ''}`} onClick={() => setActiveTab('mealPlan')}>
            <span className="icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.528V3a1 1 0 0 1 1-1h0" />
                <path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21" />
              </svg>
            </span>
            <span>Plan</span>
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
