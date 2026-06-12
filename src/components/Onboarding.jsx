import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured } from '../services/databaseService';
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
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem('rememberedEmail') || '');
  const [authPassword, setAuthPassword] = useState(() => localStorage.getItem('rememberedPassword') || '');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

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

        if (hasCompleteProfile) {
          await databaseService.loadProfileIntoLocalStorage(profile, authEmail);
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
    if (goalVal === 'Fat Loss') {
      calorieTarget = Math.round(tdee - 500);
      if (calorieTarget < 1200) calorieTarget = 1200;
    } else if (goalVal === 'Muscle Building') {
      calorieTarget = Math.round(tdee + 300);
    }

    calorieTarget = Math.round(calorieTarget / 50) * 50;

    let proteinRatio = 0.30;
    let carbsRatio = 0.40;
    let fatsRatio = 0.30;

    if (goalVal === 'Fat Loss') {
      proteinRatio = 0.35;
      carbsRatio = 0.35;
      fatsRatio = 0.30;
    } else if (goalVal === 'Muscle Building') {
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

  const handleInstantLogin = (profile) => {
    const cleanName = profile.name.trim();
    const targets = calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal);

    localStorage.setItem('userName', cleanName);
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

  const handleGoogleAccountSelect = (account) => {
    setShowGoogleModal(false);
    handleInstantLogin(account);
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
      <div className="onboarding-header">
        <img src="/logo.png" className="onboarding-logo" alt="Fitengineers Logo" />
        <h2 className="glow-text">
          {step === 0 ? "Fitengineers Portal" : "Fitengineers App Setup"}
        </h2>
        {step > 0 && (
          <>
            <div className="step-bar">
              <div className="step-progress" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}></div>
            </div>
            <div className="step-counter">Step {step} of {TOTAL_STEPS}</div>
          </>
        )}
      </div>

      {step === 0 && (
        <div className="onboarding-step auth-step animate-in">
          <div className="auth-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button 
              type="button"
              className={`select-btn ${authTab === 'login' ? 'selected' : ''}`}
              style={{ flex: 1, padding: '12px', margin: 0 }}
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button 
              type="button"
              className={`select-btn ${authTab === 'register' ? 'selected' : ''}`}
              style={{ flex: 1, padding: '12px', margin: 0 }}
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="auth-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {authError && (
              <div className="auth-error-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                ❌ {authError}
              </div>
            )}
            
            {authTab === 'register' && (
              <div className="input-field">
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Full Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Enter your name" 
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: '0.95rem' }}
                  required
                />
              </div>
            )}

            <div className="input-field">
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Email Address</label>
              <input 
                type="email" 
                value={authEmail} 
                onChange={e => setAuthEmail(e.target.value)} 
                placeholder="you@example.com" 
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: '0.95rem' }}
                required
              />
            </div>

            <div className="input-field">
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Password</label>
              <input 
                type="password" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                placeholder="••••••••" 
                minLength="6"
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: '0.95rem' }}
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn-next auth-submit-btn" 
              style={{ width: '100%', marginTop: '12px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
              disabled={authLoading}
            >
              {authLoading ? "Authenticating..." : authTab === 'login' ? "Sign In" : "Register & Continue"}
            </button>
          </form>

          <div className="onboarding-divider" style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-subtle)', fontSize: '0.8rem' }}>
            <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></span>
            <span style={{ padding: '0 10px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>or</span>
            <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></span>
          </div>

          <button 
            type="button" 
            className="gmail-login-btn oauth-btn"
            style={{ width: '100%', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
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
            Sign In with Google
          </button>

          <button 
            type="button" 
            className="guest-bypass-btn"
            style={{
              width: '100%',
              padding: '14px',
              marginTop: '16px',
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
            onClick={() => setStep(1)}
          >
            Skip & Continue as Guest ➔
          </button>
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
          <p className="step-hint">This defines the calorie offset and workout direction.</p>
          <button 
            className={`select-btn ${goal === 'Fat Loss' ? 'selected' : ''}`}
            onClick={() => setGoal('Fat Loss')}
          >
            <strong>🔥 Fat Loss</strong>
            <span className="btn-desc">Stay in caloric deficit & retain lean mass</span>
          </button>
          <button 
            className={`select-btn ${goal === 'Gut Fix' ? 'selected' : ''}`}
            onClick={() => setGoal('Gut Fix')}
          >
            <strong>🌱 Gut Fix</strong>
            <span className="btn-desc">Fix acidity, bloating & restore gut microbiome</span>
          </button>
          <button 
            className={`select-btn ${goal === 'Muscle Building' ? 'selected' : ''}`}
            onClick={() => setGoal('Muscle Building')}
          >
            <strong>💪 Muscle Building</strong>
            <span className="btn-desc">Achieve anabolic surplus & progressive overload</span>
          </button>
        </div>
      )}
      
      {step === 5 && (
        <div className="onboarding-step animate-in">
          <h3>Any metabolic or digestive challenges?</h3>
          <p className="step-hint">Helps tailor daily checklist alerts and warnings.</p>
          <button 
            className={`select-btn ${issue === 'Bloating' ? 'selected' : ''}`}
            onClick={() => setIssue('Bloating')}
          >
            🎈 Bloating (frequent gas or fullness)
          </button>
          <button 
            className={`select-btn ${issue === 'Acidity' ? 'selected' : ''}`}
            onClick={() => setIssue('Acidity')}
          >
            🔥 Acidity & Heartburn
          </button>
          <button 
            className={`select-btn ${issue === 'Constipation' ? 'selected' : ''}`}
            onClick={() => setIssue('Constipation')}
          >
            🐢 Constipation / Sluggish digestion
          </button>
          <button 
            className={`select-btn ${issue === 'None' ? 'selected' : ''}`}
            onClick={() => setIssue('None')}
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
                  onClick={() => handleGoogleAccountSelect(account.profile)}
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
                  const customName = prompt("Enter your full name for Google Account:");
                  if (customName && customName.trim()) {
                    const cleanName = customName.trim();
                    const customProfile = {
                      name: cleanName,
                      age: '28',
                      height: '175',
                      weight: '70',
                      activity: 'Moderately Active',
                      goal: 'Fat Loss',
                      issue: 'None',
                      diet: 'Vegetarian'
                    };
                    handleGoogleAccountSelect(customProfile);
                  }
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
