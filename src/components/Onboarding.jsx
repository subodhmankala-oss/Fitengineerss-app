import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured, isTrainer } from '../services/databaseService';
import './Onboarding.css';

const googleAccounts = [
  {
    name: 'Subodh Mankala',
    email: 'subodhmankala@gmail.com',
    avatarLetter: 'M',
    avatarColor: '#ea4335',
    profile: {
      name: 'Subodh Mankala',
      age: '28',
      height: '175',
      weight: '70',
      activity: 'Moderately Active',
      goal: 'Fat Loss',
      issue: 'None',
      diet: 'Non-Vegetarian'
    }
  },
  {
    name: 'Subodh M',
    email: 'subodh.m@gmail.com',
    avatarLetter: 'S',
    avatarColor: '#3b82f6',
    profile: {
      name: 'Subodh M',
      age: '26',
      height: '178',
      weight: '75',
      activity: 'Moderately Active',
      goal: 'Fat Loss',
      issue: 'None',
      diet: 'Non-Vegetarian'
    }
  },
  {
    name: 'Subodh Guest',
    email: 'subodh.guest@gmail.com',
    avatarLetter: 'G',
    avatarColor: '#10b981',
    profile: {
      name: 'Subodh Guest',
      age: '30',
      height: '180',
      weight: '82',
      activity: 'Very Active',
      goal: 'Muscle Building',
      issue: 'Bloating',
      diet: 'Vegetarian'
    }
  }
];

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(() => {
    if (localStorage.getItem('userEmail')) {
      const storedName = localStorage.getItem('userName');
      return storedName ? 2 : 1;
    }
    return isSupabaseConfigured ? 0 : 1;
  });
  const [name, setName] = useState(() => localStorage.getItem('userName') || '');
  const [age, setAge] = useState(() => localStorage.getItem('userAge') || '');
  const [height, setHeight] = useState(() => localStorage.getItem('userHeight') || '');
  const [weight, setWeight] = useState(() => localStorage.getItem('userWeight') || '');
  const [activity, setActivity] = useState(() => localStorage.getItem('userActivity') || 'Moderately Active');
  const [goal, setGoal] = useState(() => localStorage.getItem('userGoal') || '');
  const [issue, setIssue] = useState(() => localStorage.getItem('userIssue') || '');
  const [diet, setDiet] = useState(() => localStorage.getItem('userDiet') || '');
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [matchingProfiles, setMatchingProfiles] = useState([]);

  // Authentication States
  const [authTab, setAuthTab] = useState('login'); // 'login' or 'register'
  const [userType, setUserType] = useState('client'); // 'client' or 'coach'
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem('rememberedEmail') || '');
  const [authPassword, setAuthPassword] = useState(() => localStorage.getItem('rememberedPassword') || '');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAuthForm, setShowAuthForm] = useState(false);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (authTab === 'login') {
        await databaseService.signIn(authEmail, authPassword);
        localStorage.setItem('rememberedEmail', authEmail);
        localStorage.setItem('rememberedPassword', authPassword);
        const profile = await databaseService.getUserProfileByEmail(authEmail);
        const hasCompleteProfile = profile && 
                                   profile.userName && 
                                   profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN' && profile.userAge !== '' &&
                                   profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN' && profile.userHeight !== '' &&
                                   profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN' && profile.userWeight !== '';

        if (isTrainer(authEmail) || hasCompleteProfile) {
          await databaseService.loadProfileIntoLocalStorage(profile || { userName: 'Trainer' }, authEmail);
          onComplete();
        } else {
          localStorage.setItem('userEmail', authEmail);
          if (profile && profile.userName) {
            localStorage.setItem('userName', profile.userName);
            if (profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN') localStorage.setItem('userAge', profile.userAge);
            if (profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN') localStorage.setItem('userHeight', profile.userHeight);
            if (profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN') localStorage.setItem('userWeight', profile.userWeight);
            if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
            if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
            if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
            localStorage.setItem('onboardingComplete', 'false');
            setStep(2);
          } else {
            setStep(1);
          }
        }
      } else {
        if (!name.trim()) {
          setAuthError('Please enter your name.');
          setAuthLoading(false);
          return;
        }
        await databaseService.signUp(authEmail, authPassword);
        localStorage.setItem('rememberedEmail', authEmail);
        localStorage.setItem('rememberedPassword', authPassword);
        localStorage.setItem('userEmail', authEmail);
        localStorage.setItem('userName', name.trim());
        setStep(2);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Reusable generic target calculation for onboarding & instant login
  const calculateTargetsGeneric = (wVal, hVal, aVal, actVal, goalVal) => {
    const w = parseFloat(wVal) || 70;
    const h = parseFloat(hVal) || 170;
    const a = parseInt(aVal) || 28;

    const bmr = 10 * w + 6.25 * h - 5 * a + 5;

    let multiplier = 1.2;
    if (actVal === 'Lightly Active') multiplier = 1.375;
    else if (actVal === 'Moderately Active') multiplier = 1.55;
    else if (actVal === 'Very Active') multiplier = 1.725;

    const tdee = bmr * multiplier;

    let calorieTarget = Math.round(tdee);
    if (goalVal && goalVal.includes('Fat Loss')) {
      calorieTarget = Math.round(tdee - 500);
      if (calorieTarget < 1200) calorieTarget = 1200;
    } else if (goalVal && goalVal.includes('Muscle Building')) {
      calorieTarget = Math.round(tdee + 300);
    }

    calorieTarget = Math.round(calorieTarget / 50) * 50;

    let proteinRatio = 0.30;
    let carbsRatio = 0.40;
    let fatsRatio = 0.30;

    if (goalVal && goalVal.includes('Fat Loss')) {
      proteinRatio = 0.35;
      carbsRatio = 0.35;
      fatsRatio = 0.30;
    } else if (goalVal && goalVal.includes('Muscle Building')) {
      proteinRatio = 0.30;
      carbsRatio = 0.45;
      fatsRatio = 0.25;
    }

    const proteinGrams = Math.round((calorieTarget * proteinRatio) / 4);
    const fatGrams = Math.round((calorieTarget * fatsRatio) / 9);
    const carbGrams = Math.round((calorieTarget * carbsRatio) / 4);

    return {
      calories: calorieTarget,
      protein: Math.round(proteinGrams / 5) * 5,
      carbs: Math.round(carbGrams / 5) * 5,
      fats: Math.round(fatGrams / 5) * 5
    };
  };

  const handleInstantLogin = (profile, email) => {
    const cleanName = profile.name.trim();
    const targets = calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal);

    localStorage.setItem('userName', cleanName);
    if (email) localStorage.setItem('userEmail', email);
    localStorage.setItem('userAge', profile.age);
    localStorage.setItem('userHeight', profile.height);
    localStorage.setItem('userWeight', profile.weight);
    localStorage.setItem('userActivity', profile.activity);
    localStorage.setItem('userGoal', profile.goal);
    localStorage.setItem('userIssue', profile.issue || '');
    localStorage.setItem('userDiet', profile.diet || '');

    localStorage.setItem('userCalorieTarget', targets.calories.toString());
    localStorage.setItem('userProteinTarget', targets.protein.toString());
    localStorage.setItem('userCarbsTarget', targets.carbs.toString());
    localStorage.setItem('userFatsTarget', targets.fats.toString());

    // Save profile for future sessions
    const profileData = {
      name: cleanName,
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
      activity: profile.activity,
      goal: profile.goal,
      issue: profile.issue || '',
      diet: profile.diet || ''
    };
    localStorage.setItem(`profile_${cleanName.toLowerCase().replace(/\s+/g, '')}`, JSON.stringify(profileData));

    onComplete();
  };

  const handleGoogleAccountSelect = (profile, email) => {
    setShowGoogleModal(false);
    handleInstantLogin(profile, email);
  };

  // Seed mock profiles if they do not exist, for the demo
  useEffect(() => {
    const defaultProfiles = [
      {
        name: 'Subodh Mankala',
        age: '28',
        height: '175',
        weight: '70',
        activity: 'Moderately Active',
        goal: 'Fat Loss',
        issue: 'None',
        diet: 'Non-Vegetarian'
      },
      {
        name: 'Subodh M',
        age: '26',
        height: '178',
        weight: '75',
        activity: 'Moderately Active',
        goal: 'Fat Loss',
        issue: 'None',
        diet: 'Non-Vegetarian'
      },
      {
        name: 'Subodh Guest',
        age: '30',
        height: '180',
        weight: '82',
        activity: 'Very Active',
        goal: 'Muscle Building',
        issue: 'Bloating',
        diet: 'Vegetarian'
      }
    ];

    defaultProfiles.forEach(prof => {
      const key = `profile_${prof.name.toLowerCase().replace(/\s+/g, '')}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(prof));
      }
    });
  }, []);

  // Search local storage for existing profiles when user name is typed
  useEffect(() => {
    if (!name.trim()) {
      setMatchingProfiles([]);
      return;
    }
    const cleanInput = name.trim().toLowerCase();
    const matches = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('profile_')) {
        try {
          const profile = JSON.parse(localStorage.getItem(key));
          if (profile && profile.name && profile.name.toLowerCase().includes(cleanInput)) {
            matches.push(profile);
          }
        } catch (e) {
          // ignore invalid profiles
        }
      }
    }
    setMatchingProfiles(matches);
  }, [name]);

  const handleToggleGoal = (toggled) => {
    let items = goal ? goal.split(',').map(i => i.trim()).filter(Boolean) : [];
    if (items.includes(toggled)) {
      items = items.filter(i => i !== toggled);
    } else {
      items.push(toggled);
    }
    setGoal(items.join(', '));
  };

  const handleToggleIssue = (toggled) => {
    let items = issue ? issue.split(',').map(i => i.trim()).filter(Boolean) : [];
    if (toggled === 'None') {
      setIssue('None');
      return;
    }
    items = items.filter(i => i !== 'None');
    if (items.includes(toggled)) {
      items = items.filter(i => i !== toggled);
    } else {
      items.push(toggled);
    }
    setIssue(items.join(', '));
  };

  // Automatic sliding carousel for onboarding mockup
  useEffect(() => {
    if (step !== 0 || showAuthForm) return;
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(interval);
  }, [step, showAuthForm]);

  const TOTAL_STEPS = 6;

  const calculateTargets = (selectedGoal) => {
    return calculateTargetsGeneric(weight, height, age, activity, selectedGoal);
  };

  const handleBack = () => {
    if (step > 0) {
      if (step === 1 && !isSupabaseConfigured) {
        return;
      }
      setStep(step - 1);
    }
  };

  const handleNext = () => {
    if (step === 1 && !name.trim()) return;
    if (step === 2 && (!age || !height || !weight)) return;
    if (step === 3 && !activity) return;
    if (step === 4 && !goal) return;
    if (step === 5 && !issue) return;
    if (step === 6 && !diet) return;

    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      const targets = calculateTargets(goal);
      
      const cleanName = name.trim();
      localStorage.setItem('userName', cleanName);
      localStorage.setItem('userAge', age);
      localStorage.setItem('userHeight', height);
      localStorage.setItem('userWeight', weight);
      localStorage.setItem('userActivity', activity);
      localStorage.setItem('userGoal', goal);
      localStorage.setItem('userIssue', issue);
      localStorage.setItem('userDiet', diet);
      
      localStorage.setItem('userCalorieTarget', targets.calories.toString());
      localStorage.setItem('userProteinTarget', targets.protein.toString());
      localStorage.setItem('userCarbsTarget', targets.carbs.toString());
      localStorage.setItem('userFatsTarget', targets.fats.toString());
      
      // Save profile under key for future autofill
      const profileData = {
        name: cleanName,
        age,
        height,
        weight,
        activity,
        goal,
        issue,
        diet
      };
      localStorage.setItem(`profile_${cleanName.toLowerCase().replace(/\s+/g, '')}`, JSON.stringify(profileData));
      
      onComplete();
    }
  };

  return (
    <div className="onboarding-container">
      {step > 0 && (
        <div className="onboarding-header">
          <img src="/logo.png" className="onboarding-logo" alt="Fitengineers Logo" />
          <h2 className="glow-text">
            Fitengineers App Setup
          </h2>
          <div className="step-bar">
            <div className="step-progress" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}></div>
          </div>
          <div className="step-counter">Step {step} of {TOTAL_STEPS}</div>
        </div>
      )}

      {step === 0 && (
        <div className={`onboarding-portal-wrapper ${showAuthForm ? 'auth-form-active' : ''}`}>
          {/* Left/Center Side: Logo and Slide Mockup */}
          <div className="portal-left-panel">
            <div className="portal-logo-area">
              <img src="/logo.png" className="portal-logo" alt="Fitengineers Logo" />
              <h2 className="portal-brand-title">FITENGINEERS</h2>
            </div>
            
            {/* CSS Phone Mockup */}
            <div className="phone-mockup-wrapper">
              <div className="phone-mockup">
                <div className="phone-speaker"></div>
                <div className="phone-screen">
                  <div className="phone-status-bar">
                    <span>9:41</span>
                    <div className="phone-status-icons">📶 🔋</div>
                  </div>
                  <div className="phone-content-carousel">
                    {/* Slide 0: Workouts */}
                    <div className={`phone-slide ${activeSlide === 0 ? 'slide-active' : ''}`}>
                      <div className="mini-app-header">🏋️ Log Workout</div>
                      <div className="mini-app-body">
                        <div className="mini-stats-row">
                          <div><span>Duration</span><strong>45m</strong></div>
                          <div><span>Volume</span><strong>4.2k kg</strong></div>
                        </div>
                        <div className="mini-exercise-card">
                          <div className="mini-exercise-title">Incline Bench Press</div>
                          <div className="mini-sets-list">
                            <div className="mini-set-row checked">
                              <span className="set-num">1</span>
                              <span>30kg x 10</span>
                              <span className="set-check">✓</span>
                            </div>
                            <div className="mini-set-row checked">
                              <span className="set-num">2</span>
                              <span>30kg x 10</span>
                              <span className="set-check">✓</span>
                            </div>
                            <div className="mini-set-row">
                              <span className="set-num">3</span>
                              <span>35kg x 8</span>
                              <span className="set-check-empty">○</span>
                            </div>
                          </div>
                        </div>
                        <div className="mini-btn-placeholder">+ Add Exercise</div>
                      </div>
                    </div>

                    {/* Slide 1: Nutrition */}
                    <div className={`phone-slide ${activeSlide === 1 ? 'slide-active' : ''}`}>
                      <div className="mini-app-header">🥗 Smart Meal Plan</div>
                      <div className="mini-app-body">
                        <div className="mini-calories-progress">
                          <div className="progress-ring-mini">
                            <span className="progress-calories">1,850</span>
                            <span className="progress-target">/ 2,200 kcal</span>
                          </div>
                        </div>
                        <div className="mini-macros-row">
                          <div className="macro-bar-wrap"><div className="macro-bar p-bar" style={{width: '85%'}}></div><span>Pro: 140g</span></div>
                          <div className="macro-bar-wrap"><div className="macro-bar c-bar" style={{width: '75%'}}></div><span>Carb: 180g</span></div>
                          <div className="macro-bar-wrap"><div className="macro-bar f-bar" style={{width: '90%'}}></div><span>Fat: 65g</span></div>
                        </div>
                        <div className="mini-meals-list">
                          <div className="mini-meal-item">🥞 Breakfast: Oats & Whey</div>
                          <div className="mini-meal-item">🍗 Lunch: Chicken & Salad</div>
                        </div>
                      </div>
                    </div>

                    {/* Slide 2: Coaching */}
                    <div className={`phone-slide ${activeSlide === 2 ? 'slide-active' : ''}`}>
                      <div className="mini-app-header">🎯 Coach Portal</div>
                      <div className="mini-app-body">
                        <div className="mini-trainer-info">
                          <strong>Fitengineers Coach</strong>
                          <span>Active Clients: 14</span>
                        </div>
                        <div className="mini-client-card on-track">
                          <div className="mini-client-header">
                            <span className="client-avatar">👤</span>
                            <div className="client-details">
                              <strong>Subodh Mankala</strong>
                              <span>Goal: Fat Loss</span>
                            </div>
                          </div>
                          <div className="client-status-badge">ON TRACK</div>
                        </div>
                        <div className="mini-client-card active-workout">
                          <div className="mini-client-header">
                            <span className="client-avatar">👤</span>
                            <div className="client-details">
                              <strong>lilswaaggg</strong>
                              <span>Workout Logged</span>
                            </div>
                          </div>
                          <div className="client-status-badge blue">5m ago</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Carousel Caption Text */}
            <div className="carousel-caption-area">
              <p className="carousel-text">
                {activeSlide === 0 && "Log your workouts easily, all in one place."}
                {activeSlide === 1 && "Eat smart with personalized nutrition & macro targets."}
                {activeSlide === 2 && "Coaches: Manage programs & track client progress."}
              </p>
              <div className="carousel-dots">
                <span className={`carousel-dot ${activeSlide === 0 ? 'active' : ''}`} onClick={() => setActiveSlide(0)}></span>
                <span className={`carousel-dot ${activeSlide === 1 ? 'active' : ''}`} onClick={() => setActiveSlide(1)}></span>
                <span className={`carousel-dot ${activeSlide === 2 ? 'active' : ''}`} onClick={() => setActiveSlide(2)}></span>
              </div>
            </div>
          </div>

          {/* Right/Bottom Side: Forms & Actions Card */}
          <div className="portal-right-panel">
            {!showAuthForm ? (
              <div className="account-selection-container animate-fade-in">
                <h3 className="portal-selection-heading">Select account to log in to Fitengineers</h3>
                
                <div className="account-select-card" onClick={() => {
                  setUserType('client');
                  setAuthTab('login');
                  setShowAuthForm(true);
                  setAuthError('');
                }}>
                  <div className="account-card-avatar client-avatar-bg">👤</div>
                  <div className="account-card-info">
                    <strong>Log in as Client</strong>
                    <span>Track workouts, diets & metrics</span>
                  </div>
                  <div className="account-card-arrow">⋮</div>
                </div>

                <div className="account-select-card" onClick={() => {
                  setUserType('coach');
                  setAuthTab('login');
                  setShowAuthForm(true);
                  setAuthError('');
                }}>
                  <div className="account-card-avatar coach-avatar-bg">🏋️</div>
                  <div className="account-card-info">
                    <strong>Log in as Coach</strong>
                    <span>Manage clients, workouts & plans</span>
                  </div>
                  <div className="account-card-arrow">⋮</div>
                </div>

                <button type="button" className="guest-bypass-btn-new" onClick={() => setStep(1)}>
                  Skip & Continue as Guest ➔
                </button>

                <div className="portal-signup-footer">
                  New to Fitengineers? <span className="signup-highlight-link" onClick={() => {
                    setUserType('client');
                    setAuthTab('register');
                    setShowAuthForm(true);
                    setAuthError('');
                  }}>Sign up</span>
                </div>
              </div>
            ) : (
              <div className="credentials-form-container animate-slide-in">
                <div className="form-header-row">
                  <button type="button" className="form-back-arrow-btn" onClick={() => setShowAuthForm(false)}>
                    ← Back
                  </button>
                  
                  {/* Role Toggle Tab inside the form */}
                  <div className="form-role-toggle">
                    <button 
                      type="button" 
                      className={`role-toggle-btn ${userType === 'client' ? 'active-client' : ''}`}
                      onClick={() => setUserType('client')}
                    >
                      Client
                    </button>
                    <button 
                      type="button" 
                      className={`role-toggle-btn ${userType === 'coach' ? 'active-coach' : ''}`}
                      onClick={() => setUserType('coach')}
                    >
                      Coach
                    </button>
                  </div>
                </div>

                {/* Inner Auth Tabs */}
                <div className="inner-auth-tabs">
                  <button
                    type="button"
                    className={`inner-tab ${authTab === 'login' ? 'inner-tab-active' : ''}`}
                    onClick={() => { setAuthTab('login'); setAuthError(''); }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`inner-tab ${authTab === 'register' ? 'inner-tab-active' : ''}`}
                    onClick={() => { setAuthTab('register'); setAuthError(''); }}
                  >
                    Create Account
                  </button>
                </div>

                {/* Role badge */}
                <div className={`role-badge ${userType === 'coach' ? 'role-badge-coach' : 'role-badge-client'}`}>
                  {userType === 'coach'
                    ? '🎯 Coach Portal — Manage clients & check-ins'
                    : '💪 Client Portal — Track your workouts & meals'}
                </div>

                {/* Social Logins */}
                <div className="social-login-row">
                  <button
                    type="button"
                    className="social-btn social-google"
                    onClick={async () => {
                      setAuthError('');
                      try {
                        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                          setShowGoogleModal(true);
                        } else {
                          await databaseService.signInWithGoogle();
                        }
                      } catch (err) {
                        setAuthError(err.message || 'Google sign-in failed.');
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                  </button>
                  <button
                    type="button"
                    className="social-btn social-facebook"
                    onClick={() => setAuthError('Facebook login coming soon!')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Facebook
                  </button>
                </div>

                <div className="auth-divider">
                  <span className="auth-divider-line"></span>
                  <span className="auth-divider-text">OR CONTINUE WITH</span>
                  <span className="auth-divider-line"></span>
                </div>

                <form onSubmit={handleAuthSubmit} className="auth-form-new">
                  {authError && <div className="auth-error-banner">❌ {authError}</div>}

                  {authTab === 'register' && (
                    <div className="auth-input-wrap">
                      <label className="auth-label">Full Name</label>
                      <input
                        type="text"
                        className="auth-input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                      />
                    </div>
                  )}

                  <div className="auth-input-wrap">
                    <label className="auth-label">Email Address</label>
                    <input
                      type="email"
                      className="auth-input"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div className="auth-input-wrap">
                    <label className="auth-label">Password</label>
                    <input
                      type="password"
                      className="auth-input"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength="6"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className={`auth-submit-main ${userType === 'coach' ? 'auth-submit-coach' : 'auth-submit-client'}`}
                    disabled={authLoading}
                  >
                    {authLoading
                      ? 'Authenticating...'
                      : authTab === 'login'
                        ? (userType === 'coach' ? '🏋️ Sign In as Coach' : '👤 Sign In as Client')
                        : (userType === 'coach' ? '🏋️ Create Coach Account' : '👤 Create Client Account')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
      
      {step === 1 && (
        <div className="onboarding-step animate-in">
          <h3>Welcome! What's your name?</h3>
          <p className="step-hint">Let's personalize your coaching experience.</p>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Enter your name" 
            autoFocus
          />

          {matchingProfiles.length > 0 && (
            <div className="profile-suggestions-dropdown glass-panel animate-scale-in">
              <div className="suggestions-header">
                <span>✨ Matching Profiles</span>
              </div>
              <div className="suggestions-list">
                {matchingProfiles.map((profile, idx) => (
                  <div key={idx} className="suggestion-item">
                    <div className="suggestion-info">
                      <span className="suggestion-name">{profile.name}</span>
                      <span className="suggestion-meta">{profile.goal} • {profile.weight}kg • {profile.age} yrs</span>
                    </div>
                    <div className="suggestion-actions">
                      <button 
                        type="button" 
                        className="suggestion-btn autofill-btn-sec"
                        onClick={() => {
                          setName(profile.name);
                          setAge(profile.age || '');
                          setHeight(profile.height || '');
                          setWeight(profile.weight || '');
                          setActivity(profile.activity || 'Moderately Active');
                          setGoal(profile.goal || '');
                          setIssue(profile.issue || '');
                          setDiet(profile.diet || '');
                          
                          // Jump to last step for review
                          setStep(TOTAL_STEPS);
                          setMatchingProfiles([]);
                        }}
                        title="Autofill and Review Details"
                      >
                        📝 Autofill
                      </button>
                      <button 
                        type="button" 
                        className="suggestion-btn instant-login-btn"
                        onClick={() => handleInstantLogin(profile)}
                        title="Log in directly to your dashboard"
                      >
                        ⚡ Log In
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="onboarding-divider">or</div>
          <button 
            type="button" 
            className="gmail-login-btn"
            onClick={async () => {
              setAuthError('');
              try {
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                  setShowGoogleModal(true);
                } else {
                  await databaseService.signInWithGoogle();
                }
              } catch (err) {
                setAuthError(err.message || 'Google OAuth failed.');
              }
            }}
          >
            <div className="google-icon-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            Continue with Google
          </button>
        </div>
      )}
      
      {step === 2 && (
        <div className="onboarding-step animate-in">
          <h3>Tell us about yourself</h3>
          <p className="step-hint">We use these to calculate your custom BMR and macro metrics.</p>
          <div className="input-group-row">
            <div className="input-field">
              <label>Age (years)</label>
              <input 
                type="number" 
                value={age} 
                onChange={e => setAge(e.target.value)} 
                placeholder="25" 
                min="10"
                max="100"
              />
            </div>
            <div className="input-field">
              <label>Height (cm)</label>
              <input 
                type="number" 
                value={height} 
                onChange={e => setHeight(e.target.value)} 
                placeholder="175" 
                min="100"
                max="250"
              />
            </div>
          </div>
          <div className="input-field mt-2">
            <label>Weight (kg)</label>
            <input 
              type="number" 
              value={weight} 
              onChange={e => setWeight(e.target.value)} 
              placeholder="72.5" 
              step="0.1"
              min="30"
              max="250"
            />
          </div>
        </div>
      )}
      
      {step === 3 && (
        <div className="onboarding-step animate-in">
          <h3>What's your physical activity level?</h3>
          <p className="step-hint">This calibrates your daily maintenance TDEE score.</p>
          <button 
            className={`select-btn ${activity === 'Sedentary' ? 'selected' : ''}`}
            onClick={() => setActivity('Sedentary')}
          >
            <strong>Sedentary</strong>
            <span className="btn-desc">Little or no weekly exercise</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Lightly Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Lightly Active')}
          >
            <strong>Lightly Active</strong>
            <span className="btn-desc">Light exercise/sports 1-3 days/week</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Moderately Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Moderately Active')}
          >
            <strong>Moderately Active</strong>
            <span className="btn-desc">Moderate exercise/sports 3-5 days/week</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Very Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Very Active')}
          >
            <strong>Very Active</strong>
            <span className="btn-desc">Hard training/sports 6-7 days/week</span>
          </button>
        </div>
      )}
      
      {step === 4 && (
        <div className="onboarding-step animate-in">
          <h3>What is your primary fitness goal?</h3>
          <p className="step-hint">This defines the calorie offset and workout direction (Select all that apply).</p>
          <button 
            className={`select-btn ${goal.includes('Fat Loss') ? 'selected' : ''}`}
            onClick={() => handleToggleGoal('Fat Loss')}
          >
            <strong>🔥 Fat Loss</strong>
            <span className="btn-desc">Stay in caloric deficit & retain lean mass</span>
          </button>
          <button 
            className={`select-btn ${goal.includes('Gut Fix') ? 'selected' : ''}`}
            onClick={() => handleToggleGoal('Gut Fix')}
          >
            <strong>🌱 Gut Fix</strong>
            <span className="btn-desc">Fix acidity, bloating & restore gut microbiome</span>
          </button>
          <button 
            className={`select-btn ${goal.includes('Muscle Building') ? 'selected' : ''}`}
            onClick={() => handleToggleGoal('Muscle Building')}
          >
            <strong>💪 Muscle Building</strong>
            <span className="btn-desc">Achieve anabolic surplus & progressive overload</span>
          </button>
        </div>
      )}
      
      {step === 5 && (
        <div className="onboarding-step animate-in">
          <h3>Any metabolic or digestive challenges?</h3>
          <p className="step-hint">Helps tailor daily checklist alerts and warnings (Select all that apply).</p>
          <button 
            className={`select-btn ${issue.includes('Bloating') ? 'selected' : ''}`}
            onClick={() => handleToggleIssue('Bloating')}
          >
            🎈 Bloating (frequent gas or fullness)
          </button>
          <button 
            className={`select-btn ${issue.includes('Acidity') ? 'selected' : ''}`}
            onClick={() => handleToggleIssue('Acidity')}
          >
            🔥 Acidity & Heartburn
          </button>
          <button 
            className={`select-btn ${issue.includes('Constipation') ? 'selected' : ''}`}
            onClick={() => handleToggleIssue('Constipation')}
          >
            🐢 Constipation / Sluggish digestion
          </button>
          <button 
            className={`select-btn ${issue.includes('None') ? 'selected' : ''}`}
            onClick={() => handleToggleIssue('None')}
          >
            ✨ None / Just want to stay fit
          </button>
        </div>
      )}

      {step === 6 && (
        <div className="onboarding-step animate-in">
          <h3>What's your dietary preference?</h3>
          <p className="step-hint">We'll build your entire meal plan around this. You can always toggle it later.</p>

          <button
            className={`select-btn diet-card ${diet === 'Vegetarian' ? 'selected diet-veg-selected' : ''}`}
            onClick={() => setDiet('Vegetarian')}
          >
            <div className="diet-card-inner">
              <span className="diet-icon">🥦</span>
              <div className="diet-card-text">
                <strong>Vegetarian</strong>
                <span className="btn-desc">Paneer, dal, tofu, eggs, legumes, dairy</span>
              </div>
              <span className="diet-dot veg-dot">🟢</span>
            </div>
          </button>

          <button
            className={`select-btn diet-card ${diet === 'Non-Vegetarian' ? 'selected diet-nonveg-selected' : ''}`}
            onClick={() => setDiet('Non-Vegetarian')}
          >
            <div className="diet-card-inner">
              <span className="diet-icon">🍗</span>
              <div className="diet-card-text">
                <strong>Non-Vegetarian</strong>
                <span className="btn-desc">Chicken, fish, eggs, paneer, meat sources</span>
              </div>
              <span className="diet-dot nonveg-dot">🔴</span>
            </div>
          </button>

          <div className="diet-note">
            🔒 Your meals, macros & portions will be auto-personalized based on this preference.
          </div>
        </div>
      )}
      
      {step > 0 && (
        <div className="onboarding-actions" style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '400px', marginTop: '32px' }}>
          {(step > 1 || (step === 1 && isSupabaseConfigured)) && (
            <button 
              type="button"
              className="btn-back"
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.02)',
                color: '#94a3b8',
                fontWeight: '600',
                fontSize: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={handleBack}
            >
              ← Back
            </button>
          )}
          <button 
            className="btn-next" 
            style={{ 
              flex: (step > 1 || (step === 1 && isSupabaseConfigured)) ? 2 : 1, 
              marginTop: 0,
              width: '100%'
            }}
            onClick={handleNext}
            disabled={
              (step === 1 && !name.trim()) ||
              (step === 2 && (!age || !height || !weight)) ||
              (step === 3 && !activity) ||
              (step === 4 && !goal) ||
              (step === 5 && !issue) ||
              (step === 6 && !diet)
            }
          >
            {step === TOTAL_STEPS ? "🚀 Let's Personalize App!" : "Next Step ➔"}
          </button>
        </div>
      )}
      {showGoogleModal && (
        <div className="google-auth-backdrop">
          <div className="google-auth-modal animate-scale-in">
            <div className="google-modal-header">
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="google-auth-logo" alt="Google Logo" />
              <h4>Sign in with Google</h4>
              <p>to continue to Fitengineers</p>
            </div>
            
            <div className="google-accounts-list">
              {googleAccounts.map((account, idx) => (
                <div 
                  key={idx} 
                  className="google-account-row"
                  onClick={() => handleGoogleAccountSelect(account.profile, account.email)}
                >
                  <div className="account-avatar" style={{ backgroundColor: account.avatarColor }}>
                    {account.avatarLetter}
                  </div>
                  <div className="account-info">
                    <strong>{account.name}</strong>
                    <span>{account.email}</span>
                  </div>
                </div>
              ))}

              <div 
                className="google-account-row"
                onClick={() => {
                  setShowGoogleModal(false);
                  setStep(0);
                  setShowAuthForm(true);
                  setAuthTab('register');
                  setUserType('client');
                  setAuthError('');
                }}
              >
                <div className="account-avatar font-gray">
                  ＋
                </div>
                <div className="account-info">
                  <strong>Use another account</strong>
                  <span>Sign in with a different Google account</span>
                </div>
              </div>
            </div>

            <div className="google-modal-footer">
              <p>To continue, Google will share your name, email address, language preference, and profile picture with Fitengineers.</p>
              <button 
                type="button" 
                className="google-close-btn"
                onClick={() => setShowGoogleModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
