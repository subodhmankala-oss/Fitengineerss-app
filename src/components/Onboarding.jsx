import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured, isTrainer, TRAINER_EMAILS } from '../services/databaseService';
import { calculateTargetsGeneric } from '../utils/targets';
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
    if (localStorage.getItem('pendingCoachApply') === 'true') return 0;
    if (localStorage.getItem('userEmail')) {
      const storedName = localStorage.getItem('userName');
      // A returning client whose name we already know but who hasn't finished
      // the one-time onboarding wizard yet (onboardingCompleted gate handles
      // the "already done" case before Onboarding even mounts).
      return storedName ? 'wizard' : 1;
    }
    return isSupabaseConfigured ? 0 : 1;
  });
  const [name, setName] = useState(() => localStorage.getItem('userName') || '');
  const [wizardPrefill, setWizardPrefill] = useState(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  // Which tab opened the (localhost-only) Google account picker modal — the
  // modal itself has no other way to know whether to route the selection
  // through the client path or finishCoachGoogleLogin.
  const [googleModalIntent, setGoogleModalIntent] = useState('client');
  const [matchingProfiles, setMatchingProfiles] = useState([]);

  // Authentication States
  const [authTab, setAuthTab] = useState(() =>
    localStorage.getItem('pendingCoachApply') === 'true' ? 'coach_apply' : 'login'
  );
  const [userType, setUserType] = useState(() => {
    if (localStorage.getItem('pendingCoachApply') === 'true') return 'coach';
    // Set by AuthConfirm.jsx after a coach resets their password, so the
    // login screen that follows lands on the Coach tab instead of always
    // defaulting to Client.
    if (localStorage.getItem('lastAuthUserType') === 'coach') return 'coach';
    return 'client';
  });
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem('last_logged_in_email') || '');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAuthForm, setShowAuthForm] = useState(() =>
    localStorage.getItem('pendingCoachApply') === 'true'
  );
  const [showClientEmailForm, setShowClientEmailForm] = useState(false);
  const [forgotPasswordSuccessMsg, setForgotPasswordSuccessMsg] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [coachApplyName, setCoachApplyName] = useState(() => localStorage.getItem('userName') || '');
  const [coachApplyEmail, setCoachApplyEmail] = useState(() => localStorage.getItem('userEmail') || '');
  const [phoneNumber, setPhoneNumber] = useState(() => {
    const saved = localStorage.getItem('userPhone') || '';
    return saved.replace(/^\+91/, '');
  });

  const startCoachGoogleLogin = async () => {
    setAuthError('');
    localStorage.setItem('pendingCoachLogin', 'true');
    try {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setGoogleModalIntent('coach');
        setShowGoogleModal(true);
      } else {
        // Production: real OAuth redirect. App.jsx's onAuthStateChange handler
        // reads the pendingCoachLogin flag set above to route the returning
        // session through the coach path instead of defaulting to client.
        await databaseService.signInWithGoogle();
      }
    } catch (err) {
      localStorage.removeItem('pendingCoachLogin');
      setAuthError(err.message || 'Google OAuth failed.');
    }
  };

  const finishCoachGoogleLogin = async (email, displayName) => {
    localStorage.removeItem('pendingCoachLogin');
    localStorage.setItem('userEmail', email);
    if (displayName) localStorage.setItem('userName', displayName);

    const isHardcodedCoach = TRAINER_EMAILS.includes(email.toLowerCase());
    let profile = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      profile = await databaseService.getUserProfileByEmail(email);
    }
    const userRole = profile?.role || localStorage.getItem('userRole') || '';
    const isApprovedCoach =
      isHardcodedCoach || userRole === 'coach' || userRole === 'super-admin';

    if (isApprovedCoach) {
      if (profile) {
        await databaseService.loadProfileIntoLocalStorage(profile, email);
      } else {
        localStorage.setItem(
          'userRole',
          email.toLowerCase() === 'subodhmankala@gmail.com' ? 'super-admin' : 'coach'
        );
      }
      localStorage.setItem('onboardingComplete', 'true');
      onComplete();
      return;
    }

    if (userRole === 'coach_pending') {
      if (profile) {
        await databaseService.loadProfileIntoLocalStorage(profile, email);
      }
      localStorage.setItem('onboardingComplete', 'true');
      onComplete();
      return;
    }

    localStorage.setItem('pendingCoachApply', 'true');
    setCoachApplyName(displayName || '');
    setCoachApplyEmail(email);
    setUserType('coach');
    setAuthTab('coach_apply');
    setShowAuthForm(true);
    setStep(0);
  };

  useEffect(() => {
    if (localStorage.getItem('pendingCoachApply') === 'true') {
      setUserType('coach');
      setAuthTab('coach_apply');
      setShowAuthForm(true);
      setStep(0);
      const email = localStorage.getItem('userEmail');
      const storedName = localStorage.getItem('userName');
      if (email) setCoachApplyEmail(email);
      if (storedName) setCoachApplyName(storedName);
    }
  }, []);

  // 'wizard' is a sentinel step meaning "name/identity already known, but the
  // one-time onboarding wizard hasn't been completed yet" — hand off straight
  // to App.jsx, which renders ClientOnboardingWizard based on the DB flag.
  useEffect(() => {
    if (step === 'wizard') {
      localStorage.setItem('onboardingCompleted', 'false');
      onComplete();
    }
  }, [step]);

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

  const handleClientEmailLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      let profile = await databaseService.getUserProfileByEmail(authEmail);
      let signInSuccess = false;

      if (profile) {
        // User exists! Try signing in
        if (isSupabaseConfigured && databaseService.supabase) {
          try {
            await databaseService.signIn(authEmail, authPassword);
            signInSuccess = true;
          } catch (signInErr) {
            // Account exists (often from before email confirmation was enforced)
            // but was never actually confirmed — offer a resend instead of the
            // raw "Email not confirmed" error, since the credentials are correct.
            if ((signInErr.message || '').toLowerCase().includes('email not confirmed')) {
              try {
                await databaseService.supabase.auth.resend({ type: 'signup', email: authEmail });
                setAuthSuccessMsg(`Your email isn't confirmed yet. We've resent a confirmation link to ${authEmail} — click it, then log in again.`);
              } catch (resendErr) {
                setAuthSuccessMsg(`Your email isn't confirmed yet. Please check your inbox for the confirmation link, then log in again.`);
              }
              setAuthLoading(false);
              return;
            }
            console.warn("Supabase Sign In failed, checking mock password fallback:", signInErr);
            const mockUsers = databaseService.getMockTable('users');
            const mUser = mockUsers.find(u => u.email.toLowerCase() === authEmail.toLowerCase());
            if (mUser && mUser.password_hash === authPassword) {
              signInSuccess = true;
            } else {
              throw signInErr;
            }
          }
        } else {
          // Local storage verification: check if password matches (simulate password check)
          const mockUsers = databaseService.getMockTable('users');
          const mUser = mockUsers.find(u => u.email.toLowerCase() === authEmail.toLowerCase());
          if (mUser && mUser.password_hash === authPassword) {
            signInSuccess = true;
          } else {
            throw new Error('Invalid email or password.');
          }
        }

        if (signInSuccess) {
          if (profile.onboardingCompleted) {
            // Already finished the one-time wizard on a previous login — straight to the dashboard.
            await databaseService.loadProfileIntoLocalStorage(profile, authEmail);
            onComplete();
          } else {
            // Either no clients row yet, or the wizard was started but never finished —
            // resume it (name is already known, so skip straight past the name/phone step).
            localStorage.setItem('userEmail', authEmail);
            localStorage.setItem('userId', profile.id);
            localStorage.setItem('userRole', 'client');
            if (profile.userName) localStorage.setItem('userName', profile.userName);
            setStep(profile.userName ? 'wizard' : 1);
          }
        } else {
          throw new Error('Invalid email or password.');
        }
      } else {
        // Client accounts are created by their coach — there is no self-serve sign-up.
        throw new Error('No account found with this email. Please check the email address and try again.');
      }
    } catch (err) {
      setAuthError(err.message || 'Client authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleClientForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setForgotPasswordSuccessMsg('');
    setAuthLoading(true);

    const confirmation = "If that email is registered, you'll receive a password reset link shortly.";

    try {
      // Server-side dispatch: /api/request-password-reset generates the recovery
      // link with the service-role key and emails it via Resend's HTTP API,
      // bypassing Supabase's SMTP mailer (which was failing with 500s and the
      // old code hid it by showing the confirmation message unconditionally).
      let resp = null;
      try {
        resp = await fetch('/api/request-password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail.trim().toLowerCase() })
        });
      } catch (networkErr) {
        // Couldn't reach our own API (e.g. offline) — fall through to Supabase.
      }
      if (resp?.ok) {
        setForgotPasswordSuccessMsg(confirmation);
        return;
      }
      if (resp && resp.status !== 404) {
        // The endpoint exists but reported a real send failure — surface it
        // honestly instead of pretending the email went out.
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'We couldn\'t send the reset email right now. Please try again in a few minutes.');
      }
      // 404 / unreachable → running without Vercel functions (local vite dev).

      if (isSupabaseConfigured && databaseService.supabase) {
        const { error } = await databaseService.supabase.auth.resetPasswordForEmail(
          authEmail.trim().toLowerCase(),
          { redirectTo: window.location.origin }
        );
        if (error) throw new Error('We couldn\'t send the reset email right now. Please try again in a few minutes.');
      }
      setForgotPasswordSuccessMsg(confirmation);
    } catch (err) {
      console.error('Forgot password submission error:', err);
      setAuthError(err.message || 'We couldn\'t send the reset email. Please try again later.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCoachEmailLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    // Signal to App.jsx's processSessionUser that a coach-tab login is the authority
    // for this session, so it doesn't race ahead and route by table lookup (which would
    // drop a client-only email into the client wizard and swallow our rejection below).
    // Cleared in the finally block once we've resolved coach vs. error.
    localStorage.setItem('coachLoginInProgress', 'true');
    try {
      let profile = await databaseService.getUserProfileByEmail(authEmail);
      let signInSuccess = false;
      // profile.id is the users.id we need for the coaches lookup below, but a
      // coach's Supabase Auth account can exist (e.g. one they just claimed
      // via "Forgot password?") with no public.users row yet — profile is null
      // in that case. Verify credentials first regardless, then resolve the
      // real auth user id from the sign-in result itself. Previously this
      // rejected with a generic "no account found" message the instant
      // profile was null, before ever checking whether the typed password was
      // actually correct.
      let authUserId = profile?.id || null;

      // Check credentials
      if (isSupabaseConfigured && databaseService.supabase) {
        try {
          const signInResult = await databaseService.signIn(authEmail, authPassword);
          signInSuccess = true;
          if (!authUserId) authUserId = signInResult?.user?.id || null;
        } catch (signInErr) {
          // Coach hasn't confirmed their email yet — offer a resend, same as clients.
          if ((signInErr.message || '').toLowerCase().includes('email not confirmed')) {
            try {
              await databaseService.supabase.auth.resend({ type: 'signup', email: authEmail });
              setAuthSuccessMsg(`Your email isn't confirmed yet. We've resent a confirmation link to ${authEmail} — click it, then log in again.`);
            } catch (resendErr) {
              setAuthSuccessMsg(`Your email isn't confirmed yet. Please check your inbox for the confirmation link, then log in again.`);
            }
            setAuthLoading(false);
            return;
          }
          console.warn("Supabase Coach Sign In failed, checking mock password fallback:", signInErr);
          const mockUsers = databaseService.getMockTable('users');
          const mUser = mockUsers.find(u => u.email.toLowerCase() === authEmail.toLowerCase());
          if (mUser && mUser.password_hash === authPassword) {
            signInSuccess = true;
            authUserId = mUser.id;
          } else {
            setCoachApplyEmail(authEmail);
            throw new Error('No coach account found with this email. If you have a client account, switch to the Client tab — or sign up as a coach.');
          }
        }
      } else {
        // Local storage verification: simulate check
        const mockUsers = databaseService.getMockTable('users');
        const mUser = mockUsers.find(u => u.email.toLowerCase() === authEmail.toLowerCase());
        if (mUser && mUser.password_hash === authPassword) {
          signInSuccess = true;
          authUserId = mUser.id;
        } else {
          setCoachApplyEmail(authEmail);
          throw new Error('No coach account found with this email. If you have a client account, switch to the Client tab — or sign up as a coach.');
        }
      }

      if (signInSuccess) {
        if (!authUserId) {
          throw new Error('Could not verify your account. Please try again.');
        }
        const isSuperAdminEmail = authEmail.toLowerCase() === 'subodhmankala@gmail.com';
        const mockCoaches = databaseService.getMockTable('coaches');

        // Find if coach record exists
        let coachRecord = null;
        if (isSupabaseConfigured && databaseService.supabase) {
          const { data } = await databaseService.supabase
            .from('coaches')
            .select('*')
            .eq('user_id', authUserId)
            .maybeSingle();
          coachRecord = data;
        } else {
          coachRecord = mockCoaches.find(c => c.user_id === authUserId);
        }

        if (isSuperAdminEmail) {
          // Super admin is auto approved. Make sure a coach row exists
          if (isSupabaseConfigured && databaseService.supabase) {
            const { data: existingAdminCoach } = await databaseService.supabase
              .from('coaches')
              .select('*')
              .eq('user_id', authUserId)
              .maybeSingle();
            if (!existingAdminCoach) {
              await databaseService.supabase.from('coaches').insert({
                user_id: authUserId,
                status: 'approved',
                brand_name: 'Admin Fitness'
              });
            }
          } else {
            const existingAdminCoach = mockCoaches.find(c => c.user_id === authUserId);
            if (!existingAdminCoach) {
              mockCoaches.push({
                id: 'coach-subodh',
                user_id: authUserId,
                status: 'approved',
                brand_name: 'Admin Fitness'
              });
              databaseService.saveMockTable('coaches', mockCoaches);
            }
          }
          await databaseService.loadProfileIntoLocalStorage({
            ...profile,
            id: authUserId,
            role: 'super-admin',
            userCoachId: 'coach-subodh'
          }, authEmail);
          localStorage.setItem('onboardingCompleted', 'true');
          onComplete();
        } else if (coachRecord) {
          // Super admin can block a coach for malpractice — deny access here.
          if (coachRecord.is_blocked === true) {
            try { await databaseService.signOut(); } catch (e) { /* */ }
            throw new Error('Your coach access has been suspended. Please contact the Fitengineers team.');
          }
          // profile can still be null here if this account somehow got a
          // coaches row without a public.users row — re-fetch now that we
          // have a confirmed real user id, rather than losing their name/etc.
          if (!profile) profile = await databaseService.getUserProfileByEmail(authEmail);
          await databaseService.loadProfileIntoLocalStorage({
            ...profile,
            id: authUserId,
            role: 'coach',
            userCoachId: coachRecord.id
          }, authEmail);
          localStorage.setItem('onboardingCompleted', 'true');
          onComplete();
        } else {
          // Credentials were valid, but this identity has no coaches row yet —
          // the exact "new coach" case: they already have a working auth
          // account (e.g. just set a password via Forgot Password) but haven't
          // filled out the coach profile yet. Sign the session back out so it
          // can't linger and route as a client, then go straight to the Sign
          // Up form with their verified email prefilled — no error banner,
          // no extra click needed.
          try { await databaseService.signOut(); } catch (e) { /* */ }
          setCoachApplyEmail(authEmail);
          setUserType('coach');
          setAuthTab('coach_apply');
          setAuthError('');
          setAuthSuccessMsg('');
          setAuthLoading(false);
          return;
        }
      }
    } catch (err) {
      setAuthError(err.message || 'Coach authentication failed.');
    } finally {
      localStorage.removeItem('coachLoginInProgress');
      setAuthLoading(false);
    }
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

  const createDefaultClientRowAndComplete = async (userId, email, nameVal) => {
    const cleanName = (nameVal || email.split('@')[0] || 'Warrior').trim();
    localStorage.setItem('userName', cleanName);
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userId', userId);
    localStorage.setItem('userRole', 'client');
    localStorage.setItem('userAge', '30');
    localStorage.setItem('userHeight', '175');
    localStorage.setItem('userWeight', '70');
    localStorage.setItem('userActivity', 'Moderately Active');
    localStorage.setItem('userGoal', 'Fat Loss');
    localStorage.setItem('userDiet', 'Non-Vegetarian');
    localStorage.setItem('userCalorieTarget', '2000');
    localStorage.setItem('userProteinTarget', '120');
    localStorage.setItem('userCarbsTarget', '220');
    localStorage.setItem('userFatsTarget', '70');

    if (isSupabaseConfigured && databaseService.supabase) {
      try {
        await databaseService.saveUserProfile({
          id: userId,
          userName: cleanName,
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
      } catch (err) {
        console.error("Error saving initial user profile:", err);
      }
    } else {
      const mockClients = databaseService.getMockTable('clients');
      const existingClientIndex = mockClients.findIndex(c => c.user_id === userId);
      const clientData = {
        id: `mock-client-id-${Date.now()}`,
        user_id: userId,
        coach_id: null,
        full_name: cleanName,
        fitness_goal: 'Fat Loss',
        weight_kg: 70,
        height_cm: 175,
        age: 30,
        activity_level: 'Moderately Active',
        dietary_preference: 'Non-Vegetarian',
        calorie_target: 2000,
        protein_target: 120,
        carbs_target: 220,
        fats_target: 70,
        onboarding_completed: false
      };
      if (existingClientIndex > -1) {
        mockClients[existingClientIndex] = { ...mockClients[existingClientIndex], ...clientData };
      } else {
        mockClients.push(clientData);
      }
      databaseService.saveMockTable('clients', mockClients);
    }
    
    // Save locally for quick lookup
    const profileData = {
      name: cleanName,
      age: 30,
      height: 175,
      weight: 70,
      activity: 'Moderately Active',
      goal: 'Fat Loss',
      issue: '',
      diet: 'Non-Vegetarian'
    };
    localStorage.setItem(`profile_${cleanName.toLowerCase().replace(/\s+/g, '')}`, JSON.stringify(profileData));
    // Mark wizard as NOT yet completed so App.jsx triggers the 4-step wizard next
    localStorage.setItem('onboardingCompleted', 'false');

    onComplete();
  };

  const handleGoogleAccountSelect = async (profile, email) => {
    setShowGoogleModal(false);

    // Coach tab opened this picker — route through the coach path instead of
    // the client logic below (which always sets userRole 'client').
    if (googleModalIntent === 'coach') {
      localStorage.setItem('pendingCoachLogin', 'true');
      await finishCoachGoogleLogin(email, profile.name);
      return;
    }

    // Save email & name to local storage
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userName', profile.name);
    localStorage.setItem('userRole', 'client');

    let dbProfile = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      dbProfile = await databaseService.getUserProfileByEmail(email);
    }
    if (dbProfile?.onboardingCompleted) {
      // Already finished the one-time wizard on a previous login — straight to the dashboard.
      if (dbProfile.coach_id) localStorage.setItem('userCoachId', dbProfile.coach_id);
      await databaseService.loadProfileIntoLocalStorage(dbProfile, email);
      onComplete();
      return;
    }

    const coachId = dbProfile?.coach_id;
    if (coachId) {
      localStorage.setItem('userCoachId', coachId);
    } else if (isSupabaseConfigured && databaseService.supabase && !dbProfile) {
      // Brand-new client: create initial client profile with no coach linked yet
      try {
        await databaseService.saveUserProfile({
          userName: profile.name,
          email: email,
          role: 'client',
          coach_id: null,
          userAge: profile.age,
          userHeight: profile.height,
          userWeight: profile.weight,
          userActivity: profile.activity,
          userGoal: profile.goal,
          userDiet: profile.diet || 'Non-Vegetarian',
          userCalorieTarget: calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal).calories.toString(),
          userProteinTarget: calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal).protein.toString(),
          userCarbsTarget: calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal).carbs.toString(),
          userFatsTarget: calculateTargetsGeneric(profile.weight, profile.height, profile.age, profile.activity, profile.goal).fats.toString(),
          verified: false
        });
      } catch (e) {
        console.error("Error creating initial client user profile:", e);
      }
    }
    // These demo Google accounts already carry full profile data (age/height/weight/etc.),
    // so route straight to the dashboard via the instant-login path instead of the wizard.
    handleInstantLogin(profile, email);
  };

  useEffect(() => {
    const msg = localStorage.getItem('resetSuccessMsg');
    if (msg) {
      localStorage.removeItem('resetSuccessMsg');
      setUserType('client');
      setAuthTab('login');
      setShowClientEmailForm(true);
      setClientAuthMode('login');
      setAuthSuccessMsg(msg);
    }
  }, []);

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


  // Automatic sliding carousel for onboarding mockup
  useEffect(() => {
    if (step !== 0 || showAuthForm) return;
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % 3);
    }, 3500);
    return () => clearInterval(interval);
  }, [step, showAuthForm]);

  const TOTAL_STEPS = 1;

  const handleBack = () => {
    if (step > 0) {
      if (step === 1 && !isSupabaseConfigured) {
        return;
      }
      setStep(step - 1);
    }
  };

  // Step 1 (name + phone) is the only numbered step left here — once it's done,
  // clients are handed off to the one-time 4-step ClientOnboardingWizard below.
  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) return;
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        alert('Please enter a valid 10-digit phone number.');
        return;
      }
      const fullPhone = `+91${digitsOnly}`;
      localStorage.setItem('userName', name.trim());
      localStorage.setItem('userPhone', fullPhone);
    }

    // Check if the current user is a coach
    const isCoach = localStorage.getItem('userRole') === 'coach' || localStorage.getItem('userRole') === 'super-admin' || userType === 'coach';
    if (step === 1 && isCoach) {
      const cleanName = name.trim();
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      const fullPhone = `+91${digitsOnly}`;
      databaseService.saveUserProfile({
        userName: cleanName,
        email: localStorage.getItem('userEmail'),
        phone: fullPhone,
        role: localStorage.getItem('userRole') || 'coach'
      });
      onComplete();
      return;
    }

    // Name/phone collected — hand off to the one-time 4-step ClientOnboardingWizard
    // rendered by App.jsx (gated on the onboarding_completed DB flag).
    localStorage.setItem('onboardingCompleted', 'false');
    onComplete();
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



      {step === 0 && userType === 'coach' && authTab === 'coach_apply' && (
        <div style={{ width: '100%', min_height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '20px', padding: '40px 32px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}>
            <button
              onClick={() => setAuthTab('login')}
              style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '20px', padding: '6px 10px', borderRadius: '6px', transition: 'all 0.3s ease' }}
              onMouseEnter={(e) => { e.target.style.color = '#93c5fd'; e.target.style.background = 'rgba(59, 130, 246, 0.1)'; }}
              onMouseLeave={(e) => { e.target.style.color = 'rgba(148, 163, 184, 0.8)'; e.target.style.background = 'none'; }}
            >
              ← Back to Login
            </button>
            
            <h2 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '22px', fontWeight: 800 }}>Coach Sign Up</h2>
            <p style={{ margin: '0 0 20px 0', color: 'rgba(226, 232, 240, 0.7)', fontSize: '14px' }}>Create your coach account and start managing clients</p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              setAuthError('');
              setAuthSuccessMsg('');
              setAuthLoading(true);
              try {
                const formData = new FormData(e.target);
                const email = formData.get('email');
                const name = formData.get('name');
                const password = formData.get('password');
                const resp = await fetch('/api/register-coach', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name,
                    email,
                    password,
                    experience: formData.get('experience'),
                    brand: formData.get('specialization'),
                    certifications: formData.get('certifications'),
                    social: formData.get('social'),
                    location: formData.get('location')
                  })
                });
                const result = await resp.json();
                if (!resp.ok || result.error) throw new Error(result.error || 'Registration failed');
                localStorage.removeItem('pendingCoachApply');

                if (result.hasSession && isSupabaseConfigured && databaseService.supabase) {
                  // The server already verified/created these credentials — establish a
                  // real browser session via signInWithPassword (the same method used
                  // everywhere else in this app) and drop them straight into the coach
                  // dashboard instead of sending them back to log in a second time.
                  // NOTE: supabase.auth.setSession() was used here before and hung
                  // indefinitely (never resolved or rejected) — the known Supabase SDK
                  // hang issue on this project (see feedback-supabase-sdk-hang memory)
                  // turns out to affect setSession() too, not just verifyOtp/updateUser.
                  // That's what left the "Creating account..." button stuck forever.
                  //
                  // coachLoginInProgress guards against the same race the Coach Login
                  // form already protects against: signIn() fires Supabase's
                  // onAuthStateChange, which App.jsx's processSessionUser also listens
                  // to. A brand-new coach has no age/height/weight (those are client
                  // fitness fields), so processSessionUser's "hasCompleteProfile" check
                  // fails for them, and isTrainer() depends on a userRole that hasn't
                  // been written yet — so without this flag it could misclassify the
                  // new coach and leave localStorage.userRole stale, corrupting both
                  // the coach dashboard's client-list scoping and the tab remembered
                  // on next logout.
                  localStorage.setItem('coachLoginInProgress', 'true');
                  try {
                    await databaseService.signIn(email, password);
                    const profile = await databaseService.getUserProfileByEmail(email);
                    await databaseService.loadProfileIntoLocalStorage({
                      ...profile,
                      role: 'coach',
                      userCoachId: result.userId
                    }, email);
                  } finally {
                    localStorage.removeItem('coachLoginInProgress');
                  }
                  localStorage.setItem('onboardingCompleted', 'true');
                  onComplete();
                  return;
                }

                if (result.hasSession) {
                  // Auto-confirmed: session exists server-side but NOT in the browser.
                  // Route to coach login so the browser gets a real session.
                  setAuthSuccessMsg(`Coach account created! Log in with your credentials to enter the dashboard.`);
                } else {
                  // Email confirmation required — coach confirms then logs in.
                  setAuthSuccessMsg(`Coach account created! We've sent a confirmation link to ${email}. Click it, then log in as a coach.`);
                }
                setAuthTab('login');
                setUserType('coach');
                setAuthEmail(email);
              } catch(err) {
                setAuthError(err.message);
              } finally {
                setAuthLoading(false);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {authError && <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fecaca', fontSize: '0.78rem' }}>{authError}</div>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Full Name</label>
                <input name="name" type="text" value={coachApplyName} onChange={e => setCoachApplyName(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Email Address</label>
                <input name="email" type="email" value={coachApplyEmail} onChange={e => setCoachApplyEmail(e.target.value)} readOnly={!!coachApplyEmail} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Password</label>
                <input name="password" type="password" placeholder="••••••••" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required minLength={6} />
                {coachApplyEmail && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.5)' }}>
                    Enter the password you just set via "Forgot password?" for this account.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Certifications (e.g. NASM, ACE)</label>
                <input name="certifications" type="text" placeholder="NASM, ACE, etc" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Years of Experience</label>
                <input name="experience" type="number" placeholder="5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Specialization (e.g. Weight Loss, Muscle Gain)</label>
                <input name="specialization" type="text" placeholder="Bodybuilding, Weight Loss, etc" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Social Media Handle (Optional)</label>
                <input name="social" type="text" placeholder="@yourhandle" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Location / City</label>
                <input name="location" type="text" placeholder="City, Country" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }} required />
              </div>
              
              <button type="submit" disabled={authLoading} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)', transition: 'all 0.2s ease' }}>
                {authLoading ? 'Creating account...' : 'Create Coach Account'}
              </button>
            </form>
            
            <button type="button" onClick={() => setAuthTab('login')} style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.78rem', cursor: 'pointer', textAlign: 'center', textDecoration: 'underline', marginTop: '12px' }}>
              Back to Coach Login
            </button>
          </div>
        </div>
      )}

      {step === 0 && authTab !== 'coach_apply' && (
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
            <div className="credentials-form-container animate-slide-in" style={{ padding: '24px 20px', minHeight: '380px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              
              {/* Role Toggle Tab */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h4 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>Welcome to Fitengineers</h4>
                <div className="form-role-toggle" style={{ margin: 0 }}>
                  <button 
                    type="button" 
                    className={`role-toggle-btn ${userType === 'client' ? 'active-client' : ''}`}
                    onClick={() => { setUserType('client'); setAuthError(''); setAuthSuccessMsg(''); setShowClientEmailForm(false); }}
                  >
                    Client
                  </button>
                  <button 
                    type="button" 
                    className={`role-toggle-btn ${userType === 'coach' ? 'active-coach' : ''}`}
                    onClick={() => { setUserType('coach'); setAuthError(''); setAuthSuccessMsg(''); }}
                  >
                    Coach
                  </button>
                </div>
              </div>

              {authError && <div className="auth-error-banner" style={{ marginBottom: '14px' }}>❌ {authError}</div>}
              {authSuccessMsg && (
                <div style={{
                  padding: '10px 12px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  color: '#34d399',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  marginBottom: '14px',
                  textAlign: 'center'
                }}>
                  ✅ {authSuccessMsg}
                </div>
              )}

              {/* CLIENT FLOW */}
              {userType === 'client' && !showClientEmailForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <button 
                    type="button" 
                    className="gmail-login-btn"
                    style={{ width: '100%', margin: 0, padding: '12px' }}
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
                    <div className="google-icon-wrapper" style={{ display: 'inline-flex', alignSelf: 'center', marginRight: '8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    Continue with Google
                  </button>

                  <button 
                    type="button" 
                    className="guest-bypass-btn-new"
                    style={{ width: '100%', margin: 0, padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => setShowClientEmailForm(true)}
                  >
                    Continue with email
                  </button>
                </div>
              )}

              {/* CLIENT EMAIL FORM */}
              {userType === 'client' && showClientEmailForm && authTab !== 'forgot_password' && (
                <form onSubmit={handleClientEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Client Login</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="you@email.com" 
                      value={authEmail} 
                      onChange={e => setAuthEmail(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      required 
                      disabled={authLoading}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('forgot_password');
                          setAuthError('');
                          setAuthSuccessMsg('');
                          setForgotPasswordSuccessMsg('');
                        }}
                        style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={authPassword} 
                      onChange={e => setAuthPassword(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      required 
                      disabled={authLoading}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="gmail-login-btn"
                    style={{ width: '100%', margin: 0, padding: '12px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff' }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Authenticating...' : 'Log In'}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '4px' }}>
                    <button
                      type="button" 
                      onClick={() => { setShowClientEmailForm(false); setAuthSuccessMsg(''); setAuthError(''); }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      ← Back
                    </button>
                  </div>
                </form>
              )}

              {/* CLIENT FORGOT PASSWORD SCREEN */}
              {userType === 'client' && authTab === 'forgot_password' && (
                <form onSubmit={handleClientForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Reset Password</h4>
                  <p style={{ margin: 0, color: 'rgba(226, 232, 240, 0.6)', fontSize: '0.78rem', lineHeight: '1.4' }}>
                    Enter your client email address below and we'll send you a secure link to reset your password.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="you@email.com" 
                      value={authEmail} 
                      onChange={e => setAuthEmail(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      required 
                      disabled={authLoading}
                    />
                  </div>

                  {forgotPasswordSuccessMsg && (
                    <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.78rem' }}>
                      {forgotPasswordSuccessMsg}
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="gmail-login-btn"
                    style={{ width: '100%', margin: 0, padding: '12px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', color: '#fff' }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Sending...' : 'Send reset link'}
                  </button>

                  <button 
                    type="button" 
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError('');
                      setAuthSuccessMsg('');
                      setForgotPasswordSuccessMsg('');
                    }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0, alignSelf: 'center', marginTop: '4px' }}
                  >
                    ← Back
                  </button>
                </form>
              )}

              {/* COACH GOOGLE SIGN-IN */}
              {userType === 'coach' && (
                <button
                  type="button"
                  className="gmail-login-btn"
                  style={{ width: '100%', margin: '0 0 14px 0', padding: '12px' }}
                  onClick={startCoachGoogleLogin}
                  disabled={authLoading}
                >
                  <div className="google-icon-wrapper" style={{ display: 'inline-flex', alignSelf: 'center', marginRight: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  Continue with Google
                </button>
              )}

              {/* COACH EMAIL FORM */}
              {userType === 'coach' && (
                <form onSubmit={handleCoachEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Coach Login</h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="coach@fitengineers.com" 
                      value={authEmail} 
                      onChange={e => setAuthEmail(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      required 
                      disabled={authLoading}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Password</label>
                      <button 
                        type="button"
                        onClick={async () => {
                          if (!authEmail) {
                            setAuthError('Please enter your coach email address first to reset password.');
                            return;
                          }
                          setAuthError('');
                          setAuthSuccessMsg('');
                          try {
                            setAuthLoading(true);
                            // Same server-side dispatch as the client flow: generates the
                            // recovery link via the admin API and emails it through Resend,
                            // bypassing Supabase's own mailer (which fails outright for
                            // every address — see api/request-password-reset.js). The old
                            // direct resetPasswordForEmail() call here hit that same broken
                            // mailer and silently never delivered anything.
                            const resp = await fetch('/api/request-password-reset', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              // role: 'coach' is embedded into the emailed confirm link so
                              // that after they set their new password, the app knows to
                              // land them back on the Coach tab (with this email prefilled)
                              // instead of defaulting to the Client tab — see AuthConfirm.jsx.
                              body: JSON.stringify({ email: authEmail.trim().toLowerCase(), role: 'coach' })
                            });
                            const data = await resp.json().catch(() => ({}));
                            if (!resp.ok) {
                              throw new Error(data.error || 'We couldn\'t send the reset email right now. Please try again in a few minutes.');
                            }
                            // The coach flow is honest about a missing account
                            // (unlike the public client flow): show a real error
                            // instead of a "check your inbox" message the coach
                            // would wait on forever. See api/request-password-reset.js.
                            if (data.accountExists === false) {
                              setCoachApplyEmail(authEmail.trim().toLowerCase());
                              setAuthError(data.message || 'No coach account found with this email.');
                            } else {
                              setAuthSuccessMsg("If that email is registered, you'll receive a password reset link shortly.");
                            }
                          } catch(err) {
                            setAuthError(err.message || 'Failed to send reset link.');
                          } finally {
                            setAuthLoading(false);
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={authPassword} 
                      onChange={e => setAuthPassword(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
                      required 
                      disabled={authLoading}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="gmail-login-btn"
                    style={{ width: '100%', margin: 0, padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff' }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Logging In...' : 'Log In as Coach'}
                  </button>

                  <p style={{ margin: '8px 0 0 0', color: 'rgba(226, 232, 240, 0.6)', fontSize: '12px', textAlign: 'center' }}>
                    Not a coach yet?{' '}
                    <button 
                      type="button" 
                      onClick={() => {
                        setAuthTab('coach_apply');
                        localStorage.setItem('pendingCoachApply', 'true');
                      }}
                      style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Sign up
                    </button>
                  </p>
                </form>
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
            style={{ marginBottom: '14px' }}
          />

          <h3 style={{ marginTop: '16px' }}>What is your phone number?</h3>
          <p className="step-hint">Required for direct communication with your coach.</p>
          <div style={{ display: 'flex', gap: '8px', maxWidth: '360px', margin: '0 auto' }}>
            <span style={{
              padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center'
            }}>🇮🇳 +91</span>
            <input 
              type="tel" 
              value={phoneNumber} 
              onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} 
              placeholder="10-digit mobile number"
              style={{ flex: 1 }}
              required
            />
          </div>

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
                          setWizardPrefill({
                            age: profile.age || '',
                            weight: profile.weight || '',
                            height: profile.height || ''
                          });
                          if (profile.age) localStorage.setItem('userAge', profile.age);
                          if (profile.weight) localStorage.setItem('userWeight', profile.weight);
                          if (profile.height) localStorage.setItem('userHeight', profile.height);
                          localStorage.setItem('onboardingCompleted', 'false');
                          onComplete();
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

          {/* Google Sign-in removed to enforce restricted access only */}
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
            disabled={step === 1 && !name.trim()}
          >
            Next Step ➔
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
                  if (googleModalIntent === 'coach') {
                    localStorage.removeItem('pendingCoachLogin');
                    setUserType('coach');
                    setAuthError('');
                    return;
                  }
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
