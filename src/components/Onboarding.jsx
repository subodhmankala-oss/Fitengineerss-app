import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured, isTrainer, TRAINER_EMAILS } from '../services/databaseService';
import { calculateTargetsGeneric } from '../utils/targets';
import './Onboarding.css';

// Dev-only auto-login convenience (see matching isLocalDevAutoLogin in
// App.jsx, which replays these on future loads with no session): on
// localhost only, remember the credentials of a successful manual login so
// testing doesn't require retyping a password every time the session gets
// reset (dev-server restart, ghost-login recovery, etc). Never runs against
// a deployed build.
const isLocalDevAutoLogin =
  import.meta.env.DEV &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const rememberForDevAutoLogin = (email, password) => {
  if (!isLocalDevAutoLogin || !email || !password) return;
  localStorage.setItem('rememberedEmail', email);
  localStorage.setItem('rememberedPassword', password);
};

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
      // Leftover userEmail/userName in localStorage does NOT mean this person
      // is mid-onboarding — it's just cache from a previous visit, and it
      // survives plenty of paths that end with no live session (an
      // interrupted login, a reload, a partially-completed sign-in). The
      // branches below used to jump straight to the wizard on that alone,
      // never consulting onboardingCompleted, so an already-onboarded client
      // landing on this screen was force-marched through all 4 steps again.
      // Reproduced live 2026-08-10 for an account whose DB row had
      // onboarding_completed = true the entire time. If onboarding is known
      // to be done, fall through to the login screen instead — logging in is
      // what should happen here, not re-onboarding.
      if (localStorage.getItem('onboardingCompleted') === 'true') {
        return isSupabaseConfigured ? 0 : 1;
      }
      const storedName = localStorage.getItem('userName');
      // A returning client whose name we already know but who hasn't finished
      // the one-time onboarding wizard yet (onboardingCompleted gate handles
      // the "already done" case before Onboarding even mounts).
      if (storedName) return 'wizard';
      // No name yet: this file's own "Fitengineers App Setup" name/phone
      // screen (step 1) used to catch this for every role. For clients that
      // was a redundant extra screen in front of ClientOnboardingWizard's own
      // Step 1 (which now also collects phone) — and it could strand a
      // returning client here on every login if their name lookup ever came
      // back empty (e.g. right after a password-reset re-login), since the
      // wizard is what actually persists the name to the DB. Route clients
      // straight into the wizard; only a coach-ish role (no wizard
      // equivalent exists for coaches) still lands on this screen.
      const role = localStorage.getItem('userRole');
      const isCoachish = role === 'coach' || role === 'coach_pending' || role === 'super-admin' || role === 'admin';
      return isCoachish ? 1 : 'wizard';
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
  // Full name captured on the client self-sign-up form (mirrors the coach
  // sign-up). Only used by handleClientSignup → carried into the wizard.
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAuthForm, setShowAuthForm] = useState(() =>
    localStorage.getItem('pendingCoachApply') === 'true'
  );
  const [showClientEmailForm, setShowClientEmailForm] = useState(false);
  // Mirrors showClientEmailForm for the Coach tab: false = clean two-button
  // chooser (Google / Continue with email), true = the coach email login form.
  const [showCoachEmailForm, setShowCoachEmailForm] = useState(false);
  const [forgotPasswordSuccessMsg, setForgotPasswordSuccessMsg] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');
  const [coachApplyName, setCoachApplyName] = useState(() => localStorage.getItem('userName') || '');
  const [coachApplyEmail, setCoachApplyEmail] = useState(() => localStorage.getItem('userEmail') || '');
  // Whether a real, live Supabase session already exists when this coach
  // sign-up form is showing. True only for someone who just arrived via a
  // genuine "Continue with Google" redirect — that flow already proves who
  // they are, so the password field below is unnecessary friction for them
  // specifically. Every other path to this same form (a failed "Continue
  // with email" login, or the direct "Sign up" link) has no live session at
  // this point and keeps the password field exactly as before.
  const [coachApplyHasSession, setCoachApplyHasSession] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(() => {
    const saved = localStorage.getItem('userPhone') || '';
    return saved.replace(/^\+91/, '');
  });

  const startCoachGoogleLogin = async () => {
    setAuthError('');
    // sessionStorage, not localStorage: signInWithGoogle() below calls
    // supabase.auth.signOut() as a pre-redirect "clean slate" step, which
    // fires a SIGNED_OUT event that wipes localStorage (see App.jsx's handler)
    // BEFORE the actual OAuth redirect happens — that used to erase this flag
    // and silently route the returning coach through the client onboarding
    // path instead. sessionStorage survives the same-tab redirect fine and is
    // untouched by localStorage.clear().
    sessionStorage.setItem('pendingCoachLogin', 'true');
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
      sessionStorage.removeItem('pendingCoachLogin');
      setAuthError(err.message || 'Google OAuth failed.');
    }
  };

  const finishCoachGoogleLogin = async (email, displayName) => {
    sessionStorage.removeItem('pendingCoachLogin');
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

  // Detect whether a real Google session is already live whenever this form
  // becomes visible. This — not which button was clicked — is the actual
  // signal for whether the password field is needed: a live session already
  // proves identity, so nothing else is required.
  useEffect(() => {
    if (authTab !== 'coach_apply') {
      setCoachApplyHasSession(false);
      return;
    }
    if (!isSupabaseConfigured || !databaseService.supabase) return;
    let cancelled = false;
    databaseService.supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setCoachApplyHasSession(!!data?.session);
    });
    return () => { cancelled = true; };
  }, [authTab]);

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
      // PERF FIX 2026-08-14: this used to fetch the profile BEFORE signIn()
      // established a session — but with no token yet, RLS on public.users/
      // clients always silently blocks that read (returns zero rows, not an
      // error). It's not just a wasted quick request either: an empty
      // PostgREST result is indistinguishable from "no such account", so
      // getUserProfileByEmail always fell through to its server-side
      // lookupProfileViaServer fallback too (api/lookup-profile.js, an
      // 8-second abort timeout) — meaning every single login paid for one
      // guaranteed-to-fail direct read PLUS a full serverless round trip
      // (cold start + DB query) for a result that was thrown away the
      // moment the real, authenticated re-fetch ran a few lines below. That
      // was a large, unnecessary chunk of the "5-10s to reach the
      // dashboard" coaches/clients were seeing on every login. profile is
      // fetched exactly once now, after signIn() below, with a real token.
      let profile = null;
      let signInSuccess = false;
      // A client who self-signed-up has a Supabase Auth account but no
      // public.users/clients row yet (that's created when they finish the
      // wizard). So verify credentials FIRST regardless of whether a profile
      // row exists, then resolve the real auth user id from the sign-in
      // result — never reject just because profile is null (that was the old
      // behaviour, which locked every freshly-signed-up client out).
      let authUserId = null;

      if (isSupabaseConfigured && databaseService.supabase) {
        try {
          const signInResult = await databaseService.signIn(authEmail, authPassword);
          signInSuccess = true;
          if (!authUserId) authUserId = signInResult?.user?.id || null;
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
            if (!authUserId) authUserId = mUser.id;
          } else {
            // Only worth the (slow, RLS-doomed-without-a-token) profile
            // lookup here on this already-failed path, purely to pick the
            // right error message — not on every login up front.
            const existsCheck = await databaseService.getUserProfileByEmail(authEmail);
            if (!existsCheck) {
              // No auth account and no profile — a brand-new person who hasn't
              // signed up. Point them at the new Sign up button.
              throw new Error('No account found with this email. New here? Tap "Sign up" to create your account.');
            } else {
              throw new Error('Invalid email or password.');
            }
          }
        }
      } else {
        // Local storage verification: check if password matches (simulate password check)
        const mockUsers = databaseService.getMockTable('users');
        const mUser = mockUsers.find(u => u.email.toLowerCase() === authEmail.toLowerCase());
        if (mUser && mUser.password_hash === authPassword) {
          signInSuccess = true;
          if (!authUserId) authUserId = mUser.id;
        } else {
          throw new Error('Invalid email or password.');
        }
      }

      if (signInSuccess) {
        rememberForDevAutoLogin(authEmail, authPassword);
        // First (and, on the success path, only) profile fetch — now that a
        // real session/token exists, so RLS actually lets it through instead
        // of silently returning zero rows. See the PERF FIX comment above
        // for why this used to also run (uselessly) before signIn().
        if (!profile) {
          profile = await databaseService.getUserProfileByEmail(authEmail);
        }
        if (profile?.onboardingCompleted) {
          // Already finished the one-time wizard on a previous login — straight to the dashboard.
          await databaseService.loadProfileIntoLocalStorage(profile, authEmail);
          onComplete();
        } else {
          // Either no clients row yet (just signed up), or the wizard was
          // started but never finished — send them into the wizard, which
          // collects (and, unlike this login handler used to, actually
          // persists) name/phone itself on its own Step 1.
          const knownName = profile?.userName || localStorage.getItem('userName') || '';
          localStorage.setItem('userEmail', authEmail);
          if (authUserId) localStorage.setItem('userId', authUserId);
          localStorage.setItem('userRole', 'client');
          if (knownName) localStorage.setItem('userName', knownName);
          setStep('wizard');
        }
      } else {
        throw new Error('Invalid email or password.');
      }
    } catch (err) {
      setAuthError(err.message || 'Client authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Client self-sign-up: creates a real Supabase Auth account (email +
  // password), then drops them into the onboarding wizard to build their
  // profile. Mirrors the coach sign-up's shape; the wizard's completion is
  // what writes the public.users/clients rows (via saveUserProfile), so we
  // don't create them here. If Supabase requires email confirmation, signUp
  // returns no session — we surface the "confirm your email" message and the
  // client lands in the wizard after confirming + logging in.
  const handleClientSignup = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    const cleanName = (authName || '').trim();
    const email = (authEmail || '').trim().toLowerCase();
    if (!cleanName) { setAuthError('Please enter your name.'); return; }
    if (!email) { setAuthError('Please enter your email address.'); return; }
    if (!authPassword || authPassword.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }

    setAuthLoading(true);
    try {
      // Guard against signing up over an existing account.
      const existing = await databaseService.getUserProfileByEmail(email);
      if (existing) {
        setAuthError('An account with this email already exists. Please log in instead.');
        setAuthTab('login');
        setAuthLoading(false);
        return;
      }

      if (!isSupabaseConfigured || !databaseService.supabase) {
        throw new Error('Sign up is unavailable right now. Please try again later.');
      }

      const signUpResult = await databaseService.signUp(email, authPassword);
      const newUserId = signUpResult?.user?.id || null;
      const hasSession = !!signUpResult?.session;

      // Persist name/email up front so both the wizard and a post-confirmation
      // login can pick them up.
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userName', cleanName);
      localStorage.setItem('userRole', 'client');
      if (newUserId) localStorage.setItem('userId', newUserId);

      if (!hasSession) {
        // Email confirmation is enabled — no session yet. Send them back to
        // login with a clear "check your inbox" message.
        setAuthSuccessMsg(`We've sent a confirmation link to ${email}. Click it, then log in to finish setting up your profile.`);
        setAuthTab('login');
        setShowClientEmailForm(true);
        setAuthPassword('');
        return;
      }

      // Confirmation disabled — straight into the wizard.
      setName(cleanName);
      setStep('wizard');
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists')) {
        setAuthError('An account with this email already exists. Please log in instead.');
        setAuthTab('login');
      } else {
        setAuthError(err.message || 'Could not create your account. Please try again.');
      }
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
        const data = await resp.json().catch(() => ({}));
        // Honest about a missing account (same as the coach flow): don't leave
        // a brand-new person waiting on an email that can never arrive — point
        // them at Sign up instead. The login form already reveals existence,
        // so this leaks nothing new.
        if (data.accountExists === false) {
          setAuthError(data.message || 'No account found with this email. New to Fitengineers? Tap "Sign up" to create your account.');
        } else {
          setForgotPasswordSuccessMsg(confirmation);
        }
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
      // PERF FIX 2026-08-14: don't fetch the profile before signIn() — with
      // no token yet, RLS on public.users always silently blocks that read
      // (empty result, not an error), so it was thrown away every time
      // anyway. Worse, an empty PostgREST result also triggers
      // getUserProfileByEmail's server-side lookupProfileViaServer fallback
      // (api/lookup-profile.js — an 8s abort timeout), meaning every login
      // paid for a guaranteed-to-fail read PLUS a full serverless round
      // trip before ever reaching the real, authenticated re-fetch further
      // below. A large chunk of the "5-10s to reach the dashboard" coaches
      // were seeing. profile.id was only ever a fallback for authUserId
      // anyway (signInResult below always provides it once auth succeeds).
      let profile = null;
      let signInSuccess = false;
      // A coach's Supabase Auth account can exist (e.g. one they just
      // claimed via "Forgot password?") with no public.users row yet —
      // profile is null in that case. Verify credentials first regardless,
      // then resolve the real auth user id from the sign-in result itself.
      let authUserId = null;

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
        rememberForDevAutoLogin(authEmail, authPassword);
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
      sessionStorage.setItem('pendingCoachLogin', 'true');
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
    // Cache the real backend userId the moment a real account is found —
    // unconditionally, before any branch below. Every downstream read
    // (workout history, coach-connection check, invite code) resolves the
    // user via localStorage.userId; the "already onboarded" branch right
    // below was the ONLY place this got set, so any account found here but
    // routed to handleInstantLogin's demo-profile fallback further down
    // (onboardingCompleted false/ambiguous) silently ran with no userId ever
    // set at all — every one of those reads then had nothing to resolve
    // against and hung/failed indefinitely instead of erroring visibly.
    if (dbProfile?.id) {
      localStorage.setItem('userId', dbProfile.id);
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
    <div className={`onboarding-container${step === 0 && authTab !== 'coach_apply' && authTab !== 'client_signup' ? ' login-portal-mode' : ''}`}>
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



      {(() => {
        // Unchanged from before: creates a brand-new (or claims an existing
        // password-based) coach account via email + password. Used whenever
        // there's no live session already proving who this is — a failed
        // "Continue with email" login, or the direct "Sign up" link.
        const handleCoachApplySubmitPassword = async (e) => {
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
                  // coaches.id (this coach's own coach-profile row), NOT
                  // result.userId (the Supabase auth uid) — was wrongly
                  // set to the auth uid before, which is a different id
                  // space than every other userCoachId write in this app.
                  userCoachId: result.coachId
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
        };

        // New: for someone who just arrived via a live "Continue with Google"
        // session. That session already proves identity, so this skips
        // password creation/verification entirely — it just re-verifies the
        // session is still fresh (protects against it expiring while this
        // tab sat open) and attaches a coach profile to the account it's
        // already signed into.
        const handleCoachApplySubmitSession = async (e) => {
          e.preventDefault();
          setAuthError('');
          setAuthSuccessMsg('');
          setAuthLoading(true);
          try {
            const formData = new FormData(e.target);
            const name = formData.get('name');

            const { data: sessionData } = await databaseService.supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;
            if (!accessToken) {
              setCoachApplyHasSession(false);
              throw new Error('Your sign-in session has expired. Please sign in with Google again.');
            }

            const resp = await fetch('/api/register-coach-google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({
                name,
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

            const profile = await databaseService.getUserProfileByEmail(result.email);
            await databaseService.loadProfileIntoLocalStorage({
              ...profile,
              role: 'coach',
              userCoachId: result.coachId
            }, result.email);
            localStorage.setItem('onboardingCompleted', 'true');
            onComplete();
          } catch (err) {
            setAuthError(err.message);
          } finally {
            setAuthLoading(false);
          }
        };

        return (
      <>
      {step === 0 && userType === 'coach' && authTab === 'coach_apply' && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px 12px 12px', background: '#0a0e1a', boxSizing: 'border-box', overflowY: 'auto', zIndex: 20 }}>
          <div className="animate-slide-in" style={{ background: '#0a0e1a', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '20px', padding: '14px 20px 20px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <img src="/logo.png" alt="Fitengineers Logo" style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
            </div>

            <h2 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: '20px', fontWeight: 800 }}>Coach Sign Up</h2>
            <p style={{ margin: '0 0 12px 0', color: 'rgba(226, 232, 240, 0.7)', fontSize: '13px' }}>Create your coach account and start managing clients</p>

            <form onSubmit={coachApplyHasSession ? handleCoachApplySubmitSession : handleCoachApplySubmitPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {authError && <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fecaca', fontSize: '0.78rem' }}>{authError}</div>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Full Name</label>
                <input name="name" type="text" value={coachApplyName} onChange={e => setCoachApplyName(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Email Address</label>
                <input name="email" type="email" value={coachApplyEmail} onChange={e => setCoachApplyEmail(e.target.value)} readOnly={!!coachApplyEmail} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>

              {coachApplyHasSession ? (
                <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', color: '#a7f3d0', fontSize: '0.75rem' }}>
                  ✓ Signed in with Google — no password needed.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Password</label>
                  <input name="password" type="password" placeholder="••••••••" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required minLength={6} />
                  {coachApplyEmail && (
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.5)' }}>
                      Enter the password you just set via "Forgot password?" for this account.
                    </p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Certifications (e.g. NASM, ACE)</label>
                <input name="certifications" type="text" placeholder="NASM, ACE, etc" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Years of Experience</label>
                <input name="experience" type="number" placeholder="5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Specialization (e.g. Weight Loss, Muscle Gain)</label>
                <input name="specialization" type="text" placeholder="Bodybuilding, Weight Loss, etc" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Social Media Handle (Optional)</label>
                <input name="social" type="text" placeholder="@yourhandle" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Location / City</label>
                <input name="location" type="text" placeholder="City, Country" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required />
              </div>
              
              <button type="submit" disabled={authLoading} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)', transition: 'all 0.2s ease' }}>
                {authLoading ? 'Creating account...' : 'Create Coach Account'}
              </button>
            </form>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <button type="button" onClick={() => { setShowAuthForm(false); setAuthTab('login'); }} style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                ← Back to Login
              </button>
              <button type="button" onClick={() => { setShowAuthForm(false); setAuthTab('login'); }} style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Already a coach account? Log in
              </button>
            </div>
          </div>
        </div>
      )}
      </>
        );
      })()}

      {/* CLIENT SIGN UP — mirrors the coach sign-up screen's design; creates a
          real Auth account then routes into the onboarding wizard. */}
      {step === 0 && authTab === 'client_signup' && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#0a0e1a', overflowY: 'auto', zIndex: 20 }}>
          <div className="animate-slide-in" style={{ background: '#0a0e1a', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '20px', padding: '40px 32px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <img src="/logo.png" alt="Fitengineers Logo" style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
            </div>

            <h2 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '22px', fontWeight: 800 }}>Create your account</h2>
            <p style={{ margin: '0 0 20px 0', color: 'rgba(226, 232, 240, 0.7)', fontSize: '14px' }}>Sign up to start your fitness journey with Fitengineers.</p>

            <form onSubmit={handleClientSignup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {authError && <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fecaca', fontSize: '0.78rem' }}>{authError}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Full Name</label>
                <input type="text" placeholder="Your name" value={authName} onChange={e => setAuthName(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required disabled={authLoading} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Email Address</label>
                <input type="email" placeholder="you@email.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required disabled={authLoading} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(226, 232, 240, 0.8)' }}>Password</label>
                <input type="password" placeholder="At least 6 characters" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }} required minLength={6} disabled={authLoading} />
              </div>

              <button type="submit" disabled={authLoading} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)' }}>
                {authLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <button type="button" onClick={() => { setAuthTab('login'); setAuthError(''); setAuthSuccessMsg(''); }} style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                ← Back to Login
              </button>
              <button type="button" onClick={() => { setAuthTab('login'); setAuthError(''); setAuthSuccessMsg(''); }} style={{ background: 'none', border: 'none', color: 'rgba(148, 163, 184, 0.8)', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Already have an account? Log in
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 0 && authTab !== 'coach_apply' && authTab !== 'client_signup' && (
        <div className={`onboarding-portal-wrapper ${(showAuthForm || showClientEmailForm || showCoachEmailForm) ? 'auth-form-active' : ''}`}>
          {/* TOP: Hevy-style slider with full-bleed background + centered phone mockup.
              Each slide has a background image, a phone mockup, and the slide content
              displayed IN the phone. Both background and phone animate together. */}
          <div className="portal-left-panel">
            <div className="portal-slider">
              {/* Slide 1 */}
              <div className={`portal-slide-wrapper ${activeSlide === 0 ? 'slide-active' : ''}`}>
                <img src="/background-1.webp" alt="" className="portal-slide-bg" draggable="false" />
                <div className="phone-mockup-centered">
                  <div className="phone-mockup">
                    <div className="phone-speaker"></div>
                    <div className="phone-screen">
                      <img src="/slide-1.webp" alt="Coach dashboard" className="phone-slide-content" draggable="false" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Slide 2 */}
              <div className={`portal-slide-wrapper ${activeSlide === 1 ? 'slide-active' : ''}`}>
                <img src="/background-2.webp" alt="" className="portal-slide-bg" draggable="false" />
                <div className="phone-mockup-centered">
                  <div className="phone-mockup">
                    <div className="phone-speaker"></div>
                    <div className="phone-screen">
                      <img src="/slide-2.webp" alt="Client home" className="phone-slide-content" draggable="false" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Slide 3 */}
              <div className={`portal-slide-wrapper ${activeSlide === 2 ? 'slide-active' : ''}`}>
                <img src="/background-3.webp" alt="" className="portal-slide-bg" draggable="false" />
                <div className="phone-mockup-centered">
                  <div className="phone-mockup">
                    <div className="phone-speaker"></div>
                    <div className="phone-screen">
                      <img src="/slide-3.webp" alt="Workout log" className="phone-slide-content" draggable="false" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Brand overlaid at the top over a dark scrim */}
              <div className="portal-slider-top-scrim">
                <div className="portal-logo-area">
                  <img src="/logo.png" className="portal-logo" alt="Fitengineers Logo" />
                  <h2 className="portal-brand-title">FITENGINEERS</h2>
                </div>
              </div>

              {/* Caption + dots overlaid at the bottom over a dark scrim */}
              <div className="portal-slider-bottom-scrim">
                <div className="carousel-caption-area">
                  <p className="carousel-text">
                    {activeSlide === 0 && "Coaches: manage clients & programs in one place."}
                    {activeSlide === 1 && "Clients: track your program and weekly progress."}
                    {activeSlide === 2 && "Log every set with a live timer & calorie tracking."}
                  </p>
                  <div className="carousel-dots">
                    <span className={`carousel-dot ${activeSlide === 0 ? 'active' : ''}`} onClick={() => setActiveSlide(0)}></span>
                    <span className={`carousel-dot ${activeSlide === 1 ? 'active' : ''}`} onClick={() => setActiveSlide(1)}></span>
                    <span className={`carousel-dot ${activeSlide === 2 ? 'active' : ''}`} onClick={() => setActiveSlide(2)}></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right/Bottom Side: Forms & Actions Card */}
          <div className="portal-right-panel">
            <div className="credentials-form-container animate-slide-in" style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

              {/* Role Toggle Tab — centered, no side heading */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '12px' }}>
                <div className="form-role-toggle" style={{ margin: 0, width: '100%', maxWidth: '300px' }}>
                  <button
                    type="button"
                    className={`role-toggle-btn ${userType === 'client' ? 'active-client' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => { localStorage.removeItem('pendingCoachApply'); setUserType('client'); setAuthError(''); setAuthSuccessMsg(''); setShowClientEmailForm(false); setShowCoachEmailForm(false); }}
                  >
                    Client
                  </button>
                  <button
                    type="button"
                    className={`role-toggle-btn ${userType === 'coach' ? 'active-coach' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => { setUserType('coach'); setAuthError(''); setAuthSuccessMsg(''); setShowCoachEmailForm(false); }}
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
                      // MUTUAL EXCLUSION: a CLIENT-initiated Google login must
                      // never route through any coach flow. Clear every coach
                      // flag that could linger from an earlier abandoned coach
                      // attempt on this device — a stale pendingCoachApply
                      // otherwise forces the coach sign-up form at mount when
                      // the OAuth redirect reloads the app (reported 2026-07-09:
                      // fresh client sent to "coach sign up"), and a stale
                      // pendingCoachLogin would route the returning session
                      // through the coach path in App.jsx.
                      localStorage.removeItem('pendingCoachApply');
                      sessionStorage.removeItem('pendingCoachLogin');
                      setGoogleModalIntent('client');
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

                  <p style={{ margin: '4px 0 0 0', color: 'rgba(226, 232, 240, 0.6)', fontSize: '12px', textAlign: 'center' }}>
                    New to Fitengineers?{' '}
                    <button
                      type="button"
                      onClick={() => { setAuthTab('client_signup'); setAuthError(''); setAuthSuccessMsg(''); setAuthPassword(''); }}
                      style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Sign up
                    </button>
                  </p>
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
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
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
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '12px' }}>
                      New here?{' '}
                      <button
                        type="button"
                        onClick={() => { setAuthTab('client_signup'); setAuthError(''); setAuthSuccessMsg(''); setAuthPassword(''); }}
                        style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Sign up
                      </button>
                    </span>
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
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: '12px' }}>
                      New here?{' '}
                      <button
                        type="button"
                        onClick={() => { setAuthTab('client_signup'); setAuthError(''); setAuthSuccessMsg(''); setForgotPasswordSuccessMsg(''); setAuthPassword(''); }}
                        style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Sign up
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('login');
                        setAuthError('');
                        setAuthSuccessMsg('');
                        setForgotPasswordSuccessMsg('');
                      }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      ← Back
                    </button>
                  </div>
                </form>
              )}

              {/* COACH FLOW — clean two-button chooser (mirrors client) */}
              {userType === 'coach' && !showCoachEmailForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <button
                    type="button"
                    className="gmail-login-btn"
                    style={{ width: '100%', margin: 0, padding: '12px' }}
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

                  <button
                    type="button"
                    className="guest-bypass-btn-new"
                    style={{ width: '100%', margin: 0, padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => { setShowCoachEmailForm(true); setAuthError(''); setAuthSuccessMsg(''); }}
                  >
                    Continue with email
                  </button>

                  <p style={{ margin: '4px 0 0 0', color: 'rgba(226, 232, 240, 0.6)', fontSize: '12px', textAlign: 'center' }}>
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
                </div>
              )}

              {/* COACH EMAIL FORM */}
              {userType === 'coach' && showCoachEmailForm && (
                <form onSubmit={handleCoachEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Coach Login</h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(226, 232, 240, 0.8)', fontWeight: 600 }}>Email Address</label>
                    <input 
                      type="email" 
                      placeholder="coach@fitengineers.com" 
                      value={authEmail} 
                      onChange={e => setAuthEmail(e.target.value)} 
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
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
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => { setShowCoachEmailForm(false); setAuthSuccessMsg(''); setAuthError(''); }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      ← Back
                    </button>
                  </div>
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
                    sessionStorage.removeItem('pendingCoachLogin');
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
