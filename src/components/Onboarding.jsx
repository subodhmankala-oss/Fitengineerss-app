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
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAuthForm, setShowAuthForm] = useState(false);

  // OTP Login States
  const [loginMethod, setLoginMethod] = useState('phone'); // 'phone' or 'email'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    if (!phoneNumber.trim()) {
      setAuthError('Please enter a valid phone number.');
      return;
    }
    setOtpLoading(true);
    setAuthError('');
    setTimeout(() => {
      setOtpLoading(false);
      setOtpSent(true);
      setOtpTimer(59);
      console.log('Mock OTP Sent: 123456');
    }, 1000);
  };

  useEffect(() => {
    let interval = null;
    if (otpSent && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [otpSent, otpTimer]);

  const handleVerifyOTP = async (e) => {
    if (e) e.preventDefault();
    if (otpCode.trim() !== '123456' && otpCode.trim() !== '654321' && otpCode.trim() !== '111111') {
      setAuthError('Invalid OTP code. (For testing, use 123456)');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      // Clean phone number (leave only digits and + symbol)
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
      const defaultEmail = `${cleanPhone}@fitengineers.com`;
      
      let profile = null;
      let matchedEmail = defaultEmail;

      if (isSupabaseConfigured && databaseService.supabase) {
        try {
          const { data, error } = await databaseService.supabase
            .from('users')
            .select('*')
            .eq('phone', cleanPhone)
            .maybeSingle();
          if (data) {
            profile = {
              id: data.id,
              userName: data.full_name,
              userAge: String(data.age),
              userHeight: String(data.height_cm),
              userWeight: String(data.weight_kg),
              userActivity: data.activity_level,
              userGoal: data.fitness_goal,
              userDiet: data.dietary_preference,
              role: data.role,
              phone: data.phone,
              brand: data.brand,
              payment_status: data.payment_status,
              coach_id: data.coach_id
            };
            matchedEmail = data.email;
          }
        } catch(e) {
          console.error('Supabase lookup failed:', e);
        }
      }

      if (!profile) {
        // Offline check for coaches list
        const cachedCoaches = localStorage.getItem('coaches_list');
        if (cachedCoaches) {
          try {
            const coaches = JSON.parse(cachedCoaches);
            const matchedCoach = coaches.find(c => c.phone === cleanPhone || c.phone === cleanPhone.replace('+91', ''));
            if (matchedCoach) {
              profile = {
                id: matchedCoach.id,
                userName: matchedCoach.name,
                role: matchedCoach.email === 'trainer@fitengineers.com' || matchedCoach.email === 'subodhmankala@gmail.com' ? 'super-admin' : 'coach',
                phone: cleanPhone,
                brand: matchedCoach.brand
              };
              matchedEmail = matchedCoach.email;
            }
          } catch(e) {}
        }
        
        // Fallback hardcoded defaults if not in list
        if (!profile) {
          if (cleanPhone === '9999999999' || cleanPhone === '+919999999999') {
            profile = {
              id: 'coach-subodh',
              userName: 'Coach Subodh',
              role: 'super-admin',
              phone: cleanPhone,
              brand: 'Fit Engineers'
            };
            matchedEmail = 'trainer@fitengineers.com';
          } else if (cleanPhone === '9876543210' || cleanPhone === '+919876543210') {
            profile = {
              id: 'coach-ravi',
              userName: 'Coach Ravi',
              role: 'coach',
              phone: cleanPhone,
              brand: 'Ravi Fitness'
            };
            matchedEmail = 'ravi@fitengineers.com';
          }
        }
      }

      if (!profile) {
        // Local storage lookup by phone (for clients)
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('client_')) {
            const clientKey = key.split('_')[1];
            const pKey = `client_${clientKey}_`;
            const phone = localStorage.getItem(`${pKey}userPhone`);
            if (phone === cleanPhone) {
              profile = {
                userName: localStorage.getItem(`${pKey}userName`) || '',
                userAge: localStorage.getItem(`${pKey}userAge`) || '',
                userHeight: localStorage.getItem(`${pKey}userHeight`) || '',
                userWeight: localStorage.getItem(`${pKey}userWeight`) || '',
                userActivity: localStorage.getItem(`${pKey}userActivity`) || '',
                userGoal: localStorage.getItem(`${pKey}userGoal`) || '',
                userDiet: localStorage.getItem(`${pKey}userDiet`) || '',
                role: localStorage.getItem(`${pKey}userRole`) || 'client',
                phone: phone,
                coach_id: localStorage.getItem(`${pKey}userCoachId`) || ''
              };
              matchedEmail = localStorage.getItem(`${pKey}userEmail`) || defaultEmail;
              break;
            }
          }
        }
      }

      const isCoachRole = profile && (profile.role === 'coach' || profile.role === 'super-admin');
      const hasCompleteProfile = isCoachRole || (profile && 
                                 profile.userName && 
                                 profile.userAge && profile.userAge !== 'null' && profile.userAge !== 'NaN' && profile.userAge !== '' &&
                                 profile.userHeight && profile.userHeight !== 'null' && profile.userHeight !== 'NaN' && profile.userHeight !== '' &&
                                 profile.userWeight && profile.userWeight !== 'null' && profile.userWeight !== 'NaN' && profile.userWeight !== '');

      if (profile && hasCompleteProfile) {
        await databaseService.loadProfileIntoLocalStorage(profile, matchedEmail);
        onComplete();
      } else {
        localStorage.setItem('userEmail', matchedEmail);
        localStorage.setItem('userPhone', cleanPhone);
        localStorage.setItem('userRole', profile?.role || userType);
        if (profile && profile.userName) {
          localStorage.setItem('userName', profile.userName);
          if (isCoachRole) {
            onComplete();
          } else {
            setStep(2);
          }
        } else {
          setStep(1);
        }
      }
    } catch(err) {
      setAuthError('OTP Verification failed: ' + err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Saved accounts for quick login
  const [savedAccounts, setSavedAccounts] = useState(() => {
    const accounts = [];

    // Seed default coach account if savedEmailAccounts is empty or not initialized
    const savedEmailAccountsRaw = localStorage.getItem('savedEmailAccounts');
    let savedEmailAccounts = [];
    if (savedEmailAccountsRaw) {
      try {
        savedEmailAccounts = JSON.parse(savedEmailAccountsRaw);
      } catch(e) {}
    } else {
      // Seed default coach login
      savedEmailAccounts = [
        {
          type: 'coach',
          email: 'coach@fitengineers.com',
          password: 'password123',
          name: 'Coach Subodh',
          initials: 'CS',
          color: '#ea4335'
        }
      ];
      localStorage.setItem('savedEmailAccounts', JSON.stringify(savedEmailAccounts));
    }

    // Process email accounts
    savedEmailAccounts.forEach(acct => {
      accounts.push({
        type: acct.type,
        email: acct.email,
        password: acct.password,
        name: acct.name,
        initials: acct.initials,
        color: acct.color,
      });
    });

    // Check for saved client profiles
    const profilesSeen = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('profile_')) {
        try {
          const profile = JSON.parse(localStorage.getItem(key));
          if (profile && profile.name && !profilesSeen.has(profile.name)) {
            profilesSeen.add(profile.name);
            const initials = profile.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];
            const colorIdx = profile.name.charCodeAt(0) % colors.length;
            accounts.push({
              type: 'client-local',
              name: profile.name,
              initials,
              color: colors[colorIdx],
              profile
            });
          }
        } catch(e) {}
      }
    }
    return accounts;
  });

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (authTab === 'login') {
        await databaseService.signIn(authEmail, authPassword);
        localStorage.setItem('rememberedEmail', authEmail);
        localStorage.setItem('rememberedPassword', authPassword);
        
        // Update savedEmailAccounts list
        const isCoachEmail = ['subodhmankala@gmail.com', 'trainer@fitengineers.com', 'coach@fitengineers.com'].includes(authEmail.toLowerCase());
        const newSavedAcct = {
          type: isCoachEmail ? 'coach' : 'client-email',
          email: authEmail,
          password: authPassword,
          name: authEmail.split('@')[0].toUpperCase(),
          initials: authEmail[0].toUpperCase(),
          color: isCoachEmail ? '#ea4335' : '#8b5cf6'
        };
        const existingRaw = localStorage.getItem('savedEmailAccounts');
        let savedList = [];
        try {
          savedList = existingRaw ? JSON.parse(existingRaw) : [];
        } catch(err) {}
        savedList = savedList.filter(a => a.email.toLowerCase() !== authEmail.toLowerCase());
        savedList.unshift(newSavedAcct);
        localStorage.setItem('savedEmailAccounts', JSON.stringify(savedList));

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

        // Update savedEmailAccounts
        const isCoachEmail = ['subodhmankala@gmail.com', 'trainer@fitengineers.com', 'coach@fitengineers.com'].includes(authEmail.toLowerCase());
        const newSavedAcct = {
          type: isCoachEmail ? 'coach' : 'client-email',
          email: authEmail,
          password: authPassword,
          name: name.trim(),
          initials: name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2),
          color: isCoachEmail ? '#ea4335' : '#8b5cf6'
        };
        const existingRaw = localStorage.getItem('savedEmailAccounts');
        let savedList = [];
        try {
          savedList = existingRaw ? JSON.parse(existingRaw) : [];
        } catch(err) {}
        savedList = savedList.filter(a => a.email.toLowerCase() !== authEmail.toLowerCase());
        savedList.unshift(newSavedAcct);
        localStorage.setItem('savedEmailAccounts', JSON.stringify(savedList));

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

    // Check if the current user is a coach
    const isCoach = localStorage.getItem('userRole') === 'coach' || localStorage.getItem('userRole') === 'super-admin' || userType === 'coach';
    if (step === 1 && isCoach) {
      const cleanName = name.trim();
      localStorage.setItem('userName', cleanName);
      databaseService.saveUserProfile({
        userName: cleanName,
        email: localStorage.getItem('userEmail'),
        phone: localStorage.getItem('userPhone'),
        role: localStorage.getItem('userRole') || 'coach'
      });
      onComplete();
      return;
    }

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
            <div className="credentials-form-container animate-slide-in" style={{ padding: '24px 20px' }}>
              
              {/* Role Toggle Tab */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h4 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>Welcome to Fitengineers</h4>
                <div className="form-role-toggle" style={{ margin: 0 }}>
                  <button 
                    type="button" 
                    className={`role-toggle-btn ${userType === 'client' ? 'active-client' : ''}`}
                    onClick={() => { setUserType('client'); setAuthError(''); setOtpSent(false); }}
                  >
                    Client
                  </button>
                  <button 
                    type="button" 
                    className={`role-toggle-btn ${userType === 'coach' ? 'active-coach' : ''}`}
                    onClick={() => { setUserType('coach'); setAuthError(''); setOtpSent(false); }}
                  >
                    Coach
                  </button>
                </div>
              </div>

              {/* Login Method Tabs */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px', marginBottom: '18px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '8px', border: 'none', background: loginMethod === 'phone' ? (userType === 'coach' ? '#10b981' : 'var(--primary-accent-light)') : 'transparent',
                    color: '#fff', fontWeight: 700, fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => { setLoginMethod('phone'); setAuthError(''); }}
                >
                  📱 Phone + OTP
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '8px', border: 'none', background: loginMethod === 'email' ? (userType === 'coach' ? '#10b981' : 'var(--primary-accent-light)') : 'transparent',
                    color: '#fff', fontWeight: 700, fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onClick={() => { setLoginMethod('email'); setAuthError(''); }}
                >
                  ✉️ Email + Password
                </button>
              </div>

              {authError && <div className="auth-error-banner" style={{ marginBottom: '14px' }}>❌ {authError}</div>}

              {/* PHONE + OTP LOGIN FLOW */}
              {loginMethod === 'phone' && (
                <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {!otpSent ? (
                    <>
                      <div className="auth-input-wrap">
                        <label className="auth-label">Phone Number (Primary)</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{
                            padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center'
                          }}>🇮🇳 +91</span>
                          <input
                            type="tel"
                            className="auth-input"
                            style={{ flex: 1 }}
                            value={phoneNumber}
                            onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="Enter 10-digit number"
                            required
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className={`auth-submit-main ${userType === 'coach' ? 'auth-submit-coach' : 'auth-submit-client'}`}
                        disabled={otpLoading}
                      >
                        {otpLoading ? 'Sending OTP...' : 'Send OTP Verification Code'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="auth-input-wrap">
                        <label className="auth-label">Enter 6-Digit OTP</label>
                        <input
                          type="text"
                          className="auth-input"
                          value={otpCode}
                          onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="e.g. 123456"
                          style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.2rem', fontWeight: 800 }}
                          required
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.72rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Sent to +91 {phoneNumber}</span>
                          {otpTimer > 0 ? (
                            <span style={{ color: 'var(--text-subtle)' }}>Resend in {otpTimer}s</span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleSendOTP}
                              style={{ background: 'none', border: 'none', color: 'var(--primary-accent-light)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                            >
                              Resend OTP
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="submit"
                        className={`auth-submit-main ${userType === 'coach' ? 'auth-submit-coach' : 'auth-submit-client'}`}
                        disabled={authLoading}
                      >
                        {authLoading ? 'Verifying...' : 'Verify & Continue ➔'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem',
                          cursor: 'pointer', textAlign: 'center', alignSelf: 'center', textDecoration: 'underline'
                        }}
                      >
                        Change Phone Number
                      </button>
                    </>
                  )}
                </form>
              )}

              {/* EMAIL & PASSWORD LOGIN FLOW */}
              {loginMethod === 'email' && (
                <form onSubmit={handleAuthSubmit} className="auth-form-new" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* Signup Header Tab for Email login */}
                  <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <button
                      type="button"
                      className={`inner-tab ${authTab === 'login' ? 'inner-tab-active' : ''}`}
                      onClick={() => { setAuthTab('login'); setAuthError(''); }}
                      style={{ flex: 1, paddingBottom: '6px' }}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      className={`inner-tab ${authTab === 'register' ? 'inner-tab-active' : ''}`}
                      onClick={() => { setAuthTab('register'); setAuthError(''); }}
                      style={{ flex: 1, paddingBottom: '6px' }}
                    >
                      Create Account
                    </button>
                  </div>

                  {authTab === 'register' && (
                    <div className="auth-input-wrap">
                      <label className="auth-label">Full Name</label>
                      <input
                        type="text"
                        className="auth-input"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Enter your name"
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
                      placeholder="example@gmail.com"
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
              )}

              {/* Guest and Quick Bypass for clients */}
              {userType === 'client' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  <button type="button" className="guest-bypass-btn-new" onClick={() => setStep(1)} style={{ width: '100%', margin: 0 }}>
                    Skip & Continue as Guest →
                  </button>
                </div>
              )}

              {/* Saved accounts ONLY for Coach login */}
              {userType === 'coach' && savedAccounts.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                  <div style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '8px'
                  }}>Quick Coach Logins</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {savedAccounts.filter(a => a.type === 'coach').map((acct, idx) => (
                      <div
                        key={idx}
                        onClick={async () => {
                          try {
                            setAuthLoading(true);
                            await databaseService.signIn(acct.email, acct.password);
                            const profile = await databaseService.getUserProfileByEmail(acct.email);
                            if (profile) {
                              await databaseService.loadProfileIntoLocalStorage(profile, acct.email);
                            } else {
                              localStorage.setItem('userEmail', acct.email);
                              localStorage.setItem('userName', acct.name);
                              localStorage.setItem('onboardingComplete', 'true');
                            }
                            onComplete();
                          } catch(e) {
                            setAuthError('Quick login failed: ' + (e.message || 'Please use form.'));
                          } finally {
                            setAuthLoading(false);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      >
                        <div style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          background: acct.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '0.75rem', color: '#fff',
                          flexShrink: 0
                        }}>{acct.initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {acct.name}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--primary-accent-light)', fontWeight: 700 }}>Log in →</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
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
