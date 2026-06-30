import { createClient } from '@supabase/supabase-js';
import { calculateTargetsGeneric, PROGRAM_TO_GOAL_LABEL, ACTIVITY_TO_LABEL, CONCERN_TO_LABEL } from '../utils/targets';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

console.log('Supabase Env Check:', {
  configured: isSupabaseConfigured,
  urlLength: supabaseUrl ? supabaseUrl.length : 0,
  keyLength: supabaseAnonKey ? supabaseAnonKey.length : 0
});

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    })
  : null;

export const TRAINER_EMAILS = [
  'subodhmankala@gmail.com',
  'trainer@fitengineers.com',
  'coach@fitengineers.com'
];

export const isTrainer = (email) => {
  if (!email) return false;
  const hardcoded = TRAINER_EMAILS.includes(email.toLowerCase());
  if (hardcoded) return true;
  const cachedRole = localStorage.getItem('userRole');
  return cachedRole === 'coach' || cachedRole === 'coach_pending' || cachedRole === 'super-admin' || cachedRole === 'admin';
};

export const isSuperAdmin = (email) => {
  if (!email) return false;
  return email.toLowerCase() === 'subodhmankala@gmail.com';
};


const getCleanClientKey = async (userId) => {
  if (!userId) return 'guest';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (isUuid && isSupabaseConfigured && supabase) {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      if (user && user.full_name) {
        return user.full_name.toLowerCase().replace(/\s+/g, '');
      }
    } catch (e) {
      console.error('Error resolving UUID to name for local storage key:', e);
    }
  }
  return userId.toLowerCase().replace(/\s+/g, '');
};

const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeInviteCode = (code) => String(code || '').trim().toUpperCase();

const createInviteCode = () => {
  let code = '';
  while (code.length < 6) {
    code += Math.random().toString(36).slice(2).toUpperCase();
  }
  return code.slice(0, 6);
};

const isPastTimestamp = (value) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

/**
 * DATABASE SERVICE
 * ----------------
 * Dual-layer service that communicates with a live cloud Supabase database
 * if configured in environment variables (.env), otherwise falls back
 * to high-performance local storage (localStorage) for seamless local-only testing.
 */
const databaseService = {
  supabase,
  // Helper for mock DB
  getMockTable(name) {
    return JSON.parse(localStorage.getItem(`mock_${name}`) || '[]');
  },
  saveMockTable(name, data) {
    localStorage.setItem(`mock_${name}`, JSON.stringify(data));
  },

  // ─── USER PROFILE ───
  async saveUserProfile(profile) {
    const email = profile.email || `${profile.userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
    let userId = profile.id || localStorage.getItem('userId');
    if (isSupabaseConfigured && supabase && userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      // Stale/mock id from an earlier offline fallback — don't let it leak into a live cloud session.
      userId = null;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Ensure user row exists in users
        let user = null;
        if (userId) {
          const { data: u } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
          user = u;
        }
        if (!user) {
          const { data: u } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
          user = u;
        }
        if (!user) {
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .upsert({
              email
            }, { onConflict: 'email' })
            .select()
            .single();
          if (userError) throw userError;
          user = newUser;
        }
        userId = user.id;

        // 2. Write client/coach record
        if (profile.role === 'coach' || profile.role === 'super-admin' || profile.role === 'admin') {
          const storedRole = profile.role === 'admin' ? 'super-admin' : profile.role;
          const { error: userRoleError } = await supabase
            .from('users')
            .update({
              full_name: profile.userName,
              role: storedRole
            })
            .eq('id', userId);
          if (userRoleError) {
            console.warn('Cloud DB: Could not sync coach role onto users row:', userRoleError);
          }

          const { error: coachError } = await supabase
            .from('coaches')
            .upsert({
              user_id: userId,
              status: 'approved',
              brand_name: profile.brand || `${profile.userName} Fitness`
            }, { onConflict: 'user_id' });
          if (coachError) throw coachError;
        } else {
          // It's a client
          const { error: clientError } = await supabase
            .from('clients')
            .upsert({
              user_id: userId,
              // null until the client redeems a coach's invite code (also guards against a
              // stale 'coach-id-default' placeholder value leaking into the DB)
              coach_id: (profile.coach_id && profile.coach_id !== 'coach-id-default') ? profile.coach_id : null,
              full_name: profile.userName,
              phone_number: profile.phone || '',
              fitness_goal: profile.userGoal,
              weight_kg: parseFloat(profile.userWeight) || null,
              height_cm: parseFloat(profile.userHeight) || null,
              age: parseInt(profile.userAge) || null,
              activity_level: profile.userActivity,
              dietary_preference: profile.userDiet,
              calorie_target: parseInt(profile.userCalorieTarget) || null,
              protein_target: parseInt(profile.userProteinTarget) || null,
              carbs_target: parseInt(profile.userCarbsTarget) || null,
              fats_target: parseInt(profile.userFatsTarget) || null,
              issue: profile.userIssue
            }, { onConflict: 'user_id' });
          if (clientError) throw clientError;
        }
        console.log('Cloud DB: Saved user profile under new schema.');
      } catch (e) {
        console.error('Cloud DB Sync Error: falling back to local.', e);
      }
    }

    // Always update Local Storage
    localStorage.setItem('userName', profile.userName);
    localStorage.setItem('userEmail', email);
    if (userId) localStorage.setItem('userId', userId);
    localStorage.setItem('userAge', profile.userAge || '');
    localStorage.setItem('userHeight', profile.userHeight || '');
    localStorage.setItem('userWeight', profile.userWeight || '');
    localStorage.setItem('userActivity', profile.userActivity || '');
    localStorage.setItem('userGoal', profile.userGoal || '');
    localStorage.setItem('userDiet', profile.userDiet || '');
    localStorage.setItem('userCalorieTarget', profile.userCalorieTarget || '');
    localStorage.setItem('userProteinTarget', profile.userProteinTarget || '');
    localStorage.setItem('userCarbsTarget', profile.userCarbsTarget || '');
    localStorage.setItem('userFatsTarget', profile.userFatsTarget || '');
    if (profile.userIssue) localStorage.setItem('userIssue', profile.userIssue);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);

    if (isSupabaseConfigured && supabase && !userId) {
      // Cloud is live but we never resolved a real UUID for this user — don't mask
      // that failure behind a mock id that would break later live writes.
      throw new Error('Could not resolve your account ID with the database. Please try again.');
    }

    // Update local mock tables
    const mockUsers = this.getMockTable('users');
    let mUser = mockUsers.find(u => u.email === email || (userId && u.id === userId));
    if (!mUser) {
      mUser = { id: userId || `mock-uid-${Date.now()}`, email, auth_provider: profile.auth_provider || 'email' };
      mockUsers.push(mUser);
      this.saveMockTable('users', mockUsers);
    }
    userId = mUser.id;
    localStorage.setItem('userId', userId);

    if (profile.role === 'coach' || profile.role === 'super-admin' || profile.role === 'admin') {
      mUser.role = profile.role === 'admin' ? 'super-admin' : profile.role;
      mUser.full_name = profile.userName;
      this.saveMockTable('users', mockUsers);

      const mockCoaches = this.getMockTable('coaches');
      let mCoach = mockCoaches.find(c => c.user_id === userId);
      const coachId = mCoach?.id || `coach-id-${Date.now()}`;
      if (!mCoach) {
        mCoach = { id: coachId, user_id: userId, status: 'approved', brand_name: profile.brand || `${profile.userName} Fitness` };
        mockCoaches.push(mCoach);
      } else {
        mCoach.brand_name = profile.brand || `${profile.userName} Fitness`;
        mCoach.status = 'approved';
      }
      this.saveMockTable('coaches', mockCoaches);
      localStorage.setItem('userCoachId', coachId);
    } else {
      const mockClients = this.getMockTable('clients');
      let mClient = mockClients.find(c => c.user_id === userId);
      const clientId = mClient?.id || `client-id-${Date.now()}`;
      const clientRecord = {
        id: clientId,
        user_id: userId,
        coach_id: profile.coach_id || localStorage.getItem('userCoachId') || null,
        full_name: profile.userName,
        phone_number: profile.phone || '',
        fitness_goal: profile.userGoal,
        weight_kg: parseFloat(profile.userWeight) || null,
        height_cm: parseFloat(profile.userHeight) || null,
        age: parseInt(profile.userAge) || null,
        activity_level: profile.userActivity,
        dietary_preference: profile.userDiet,
        calorie_target: parseInt(profile.userCalorieTarget) || null,
        protein_target: parseInt(profile.userProteinTarget) || null,
        carbs_target: parseInt(profile.userCarbsTarget) || null,
        fats_target: parseInt(profile.userFatsTarget) || null,
        issue: profile.userIssue
      };
      if (!mClient) {
        mockClients.push(clientRecord);
      } else {
        Object.assign(mClient, clientRecord);
      }
      this.saveMockTable('clients', mockClients);
      localStorage.setItem('userClientId', clientId);
    }
  },

  async getUserProfile(userName) {
    const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
    return this.getUserProfileByEmail(email);
  },

  // ─── DAILY TRACKER LOGS ───
  async saveTrackerLog(log) {
    const userName = localStorage.getItem('userName') || 'Warrior';
    const email = localStorage.getItem('userEmail') || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

    if (isSupabaseConfigured && supabase) {
      try {
        // First get user UUID from email
        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .single();

        if (userErr) throw userErr;

        if (user) {
          const { error } = await supabase
            .from('tracker_logs')
            .upsert({
              user_id: user.id,
              log_date: log.date || new Date().toISOString().split('T')[0],
              water_glasses: parseInt(log.waterGlasses || '0'),
              synced_steps: parseInt(log.syncedSteps || '0'),
              logged_calories: parseInt(log.loggedCalories || '0'),
              logged_protein: parseInt(log.loggedProtein || '0'),
              logged_fats: parseInt(log.loggedFats || '0'),
              walk_lunch_dinner: log.walkLunchDinner === 'true' || log.walkLunchDinner === true
            }, { onConflict: 'user_id, log_date' });

          if (error) throw error;
          console.log('Cloud DB: Synced daily tracker logs.');
        }
      } catch (e) {
        console.error('Cloud DB Tracker Sync Error:', e);
      }
    }

    // Always sync locally
    localStorage.setItem('waterGlasses', String(log.waterGlasses || '0'));
    localStorage.setItem('userSyncedSteps', String(log.syncedSteps || '0'));
    localStorage.setItem('userLoggedCalories', String(log.loggedCalories || '0'));
    localStorage.setItem('userLoggedProtein', String(log.loggedProtein || '0'));
    localStorage.setItem('userLoggedFats', String(log.loggedFats || '0'));
    localStorage.setItem('walkLunchDinner', String(log.walkLunchDinner || 'false'));
  },

  // ─── MONTHLY PROGRESS HISTORY ───
  async saveProgressHistory(history) {
    if (!history || !history.water) {
      console.warn('saveProgressHistory: No valid history provided for sync.');
      return;
    }
    const userName = localStorage.getItem('userName') || 'Warrior';
    const email = localStorage.getItem('userEmail') || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .single();

        if (user) {
          // Bulk upsert 30 days of data into progress_history
          const records = [];
          for (let i = 0; i < 30; i++) {
            records.push({
              user_id: user.id,
              day_number: i + 1,
              water_val: parseFloat(history.water[i]?.val || '0.0'),
              protein_val: parseInt(history.protein[i]?.val || '0'),
              fats_val: parseInt(history.fats[i]?.val || '0'),
              lifting_val: parseFloat(history.lifting[i]?.val || '0.0')
            });
          }

          const { error } = await supabase
            .from('progress_history')
            .upsert(records, { onConflict: 'user_id, day_number' });

          if (error) throw error;
          console.log('Cloud DB: Progress history synchronized.');
        }
      } catch (e) {
        console.error('Cloud DB Progress Sync Error:', e);
      }
    }

    // Cache locally
    localStorage.setItem('monthlyProgressHistory', JSON.stringify(history));
  },

  // ─── WORKOUT PROGRESS & SESSIONS ───
  async saveWorkoutSession(session) {
    const sessionClientName = session.clientName || localStorage.getItem('userName') || 'Warrior';
    const loggedInName = localStorage.getItem('userName') || '';
    const loggedInEmail = localStorage.getItem('userEmail') || '';
    
    let email = `${sessionClientName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
    // If the logged-in user is the client completing the workout, use their actual email
    if (loggedInName && loggedInName.toLowerCase().replace(/\s+/g, '') === sessionClientName.toLowerCase().replace(/\s+/g, '')) {
      if (loggedInEmail) {
        email = loggedInEmail;
      }
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let user = null;
        
        // 1. Try looking up user by email
        const { data: userByEmail } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (userByEmail) {
          user = userByEmail;
        } else {
          // 2. Try looking up user by full_name/sessionClientName (case-insensitive)
          const { data: usersByName } = await supabase
            .from('users')
            .select('id')
            .ilike('full_name', sessionClientName);
          
          if (usersByName && usersByName.length > 0) {
            user = usersByName[0];
          }
        }

        if (user) {
          const records = [];
          session.exercises.forEach(ex => {
            ex.sets.forEach((set, sIdx) => {
              records.push({
                user_id: user.id,
                log_date: session.date,
                exercise_name: ex.name,
                set_number: sIdx + 1,
                reps: parseInt(set.reps || '0'),
                weight_kg: parseFloat(set.weight || '0.0'),
                plan_name: session.planName || 'Custom Routine'
              });
            });
          });

          if (records.length > 0) {
            const { error } = await supabase
              .from('workout_logs')
              .insert(records);
            
            if (error) throw error;
            console.log('Cloud DB: Saved workout session sets.');
          }
        }
      } catch (e) {
        console.error('Cloud DB Workout Sync Error:', e);
      }
    }

    // Mirror the global workoutSessions (already saved by WorkoutTracker) under a client-specific key
    // so the trainer dashboard can look up sessions per client without scanning all sessions.
    const clientKey = sessionClientName.toLowerCase().replace(/\s+/g, '');
    const currentGlobal = localStorage.getItem('workoutSessions');
    if (currentGlobal) {
      // Filter to only this client's sessions for the client-specific key
      try {
        const allSessions = JSON.parse(currentGlobal);
        const clientSessions = allSessions.filter(s =>
          s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === clientKey
        );
        localStorage.setItem(`client_${clientKey}_workoutSessions`, JSON.stringify(clientSessions));
      } catch(e) {
        console.error('Error mirroring workout sessions per client:', e);
      }
    }
  },

  // ─── AUTHENTICATION ───
  async signUp(email, password) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    
    // Explicitly wipe lingering session state for a clean slate
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Signout prior to Google sign-in was skipped or not needed:", e);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async resetPassword(email) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    return data;
  },

  async updatePassword(newPassword) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return data;
  },

  async sendOTP(phone) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone
    });
    if (error) throw error;
    return data;
  },

  async verifyOTP(phone, token) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms'
    });
    if (error) throw error;
    return data;
  },

  async verifyEmailOTP(email, token) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  },

  async getSession() {
    if (isSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    }
    return null;
  },

  async getUserProfileByEmail(email) {
    if (!email) return null;
    const isSuperAdminEmail = email.toLowerCase() === 'subodhmankala@gmail.com';

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (userErr) throw userErr;
        
        if (user) {
          // Check if coach profile exists
          const { data: coach } = await supabase
            .from('coaches')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          // Check if client profile exists
          const { data: client } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          // No more coach approval/pending: any coaches row = an active coach.
          let activeRole = 'client';
          if (isSuperAdminEmail) {
            activeRole = 'super-admin';
          } else if (coach) {
            activeRole = 'coach';
          } else if (client) {
            activeRole = 'client';
          }

          localStorage.setItem('userRole', activeRole);
          if (coach) localStorage.setItem('userCoachId', coach.id);
          // Client stores their coach's ID — must remove (not stringify-null) when unset,
          // since localStorage.setItem(key, null) stores the literal truthy string "null".
          if (client) {
            if (client.coach_id) localStorage.setItem('userCoachId', client.coach_id);
            else localStorage.removeItem('userCoachId');
          }
          if (client) localStorage.setItem('userClientId', client.id);

          return {
            id: user.id,
            userName: client?.full_name || coach?.brand_name || user.email.split('@')[0],
            userAge: client?.age ? String(client.age) : '',
            userHeight: client?.height_cm ? String(client.height_cm) : '',
            userWeight: client?.weight_kg ? String(client.weight_kg) : '',
            userActivity: client?.activity_level || '',
            userGoal: client?.fitness_goal || '',
            userIssue: client?.issue || '',
            userDiet: client?.dietary_preference || '',
            userCalorieTarget: client?.calorie_target ? String(client.calorie_target) : '',
            userProteinTarget: client?.protein_target ? String(client.protein_target) : '',
            userCarbsTarget: client?.carbs_target ? String(client.carbs_target) : '',
            userFatsTarget: client?.fats_target ? String(client.fats_target) : '',
            role: activeRole,
            phone: client?.phone_number || '',
            brand: coach?.brand_name || 'Fit Engineers',
            payment_status: 'active',
            coach_id: client?.coach_id || null,
            userCoachId: coach?.id || null,
            userClientId: client?.id || null,
            coachIsBlocked: coach?.is_blocked === true,
            program: client?.program || null,
            primaryConcern: client?.primary_concern || null,
            primary_concern: client?.primary_concern || null,
            onboardingCompleted: client?.onboarding_completed === true,
            onboarding_completed: client?.onboarding_completed ?? false,
            verified: activeRole === 'coach' || activeRole === 'super-admin'
          };
        }
      } catch (e) {
        console.error('Cloud DB Fetch Error by email:', e);
      }
    }

    // Local Mock database check
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (mUser || isSuperAdminEmail) {
      const userId = mUser?.id || 'mock-admin-uid';
      const mockCoaches = this.getMockTable('coaches');
      const mockClients = this.getMockTable('clients');

      const mCoach = mockCoaches.find(c => c.user_id === userId);
      const mClient = mockClients.find(c => c.user_id === userId);

      // No more coach approval/pending: any coaches row = an active coach.
      let activeRole = 'client';
      if (isSuperAdminEmail) {
        activeRole = 'super-admin';
      } else if (mCoach) {
        activeRole = 'coach';
      } else if (mClient) {
        activeRole = 'client';
      }

      localStorage.setItem('userRole', activeRole);
      if (mCoach) localStorage.setItem('userCoachId', mCoach.id);
      if (mClient) {
        if (mClient.coach_id) localStorage.setItem('userCoachId', mClient.coach_id);
        else localStorage.removeItem('userCoachId');
      }
      if (mClient) localStorage.setItem('userClientId', mClient.id);

      return {
        id: userId,
        userName: mClient?.full_name || mCoach?.brand_name || email.split('@')[0],
        userAge: mClient?.age ? String(mClient.age) : '',
        userHeight: mClient?.height_cm ? String(mClient.height_cm) : '',
        userWeight: mClient?.weight_kg ? String(mClient.weight_kg) : '',
        userActivity: mClient?.activity_level || '',
        userGoal: mClient?.fitness_goal || '',
        userIssue: mClient?.issue || '',
        userDiet: mClient?.dietary_preference || '',
        userCalorieTarget: mClient?.calorie_target ? String(mClient.calorie_target) : '',
        userProteinTarget: mClient?.protein_target ? String(mClient.protein_target) : '',
        userCarbsTarget: mClient?.carbs_target ? String(mClient.carbs_target) : '',
        userFatsTarget: mClient?.fats_target ? String(mClient.fats_target) : '',
        role: activeRole,
        phone: mClient?.phone_number || '',
        brand: mCoach?.brand_name || 'Fit Engineers',
        payment_status: 'active',
        coach_id: mClient?.coach_id || null,
        userCoachId: mCoach?.id || null,
        userClientId: mClient?.id || null,
        coachIsBlocked: mCoach?.is_blocked === true,
        program: mClient?.program || null,
        primaryConcern: mClient?.primary_concern || null,
        primary_concern: mClient?.primary_concern || null,
        onboardingCompleted: mClient?.onboarding_completed === true,
        onboarding_completed: mClient?.onboarding_completed ?? false,
        verified: activeRole === 'coach' || activeRole === 'super-admin'
      };
    }

    return null;
  },

  async loadProfileIntoLocalStorage(profile, email) {
    localStorage.setItem('userName', profile.userName || 'Trainer');
    localStorage.setItem('userEmail', email);
    if (profile.id) localStorage.setItem('userId', profile.id);
    if (profile.userCoachId) localStorage.setItem('userCoachId', profile.userCoachId);
    if (profile.userClientId) localStorage.setItem('userClientId', profile.userClientId);
    if (profile.userAge) localStorage.setItem('userAge', profile.userAge);
    if (profile.userHeight) localStorage.setItem('userHeight', profile.userHeight);
    if (profile.userWeight) localStorage.setItem('userWeight', profile.userWeight);
    if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
    if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
    if (profile.userIssue) localStorage.setItem('userIssue', profile.userIssue);
    if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
    if (profile.userCalorieTarget) localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    if (profile.userProteinTarget) localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    if (profile.userFatsTarget) localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.payment_status) localStorage.setItem('userPaymentStatus', profile.payment_status);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);
    // Store onboarding wizard flags (support both camelCase and snake_case callers)
    const isOnboardingDone = profile.onboardingCompleted === true || profile.onboarding_completed === true;
    localStorage.setItem('onboardingWizardCompleted', isOnboardingDone ? 'true' : 'false');
    localStorage.setItem('onboardingCompleted', isOnboardingDone ? 'true' : 'false');
    if (profile.program) localStorage.setItem('userProgram', profile.program);
    if (profile.primaryConcern) localStorage.setItem('userPrimaryConcern', profile.primaryConcern);
    if (profile.primary_concern) localStorage.setItem('userPrimaryConcern', profile.primary_concern);
    localStorage.setItem('onboardingComplete', 'true');
  },

  // ─── CLIENT ONBOARDING WIZARD ───
  async saveClientOnboardingData({ age, weight_kg, height_cm, program, activity_level, primary_concern }) {
    const userId = localStorage.getItem('userId');
    const email = localStorage.getItem('userEmail');

    // Update localStorage immediately
    if (age) localStorage.setItem('userAge', String(age));
    if (weight_kg) localStorage.setItem('userWeight', String(weight_kg));
    if (height_cm) localStorage.setItem('userHeight', String(height_cm));
    if (activity_level) localStorage.setItem('userActivity', activity_level);
    if (program) localStorage.setItem('userProgram', program);
    if (primary_concern) localStorage.setItem('userPrimaryConcern', primary_concern);
    localStorage.setItem('onboardingCompleted', 'true');

    // Map program → fitness_goal for existing dashboard compatibility
    const goalMap = {
      fat_loss: 'Fat Loss',
      muscle_building: 'Muscle Building',
      gut_repair: 'Gut Health'
    };
    const mappedGoal = goalMap[program] || program || 'Fat Loss';
    localStorage.setItem('userGoal', mappedGoal);

    // Map activity_level → existing activity strings
    const activityMap = {
      sedentary: 'Sedentary',
      lightly_active: 'Lightly Active',
      moderately_active: 'Moderately Active',
      very_active: 'Very Active'
    };
    const mappedActivity = activityMap[activity_level] || activity_level || 'Moderately Active';
    localStorage.setItem('userActivity', mappedActivity);

    if (isSupabaseConfigured && supabase) {
      try {
        // Resolve user UUID if needed
        let resolvedUserId = userId;
        if (!resolvedUserId && email) {
          const { data: u } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
          resolvedUserId = u?.id;
          if (resolvedUserId) localStorage.setItem('userId', resolvedUserId);
        }

        if (!resolvedUserId) throw new Error('Cannot resolve userId for onboarding save');

        const updatePayload = {
          onboarding_completed: true,
          program: program || null,
          activity_level: activity_level || null,
          primary_concern: primary_concern || null,
          fitness_goal: mappedGoal
        };
        if (age) updatePayload.age = parseInt(age);
        if (weight_kg) updatePayload.weight_kg = parseFloat(weight_kg);
        if (height_cm) updatePayload.height_cm = parseFloat(height_cm);

        const { error } = await supabase
          .from('clients')
          .update(updatePayload)
          .eq('user_id', resolvedUserId);

        if (error) throw error;
        console.log('Cloud DB: Saved onboarding wizard data.');
      } catch (e) {
        console.error('Cloud DB: Failed to save onboarding data:', e);
      }
    } else {
      // Mock DB update
      const mockClients = this.getMockTable('clients');
      const mClient = mockClients.find(c => c.user_id === userId);
      if (mClient) {
        mClient.onboarding_completed = true;
        mClient.program = program || null;
        mClient.activity_level = activity_level || null;
        mClient.primary_concern = primary_concern || null;
        mClient.fitness_goal = mappedGoal;
        if (age) mClient.age = parseInt(age);
        if (weight_kg) mClient.weight_kg = parseFloat(weight_kg);
        if (height_cm) mClient.height_cm = parseFloat(height_cm);
        this.saveMockTable('clients', mockClients);
      }
    }
  },

  async getAllUsers() {
    const loggedInEmail = localStorage.getItem('userEmail');
    const loggedInRole = localStorage.getItem('userRole');
    const loggedInCoachId = localStorage.getItem('userCoachId');
    const loggedInUserId = localStorage.getItem('userId');

    if (isSupabaseConfigured && supabase) {
      try {
        // clients has two FKs to users (user_id and coach_id), so the embed
        // must specify which relationship to follow or PostgREST rejects the
        // query as ambiguous (PGRST201) — here we want the client's own user row.
        let query = supabase.from('clients').select('*, users!clients_user_id_fkey(email)');
        
        const isCoachOrAdmin = loggedInRole === 'coach' || loggedInRole === 'super-admin' || loggedInRole === 'admin';
        if (isCoachOrAdmin && loggedInRole !== 'super-admin') {
          // In Supabase, clients.coach_id stores the coach's users.id UUID
          if (loggedInUserId) {
            query = query.eq('coach_id', loggedInUserId);
          }
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          return data.map(c => ({
            id: c.user_id, // Keep user_id as id for workout_logs/chats compatibility
            client_id: c.id,
            email: c.users?.email || '',
            userName: c.full_name,
            userAge: String(c.age || ''),
            userHeight: String(c.height_cm || ''),
            userWeight: String(c.weight_kg || ''),
            userActivity: c.activity_level || '',
            userGoal: c.fitness_goal || '',
            userDiet: c.dietary_preference || '',
            userCalorieTarget: String(c.calorie_target || ''),
            userProteinTarget: String(c.protein_target || ''),
            userCarbsTarget: String(c.carbs_target || ''),
            userFatsTarget: String(c.fats_target || ''),
            role: 'client',
            phone: c.phone_number,
            coach_id: c.coach_id
          }));
        }
      } catch (e) {
        console.error('Cloud DB Fetch all clients error:', e);
      }
    }

    // Local Storage Fallback
    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');
    
    let filtered = mockClients;
    const isCoachOrAdmin = loggedInRole === 'coach' || loggedInRole === 'super-admin' || loggedInRole === 'admin';
    if (isCoachOrAdmin && loggedInRole !== 'super-admin') {
      filtered = mockClients.filter(c => c.coach_id === loggedInCoachId || c.coach_id === loggedInUserId);
    }

    return filtered.map(c => {
      const u = mockUsers.find(user => user.id === c.user_id);
      return {
        id: c.user_id,
        client_id: c.id,
        email: u?.email || `${c.full_name.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`,
        userName: c.full_name,
        userAge: String(c.age || ''),
        userHeight: String(c.height_cm || ''),
        userWeight: String(c.weight_kg || ''),
        userActivity: c.activity_level || '',
        userGoal: c.fitness_goal || '',
        userDiet: c.dietary_preference || '',
        userCalorieTarget: String(c.calorie_target || ''),
        userProteinTarget: String(c.protein_target || ''),
        userCarbsTarget: String(c.carbs_target || ''),
        userFatsTarget: String(c.fats_target || ''),
        role: 'client',
        phone: c.phone_number,
        coach_id: c.coach_id
      };
    });
  },

  // Used by the Platform Admin "Coaches Directory" drill-down. Deliberately
  // mirrors getAllUsers()'s coach-filtered query exactly (same table, same
  // coach_id equality, same field mapping) so the admin view and a coach's
  // own "My Clients" list can never disagree about who's attached to whom.
  async getClientsForCoach(coachId) {
    if (!coachId) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*, users!clients_user_id_fkey(email)')
          .eq('coach_id', coachId);

        if (error) throw error;
        if (data) {
          return data.map(c => ({
            id: c.user_id,
            client_id: c.id,
            email: c.users?.email || '',
            userName: c.full_name,
            userAge: String(c.age || ''),
            userHeight: String(c.height_cm || ''),
            userWeight: String(c.weight_kg || ''),
            userActivity: c.activity_level || '',
            userGoal: c.fitness_goal || '',
            userDiet: c.dietary_preference || '',
            userCalorieTarget: String(c.calorie_target || ''),
            userProteinTarget: String(c.protein_target || ''),
            userCarbsTarget: String(c.carbs_target || ''),
            userFatsTarget: String(c.fats_target || ''),
            role: 'client',
            phone: c.phone_number,
            coach_id: c.coach_id
          }));
        }
      } catch (e) {
        console.error('Cloud DB Fetch clients for coach error:', e);
      }
    }

    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');
    return mockClients.filter(c => c.coach_id === coachId).map(c => {
      const u = mockUsers.find(user => user.id === c.user_id);
      return {
        id: c.user_id,
        client_id: c.id,
        email: u?.email || '',
        userName: c.full_name,
        userAge: String(c.age || ''),
        userHeight: String(c.height_cm || ''),
        userWeight: String(c.weight_kg || ''),
        userActivity: c.activity_level || '',
        userGoal: c.fitness_goal || '',
        userDiet: c.dietary_preference || '',
        userCalorieTarget: String(c.calorie_target || ''),
        userProteinTarget: String(c.protein_target || ''),
        userCarbsTarget: String(c.carbs_target || ''),
        userFatsTarget: String(c.fats_target || ''),
        role: 'client',
        phone: c.phone_number,
        coach_id: c.coach_id
      };
    });
  },

  async getWorkoutLogsForUser(userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        let resolvedUserId = userId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (!isUuid) {
          // Resolve full_name to UUID first
          const { data: usersByName } = await supabase
            .from('users')
            .select('id')
            .ilike('full_name', userId)
            .maybeSingle();
          if (usersByName) resolvedUserId = usersByName.id;
        }

        const isResolvedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedUserId);
        if (isResolvedUuid) {
          const { data, error } = await supabase
            .from('workout_logs')
            .select('*')
            .eq('user_id', resolvedUserId)
            .order('log_date', { ascending: false })
            .order('exercise_name', { ascending: true })
            .order('set_number', { ascending: true });
          
          if (error) throw error;
          return data || [];
        }
      } catch (e) {
        console.error('Cloud DB Fetch workout logs error:', e);
      }
    }

    // Offline local storage fallback - check client-specific key first, then global
    const keyPrefix = `client_${userId}_`;
    const clientSpecific = localStorage.getItem(`${keyPrefix}workoutSessions`);
    const globalSessions = localStorage.getItem('workoutSessions');
    
    // Try client-specific store first, then fallback to global filtered by clientName or userId
    const stored = clientSpecific || globalSessions;
    if (stored) {
      try {
        const sessions = JSON.parse(stored);
        const flatLogs = [];
        sessions.forEach(sess => {
          // Match by: clientName cleaned matches userId, or if this is client-specific store (no filter needed)
          const sessionClientKey = sess.clientName
            ? sess.clientName.toLowerCase().replace(/\s+/g, '')
            : '';
          const isMatch = clientSpecific // if using client-specific store, include all
            || sessionClientKey === userId.toLowerCase()
            || (sess.clientId && sess.clientId === userId);
          
          if (isMatch && sess.exercises) {
            sess.exercises.forEach(ex => {
              if (ex.sets) {
                ex.sets.forEach((set, sIdx) => {
                  flatLogs.push({
                    log_date: sess.date,
                    exercise_name: ex.name,
                    set_number: sIdx + 1,
                    reps: parseInt(set.reps || '0'),
                    weight_kg: parseFloat(set.weight || '0.0'),
                    plan_name: sess.planName || 'Custom Routine'
                  });
                });
              }
            });
          }
        });
        return flatLogs;
      } catch (e) {
        console.error("Error parsing local workout sessions:", e);
      }
    }
    return [];
  },

  async saveChatMessage(clientId, sender, message) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .insert({
            client_id: clientId,
            sender: sender,
            message: message
          })
          .select();
        
        if (error) throw error;
        if (data && data.length > 0) {
          return data;
        }
      } catch (e) {
        console.error('Cloud DB Save Chat Error, falling back to local:', e);
      }
    }
    
    // Offline local storage fallback
    const key = `local_chat_${clientId || 'guest'}`;
    const stored = localStorage.getItem(key);
    let messages = [];
    if (stored) {
      try { messages = JSON.parse(stored); } catch(e) {}
    }
    const newMsg = {
      id: Date.now(),
      sender: sender,
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages.push(newMsg);
    localStorage.setItem(key, JSON.stringify(messages));
    return [newMsg];
  },

  async getChatMessages(clientId) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        if (data) {
          return data.map(msg => ({
            id: msg.id,
            sender: msg.sender,
            text: msg.message,
            time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
        }
      } catch (e) {
        console.error('Cloud DB Get Chat Error, falling back to local:', e);
      }
    }
    
    // Offline local storage fallback
    const key = `local_chat_${clientId || 'guest'}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return [];
  },

  // ─── DEFAULT WORKOUT TEMPLATES (Push/Pull/Leg) ───
  BUILTIN_TEMPLATES: [
    {
      id: 'tpl-push-day',
      name: 'Push Day',
      emoji: '💪',
      description: 'Chest, shoulders & triceps',
      is_default: true,
      exercises: [
        { name: 'Flat Bench Press',        sets: 3, reps: '8–12', order: 1 },
        { name: 'Overhead Triceps Extension', sets: 3, reps: '8–12', order: 2 },
        { name: 'Incline Dumbbell Press',  sets: 3, reps: '8–12', order: 3 },
        { name: 'Dumbbell Lateral Raises', sets: 3, reps: '10–15', order: 4 }
      ]
    },
    {
      id: 'tpl-pull-day',
      name: 'Pull Day',
      emoji: '🏋️',
      description: 'Back & biceps',
      is_default: true,
      exercises: [
        { name: 'Romanian Deadlift', sets: 3, reps: '8–12', order: 1 },
        { name: 'Lat Pull Down',     sets: 3, reps: '8–12', order: 2 },
        { name: 'One Arm Row',       sets: 3, reps: '8–12', order: 3 },
        { name: 'Biceps Curls',      sets: 3, reps: '10–15', order: 4 }
      ]
    },
    {
      id: 'tpl-leg-day',
      name: 'Leg Day',
      emoji: '🦵',
      description: 'Quads, hamstrings & calves',
      is_default: true,
      exercises: [
        { name: 'Barbell Squat',      sets: 3, reps: '8–12', order: 1 },
        { name: 'Leg Extensions',     sets: 3, reps: '10–15', order: 2 },
        { name: 'Romanian Deadlift',  sets: 3, reps: '8–12', order: 3 },
        { name: 'Hanging Leg Raises', sets: 3, reps: '12–15', order: 4 }
      ]
    }
  ],

  async getDefaultWorkoutTemplates() {
    if (isSupabaseConfigured && supabase) {
      try {
        // Excludes difficulty-leveled generic workouts (see getGenericWorkoutsByLevel)
        // so this keeps returning only the original undifferentiated Push/Pull/Leg
        // Day templates — the leveled library is a separate, additive surface.
        const { data, error } = await supabase
          .from('workout_templates')
          .select('*')
          .eq('is_default', true)
          .is('difficulty_level', null)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          return data.map(t => ({
            id: t.id,
            name: t.name,
            emoji: t.name.toLowerCase().includes('push') ? '💪' : t.name.toLowerCase().includes('pull') ? '🏋️' : '🦵',
            description: t.name.toLowerCase().includes('push') ? 'Chest, shoulders & triceps' :
                         t.name.toLowerCase().includes('pull') ? 'Back & biceps' : 'Quads, hamstrings & calves',
            is_default: t.is_default,
            exercises: Array.isArray(t.exercises) ? t.exercises : JSON.parse(t.exercises || '[]')
          }));
        }
      } catch (e) {
        console.error('Cloud DB: Failed to load workout templates:', e);
      }
    }
    // Fallback to built-in hardcoded templates
    return this.BUILTIN_TEMPLATES;
  },

  // ─── GENERIC WORKOUT LIBRARY BY DIFFICULTY LEVEL ───
  async getGenericWorkoutsByLevel(level) {
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('workout_templates')
          .select('*')
          .eq('difficulty_level', level)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data) {
          return data.map(t => ({
            id: t.id,
            name: t.name,
            difficulty_level: t.difficulty_level,
            exercises: Array.isArray(t.exercises) ? t.exercises : JSON.parse(t.exercises || '[]')
          }));
        }
      } catch (e) {
        console.error('Cloud DB: Failed to load generic workouts by level:', e);
      }
    }
    return [];
  },

  // ─── WORKOUT ROUTINE TEMPLATES / PLANS ───
  async getWorkoutPlansForUser(userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Resolve user UUID — try the passed value first, then session userId
        let resolvedUserId = userId;
        const UUID_RE_LOCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = UUID_RE_LOCAL.test(userId);

        if (!isUuid) {
          // Try name lookup first
          const { data: usersByName } = await supabase
            .from('users')
            .select('id')
            .ilike('full_name', userId)
            .maybeSingle();
          if (usersByName) {
            resolvedUserId = usersByName.id;
          } else {
            // Fall back to the authenticated session's userId from localStorage
            const sessionId = localStorage.getItem('userId');
            if (sessionId && UUID_RE_LOCAL.test(sessionId)) {
              resolvedUserId = sessionId;
            }
          }
        }

        const isResolvedUuid = UUID_RE_LOCAL.test(resolvedUserId);
        if (isResolvedUuid) {
          const { data, error } = await supabase
            .from('workout_plans')
            .select('*')
            .eq('user_id', resolvedUserId)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          if (data) {
            return data.map(p => ({
              id: p.id,
              userId: p.user_id,
              planName: p.plan_name,
              exercises: p.exercises,
              createdBy: p.created_by,
              createdAt: p.created_at
            }));
          }
        }
      } catch (e) {
        console.error('Cloud DB Fetch workout plans error:', e);
      }
    }

    // Offline local storage fallback — also merge UUID-keyed entries
    const clientKey = await getCleanClientKey(userId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    let plans = [];
    if (stored) {
      try { plans = JSON.parse(stored); } catch (e) { /* */ }
    }
    // Also check UUID-keyed localStorage if userId is a name
    const sessionId = localStorage.getItem('userId');
    if (sessionId && sessionId !== userId) {
      const uuidKey = `client_${sessionId}_workoutPlans`;
      const uuidStored = localStorage.getItem(uuidKey);
      if (uuidStored) {
        try {
          const uuidPlans = JSON.parse(uuidStored);
          // Merge, deduplicating by plan id
          const existingIds = new Set(plans.map(p => p.id));
          uuidPlans.forEach(p => { if (!existingIds.has(p.id)) plans.push(p); });
        } catch (e) { /* */ }
      }
    }
    return plans;
  },

  async saveWorkoutPlan(plan) {
    const targetUserId = plan.userId;

    if (plan.createdBy !== 'coach' && plan.createdBy !== 'client') {
      throw new Error('saveWorkoutPlan requires an explicit createdBy of "coach" or "client".');
    }

    // Set fallback local ID if not defined
    if (!plan.id) {
      plan.id = `plan-${Date.now()}`;
    }
    plan.createdAt = plan.createdAt || new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        let resolvedUserId = targetUserId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
        
        if (!isUuid) {
          const { data: usersByName } = await supabase
            .from('users')
            .select('id')
            .ilike('full_name', targetUserId)
            .maybeSingle();
          
          if (usersByName) {
            resolvedUserId = usersByName.id;
          }
        }

        const planRecord = {
          plan_name: plan.planName,
          exercises: plan.exercises,
          created_by: plan.createdBy
        };

        const isPlanUuid = plan.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.id);
        if (isPlanUuid) {
          planRecord.id = plan.id;
        }
        planRecord.user_id = resolvedUserId;

        const { data, error } = await supabase
          .from('workout_plans')
          .upsert(planRecord)
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          plan.id = data[0].id;
          plan.userId = data[0].user_id;
        }
      } catch (e) {
        console.error('Cloud DB Workout Plan Sync Error:', e);
      }
    }

    // Mirror to local storage
    const clientKey = await getCleanClientKey(targetUserId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    let plans = [];
    if (stored) {
      try { plans = JSON.parse(stored); } catch(e) {}
    }
    
    const existingIdx = plans.findIndex(p => p.id === plan.id || p.planName.toLowerCase() === plan.planName.toLowerCase());
    if (existingIdx >= 0) {
      plans[existingIdx] = plan;
    } else {
      plans.push(plan);
    }
    localStorage.setItem(key, JSON.stringify(plans));
    return plan;
  },

  async deleteWorkoutPlan(planId, userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        const isPlanUuid = planId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId);
        if (isPlanUuid) {
          const { error } = await supabase
            .from('workout_plans')
            .delete()
            .eq('id', planId);
          if (error) throw error;
        }
      } catch (e) {
        console.error('Cloud DB Workout Plan Delete Error:', e);
      }
    }

    // Mirror to local storage
    const clientKey = await getCleanClientKey(userId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        let plans = JSON.parse(stored);
        plans = plans.filter(p => p.id !== planId);
        localStorage.setItem(key, JSON.stringify(plans));
      } catch(e) {
        console.error("Error deleting local workout plan:", e);
      }
    }
  },

  // ─── MULTI-COACH & SUPER ADMIN METHODS ───
  // Resolves a coach's display name for client-facing UI (e.g. "Coach: [Name]"
  // after a successful invite-code connection). Prefers the coach's own account
  // name over their business/brand name, since "actual name" was the ask;
  // returns null (caller falls back to the raw coach_id) if neither exists.
  async getCoachNameById(coachId) {
    if (!coachId || !isSupabaseConfigured || !supabase) return null;
    try {
      const { data: userRow } = await supabase.from('users').select('full_name').eq('id', coachId).maybeSingle();
      if (userRow?.full_name) return userRow.full_name;
      const { data: coachRow } = await supabase.from('coaches').select('brand_name').eq('user_id', coachId).maybeSingle();
      return coachRow?.brand_name || null;
    } catch (e) {
      console.error('[getCoachNameById] error:', e);
      return null;
    }
  },

  async getAllCoaches() {
    if (isSupabaseConfigured && supabase) {
      try {
        // Source of truth for "is a coach" is the coaches table, not users.role —
        // the super-admin account has an approved coaches row but role='super-admin',
        // so filtering users by role='coach' was excluding them from this list entirely.
        const { data, error } = await supabase
          .from('coaches')
          .select('user_id, brand_name, status, experience_years, is_blocked, created_at, users(id, email, full_name, payment_status, created_at)')
          .eq('status', 'approved')
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data) {
          // Live count of clients currently linked to each coach — COUNT(*) FROM clients
          // WHERE coach_id = <coach id>. This is the same `clients` table Part 4's
          // "Connect to coach" flow updates on a successful connection, so a freshly
          // connected client is reflected here on the next load with no extra steps.
          const { data: clientCounts } = await supabase
            .from('clients')
            .select('coach_id');

          return data.map(coach => {
            const coachUserId = coach.user_id;
            const clients = clientCounts ? clientCounts.filter(c => c.coach_id === coachUserId) : [];
            return {
              id: coachUserId,
              name: coach.users?.full_name || 'Coach',
              email: coach.users?.email || '',
              brand: coach.brand_name || 'Fit Engineers',
              payment_status: coach.users?.payment_status || 'active',
              experienceYears: coach.experience_years ?? null,
              isBlocked: coach.is_blocked === true,
              signup_date: coach.created_at || coach.users?.created_at || new Date().toISOString(),
              clientsCount: clients.length
            };
          });
        }
      } catch (e) {
        console.error('Cloud DB Fetch all coaches error:', e);
      }
    }

    // Local storage fallback for coaches
    const cachedCoaches = localStorage.getItem('coaches_list');
    let coaches = cachedCoaches ? JSON.parse(cachedCoaches) : [
      { id: 'coach-ravi', name: 'Coach Ravi', email: 'ravi@fitengineers.com', brand: 'Ravi Fitness', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 },
      { id: 'coach-subodh', name: 'Coach Subodh', email: 'coach@fitengineers.com', brand: 'Fit Engineers', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 }
    ];

    // Compute client counts from the same mock `clients` table the offline
    // "Connect to coach" fallback writes coach_id onto.
    const mockClients = this.getMockTable('clients');
    coaches.forEach(coach => {
      coach.clientsCount = mockClients.filter(c => c.coach_id === coach.id).length;
    });

    return coaches;
  },

  // ─── ADMIN: LIVE COACH CLIENT COUNTS ───
  // Queries approved coaches from public.coaches joined with public.users for display names,
  // then counts clients per coach from public.clients WHERE coach_id = <coach's users.id>.
  // This accurately reflects Part 4's connect flow (clients.coach_id = coach's users.id UUID).
  async getCoachesWithClientCounts() {
    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Get all approved coaches with their user info (name, email)
        const { data: coachRows, error: coachErr } = await supabase
          .from('coaches')
          .select('id, user_id, brand_name, status, created_at, users(id, email, full_name)')
          .eq('status', 'approved')
          .order('created_at', { ascending: true });

        if (coachErr) throw coachErr;

        if (!coachRows || coachRows.length === 0) {
          // Fallback: try fetching from users table with role=coach
          const { data: userCoaches, error: ucErr } = await supabase
            .from('users')
            .select('id, email, full_name, created_at')
            .eq('role', 'coach');

          if (ucErr) throw ucErr;

          // Count clients per coach using users.id (= clients.coach_id)
          const { data: allClients } = await supabase
            .from('clients')
            .select('coach_id');

          return (userCoaches || []).map(coach => {
            const count = (allClients || []).filter(c => c.coach_id === coach.id).length;
            return {
              id: coach.id,
              userId: coach.id,
              name: coach.full_name || coach.email?.split('@')[0] || 'Coach',
              email: coach.email || '',
              clientCount: count,
              joined: coach.created_at
            };
          });
        }

        // 2. Fetch all clients and their coach_id in one query (avoids N+1)
        const { data: allClients } = await supabase
          .from('clients')
          .select('coach_id');

        // 3. Map each coach: count clients WHERE clients.coach_id = coach's users.id
        return coachRows.map(coach => {
          const coachUserId = coach.user_id || coach.users?.id;
          const count = (allClients || []).filter(c => c.coach_id === coachUserId).length;
          return {
            id: coach.id,
            userId: coachUserId,
            name: coach.users?.full_name || coach.brand_name || coach.users?.email?.split('@')[0] || 'Coach',
            email: coach.users?.email || '',
            brand: coach.brand_name || '',
            clientCount: count,
            joined: coach.created_at
          };
        });
      } catch (e) {
        console.error('[getCoachesWithClientCounts] Error:', e);
      }
    }

    // Mock / offline fallback
    const mockCoaches = this.getMockTable('coaches');
    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');

    return mockCoaches.map(coach => {
      const coachUser = mockUsers.find(u => u.id === coach.user_id);
      const count = mockClients.filter(c => c.coach_id === coach.user_id).length;
      return {
        id: coach.id,
        userId: coach.user_id,
        name: coachUser?.full_name || coach.brand_name || 'Coach',
        email: coachUser?.email || '',
        brand: coach.brand_name || '',
        clientCount: count,
        joined: coach.created_at || new Date().toISOString()
      };
    });
  },

  async saveCoachProfile(coach) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('users')
          .update({
            brand: coach.brand,
            payment_status: coach.payment_status,
            isSubscriptionActive: coach.payment_status === 'active'
          })
          .eq('id', coach.id);
        
        if (error) {
          if (error.code === '42703') {
            const { error: retryError } = await supabase
              .from('users')
              .update({
                brand: coach.brand,
                payment_status: coach.payment_status
              })
              .eq('id', coach.id);
            if (retryError) throw retryError;
          } else {
            throw error;
          }
        }
      } catch (e) {
        console.error('Error saving coach profile on cloud DB:', e);
      }
    }

    // Mirror to local storage fallback
    const cachedCoaches = localStorage.getItem('coaches_list');
    if (cachedCoaches) {
      try {
        let coaches = JSON.parse(cachedCoaches);
        const idx = coaches.findIndex(c => c.id === coach.id);
        if (idx >= 0) {
          coaches[idx] = { ...coaches[idx], ...coach };
            localStorage.setItem('coaches_list', JSON.stringify(coaches));
            try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: coaches })); } catch(e) {}
        }
      } catch (e) {}
    } else {
      const defaults = [
        { id: 'coach-ravi', name: 'Coach Ravi', email: 'ravi@fitengineers.com', brand: 'Ravi Fitness', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 },
        { id: 'coach-subodh', name: 'Coach Subodh', email: 'coach@fitengineers.com', brand: 'Fit Engineers', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 }
      ];
      const idx = defaults.findIndex(c => c.id === coach.id);
      if (idx >= 0) {
        defaults[idx] = { ...defaults[idx], ...coach };
      }
      localStorage.setItem('coaches_list', JSON.stringify(defaults));
      try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: defaults })); } catch(e) {}
    }
  },

  async getPlatformStats() {
    let totalWorkoutsLoggedThisWeek = 0;
    let totalActiveClients = 0;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: clients } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'client');
        if (clients) totalActiveClients = clients.length;

        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startStr = startOfWeek.toISOString().split('T')[0];

        const { data: workoutLogs } = await supabase
          .from('workout_logs')
          .select('log_date, user_id')
          .gte('log_date', startStr);
        
        if (workoutLogs) {
          const uniqueSessions = new Set(workoutLogs.map(l => `${l.user_id}_${l.log_date}`));
          totalWorkoutsLoggedThisWeek = uniqueSessions.size;
        }
        
        return { totalWorkoutsLoggedThisWeek, totalActiveClients };
      } catch (e) {
        console.error('Error calculating platform stats:', e);
      }
    }

    // Local storage fallback for platform stats
    let clientCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('client_') && key.endsWith('_userEmail')) {
        clientCount++;
      }
    }
    totalActiveClients = clientCount || 3;

    const globalSessionsRaw = localStorage.getItem('workoutSessions');
    if (globalSessionsRaw) {
      try {
        const sessions = JSON.parse(globalSessionsRaw);
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startStr = startOfWeek.toISOString().split('T')[0];
        
        totalWorkoutsLoggedThisWeek = sessions.filter(s => s.date >= startStr).length;
      } catch(e) {}
    } else {
      totalWorkoutsLoggedThisWeek = 14;
    }

    return { totalWorkoutsLoggedThisWeek, totalActiveClients };
  },

  // ─── COACH REGISTRATION & INVITES ───
  // Creates a real credentialed coach account (email + password) and an
  // immediately-approved coaches row — no admin approval / pending step.
  // Mirrors the client email-signup pattern: if Supabase requires email
  // confirmation, signUp returns no session; the caller shows the "confirm
  // your email" message and the coach logs in once confirmed. Returns
  // { session, userId } so the caller can branch on confirmation state.
  async registerCoach({ email, name, password, experience, brand }) {
    if (isSupabaseConfigured && supabase) {
      const signUpResult = await this.signUp(email, password);
      const userId = signUpResult?.user?.id;
      if (!userId) {
        throw new Error('Could not create your coach account. Please try again.');
      }

      // Ensure the public.users row exists (id mirrors auth.users.id) with coach role.
      const { error: userErr } = await supabase
        .from('users')
        .upsert({ id: userId, email, full_name: name, role: 'coach' }, { onConflict: 'id' });
      if (userErr) console.warn('Cloud DB: could not sync coach users row:', userErr);

      // Create the approved coaches row carrying experience + brand.
      const expYears = parseInt(experience, 10);
      const { error: coachErr } = await supabase
        .from('coaches')
        .upsert({
          user_id: userId,
          status: 'approved',
          brand_name: brand || `${name} Fitness`,
          experience_years: Number.isFinite(expYears) ? expYears : null,
          is_blocked: false
        }, { onConflict: 'user_id' });
      if (coachErr) throw new Error(coachErr.message || 'Could not save your coach profile.');

      return { session: signUpResult?.session || null, userId };
    }

    // Mock fallback
    const mockUsers = this.getMockTable('users');
    let mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!mUser) {
      mUser = { id: `mock-uid-${Date.now()}`, email, auth_provider: 'email', password_hash: password };
      mockUsers.push(mUser);
    } else {
      mUser.password_hash = password;
    }
    this.saveMockTable('users', mockUsers);

    const mockCoaches = this.getMockTable('coaches');
    if (!mockCoaches.find(c => c.user_id === mUser.id)) {
      const expYears = parseInt(experience, 10);
      mockCoaches.push({
        id: `coach-${Date.now()}`,
        user_id: mUser.id,
        status: 'approved',
        brand_name: brand || `${name} Fitness`,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        is_blocked: false
      });
      this.saveMockTable('coaches', mockCoaches);
    }
    return { session: { mock: true }, userId: mUser.id };
  },

  // Super-admin: block or unblock a coach by their user_id. Enforced at login.
  async setCoachBlocked(coachUserId, blocked) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('coaches')
        .update({ is_blocked: blocked })
        .eq('user_id', coachUserId);
      if (error) throw new Error(error.message || 'Could not update coach block status.');
      return true;
    }
    const mockCoaches = this.getMockTable('coaches');
    const c = mockCoaches.find(mc => mc.user_id === coachUserId);
    if (c) { c.is_blocked = blocked; this.saveMockTable('coaches', mockCoaches); }
    return true;
  },

  async getPendingCoachApplications() {
    let cloudPending = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('coach_applications')
          .select('*, users(email)')
          .eq('status', 'pending');
        if (!error && data) {
          cloudPending = data.map(app => ({
            id: app.user_id, // keep mapped to user_id for approval handler compatibility
            application_id: app.id,
            email: app.users?.email || '',
            full_name: app.full_name,
            phone_number: app.phone_number,
            experience_notes: app.experience_notes,
            status: app.status
          }));
        }
      } catch (e) {
        console.error('Cloud DB fetch pending coaches error:', e);
      }
    }

    const mockApps = this.getMockTable('coach_applications').filter(a => a.status === 'pending');
    const mockUsers = this.getMockTable('users');

    const mappedMock = mockApps.map(app => {
      const u = mockUsers.find(user => user.id === app.user_id);
      return {
        id: app.user_id,
        application_id: app.id,
        email: u?.email || '',
        full_name: app.full_name,
        phone_number: app.phone_number,
        experience_notes: app.experience_notes,
        status: app.status
      };
    });

    const merged = [...cloudPending];
    mappedMock.forEach(m => {
      if (!merged.find(item => item.email.toLowerCase() === m.email.toLowerCase())) {
        merged.push(m);
      }
    });

    return merged;
  },

  async approveCoach(email) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: user, error: findError } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        
        if (findError) throw findError;
        
        if (user) {
          await supabase
            .from('users')
            .update({ role: 'coach' })
            .eq('id', user.id);

          // Update coach applications
          await supabase
            .from('coach_applications')
            .update({ status: 'approved', reviewed_at: new Date().toISOString() })
            .eq('user_id', user.id);

          // Create row in coaches table
          const { data: existingCoach } = await supabase
            .from('coaches')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!existingCoach) {
            await supabase
              .from('coaches')
              .insert({
                user_id: user.id,
                status: 'approved',
                brand_name: 'Fit Engineers Coach'
              });
          } else {
            await supabase
              .from('coaches')
              .update({ status: 'approved' })
              .eq('user_id', user.id);
          }
        }
      } catch (e) {
        console.error('Cloud DB Approve Coach Error:', e);
      }
    }

    // Mock Update
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (mUser) {
      mUser.role = 'coach';
      this.saveMockTable('users', mockUsers);

      const mockApps = this.getMockTable('coach_applications');
      const updatedApps = mockApps.map(a => a.user_id === mUser.id ? { ...a, status: 'approved', reviewed_at: new Date().toISOString() } : a);
      this.saveMockTable('coach_applications', updatedApps);

      const mockCoaches = this.getMockTable('coaches');
      const existing = mockCoaches.find(c => c.user_id === mUser.id);
      if (!existing) {
        mockCoaches.push({
          id: `coach-id-${Date.now()}`,
          user_id: mUser.id,
          status: 'approved',
          brand_name: 'Fit Engineers Coach'
        });
      } else {
        existing.status = 'approved';
      }
      this.saveMockTable('coaches', mockCoaches);
    }
  },

  async rejectCoach(email) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        
        if (user) {
          // Update coach applications
          await supabase
            .from('coach_applications')
            .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
            .eq('user_id', user.id);

          // Update coaches status if exists
          await supabase
            .from('coaches')
            .update({ status: 'rejected' })
            .eq('user_id', user.id);
        }
      } catch (e) {
        console.error('Cloud DB Reject Coach Error:', e);
      }
    }

    // Mock Update
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (mUser) {
      const mockApps = this.getMockTable('coach_applications');
      const updatedApps = mockApps.map(a => a.user_id === mUser.id ? { ...a, status: 'rejected', reviewed_at: new Date().toISOString() } : a);
      this.saveMockTable('coach_applications', updatedApps);

      const mockCoaches = this.getMockTable('coaches');
      const updatedCoaches = mockCoaches.map(c => c.user_id === mUser.id ? { ...c, status: 'rejected' } : c);
      this.saveMockTable('coaches', updatedCoaches);
    }
  },

  async resolveCoachUserId(coachId) {
    const rawCoachId = String(coachId || '').trim();
    if (!rawCoachId) {
      throw new Error('Coach account could not be identified.');
    }

    if (UUID_RE.test(rawCoachId)) {
      return rawCoachId;
    }

    if (isSupabaseConfigured && supabase) {
      const email = rawCoachId.toLowerCase();
      const { data: user, error } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Could not look up coach profile.');
      }
      if (user?.id) {
        return user.id;
      }

      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (authUser?.id && (!authUser.email || authUser.email.toLowerCase() === email)) {
        return authUser.id;
      }

      throw new Error('Coach profile is not synced yet. Please sign in again before generating an invitation code.');
    }

    const mockUsers = this.getMockTable('users');
    const user = mockUsers.find(u => u.email?.toLowerCase() === rawCoachId.toLowerCase() || u.id === rawCoachId);
    return user?.id || rawCoachId;
  },

  async isActiveCoachUser(coachUserId) {
    if (!coachUserId) return false;

    if (isSupabaseConfigured && supabase) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, role')
        .eq('id', coachUserId)
        .maybeSingle();
      if (userError) throw userError;

      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('status')
        .eq('user_id', coachUserId)
        .maybeSingle();
      if (coachError) throw coachError;

      return !!user && (
        ['coach', 'super-admin', 'admin'].includes(user.role) ||
        coach?.status === 'approved' ||
        isSuperAdmin(user.email)
      );
    }

    const mockUsers = this.getMockTable('users');
    const mockCoaches = this.getMockTable('coaches');
    const user = mockUsers.find(u => u.id === coachUserId);
    const coach = mockCoaches.find(c => c.user_id === coachUserId || c.id === coachUserId);
    return !!user && (
      ['coach', 'super-admin', 'admin'].includes(user.role) ||
      coach?.status === 'approved' ||
      isSuperAdmin(user.email)
    );
  },

  async updateInvitationUsage(upperCode, used, clientId = null) {
    const usage = used
      ? { used: true, used_at: new Date().toISOString(), used_by: clientId }
      : { used: false, used_at: null, used_by: null };

    let updateQuery = supabase
      .from('invitations')
      .update(usage)
      .eq('code', upperCode);

    if (used) {
      updateQuery = updateQuery.eq('used', false);
    }

    const { data, error } = await updateQuery.select('id').maybeSingle();

    if (!error) return data;

    let fallbackQuery = supabase
      .from('invitations')
      .update({ used })
      .eq('code', upperCode);

    if (used) {
      fallbackQuery = fallbackQuery.eq('used', false);
    }

    const { data: fallbackData, error: fallbackError } = await fallbackQuery.select('id').maybeSingle();

    if (fallbackError) throw fallbackError;
    return fallbackData;
  },

  async getActiveCoachInviteCode(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const now = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('invitations')
          .select('*')
          .eq('coach_id', resolvedCoachId)
          .eq('used', false)
          .gt('expires_at', now)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data;
      } catch (err) {
        console.error('[ERROR] Failed to fetch active invite code from Supabase:', err);
        return null;
      }
    }

    // Local Storage fallback
    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    const activeCode = Object.keys(invites).find(code => {
      const invitation = invites[code];
      return invitation.coachId === resolvedCoachId && !invitation.used && invitation.expiresAt > now;
    });

    if (activeCode) {
      return { code: activeCode, ...invites[activeCode] };
    }
    return null;
  },

  async deactivateActiveCoachInviteCodes(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const now = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('invitations')
          .update({ expires_at: now })
          .eq('coach_id', resolvedCoachId)
          .eq('used', false)
          .gt('expires_at', now);

        if (error) throw error;
      } catch (err) {
        console.error('[ERROR] Failed to deactivate old invite codes in Supabase:', err);
      }
    } else {
      // Local Storage fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      let updated = false;
      for (const code in invites) {
        const invitation = invites[code];
        if (invitation.coachId === resolvedCoachId && !invitation.used && invitation.expiresAt > now) {
          invitation.expiresAt = now;
          updated = true;
        }
      }
      if (updated) {
        localStorage.setItem('coach_invites', JSON.stringify(invites));
      }
    }
  },

  async generateCoachInviteCode(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS).toISOString();

    if (isSupabaseConfigured && supabase) {
      if (!UUID_RE.test(resolvedCoachId)) {
        throw new Error('Coach profile is not linked to a valid database user.');
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createInviteCode();
        const { error } = await supabase
          .from('invitations')
          .insert({
            code,
            coach_id: resolvedCoachId,
            expires_at: expiresAt,
            used: false
          });

        if (!error) {
          console.log('[DEBUG] Cloud DB: Stored invitation code successfully.', {
            code,
            coach_id: resolvedCoachId,
            expires_at: expiresAt,
            generated_at: new Date().toISOString()
          });
          return code;
        }

        if (error.code === '23505') {
          continue;
        }

        console.error('[ERROR] Failed to write coach invite code to Supabase:', error);
        throw new Error(error.message || 'Could not store invitation code. Please try again.');
      }

      throw new Error('Could not generate a unique invitation code. Please try again.');
    }

    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    let code = createInviteCode();
    while (invites[code]) {
      code = createInviteCode();
    }

    invites[code] = {
      coachId: resolvedCoachId,
      expiresAt,
      used: false
    };
    localStorage.setItem('coach_invites', JSON.stringify(invites));
    console.log('[DEBUG] Local Storage: Stored invitation code successfully.', {
      code,
      coach_id: resolvedCoachId,
      expires_at: expiresAt,
      generated_at: new Date().toISOString()
    });

    return code;
  },

  async validateCoachInviteCode(code) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode) return null;

    // Debug Requirement: Log exact query path, searched document ID
    console.log('[DEBUG] Query Path: public.invitations');
    console.log('[DEBUG] Query Document ID:', upperCode);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: invite, error } = await supabase
          .from('invitations')
          .select('*')
          .eq('code', upperCode)
          .eq('used', false)
          .maybeSingle();

        if (error || !invite) {
          console.log('[DEBUG] Query Result: null');
          return null;
        }

        console.log('[DEBUG] Query Result:', JSON.stringify(invite));

        // Timezone comparison logs
        console.log('[DEBUG] Invitation code expiration time (UTC):', invite.expires_at);
        console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

        if (isPastTimestamp(invite.expires_at)) {
          console.log('[DEBUG] Code expired. Expiration:', invite.expires_at, 'Now:', new Date().toISOString());
          return null;
        }

        return invite.coach_id;
      } catch (err) {
        console.error('[ERROR] Error validating invite code in Supabase:', err);
        return null;
      }
    } else {
      // Local Storage Fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invitation = invites[upperCode];

      if (!invitation || invitation.used) {
        console.log('[DEBUG] Query Result: null');
        return null;
      }

      console.log('[DEBUG] Query Result:', JSON.stringify(invitation));

      console.log('[DEBUG] Invitation code expiration time (UTC):', invitation.expiresAt);
      console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

      if (isPastTimestamp(invitation.expiresAt)) {
        console.log('[DEBUG] Code expired. Expiration:', invitation.expiresAt, 'Now:', new Date().toISOString());
        return null;
      }

      return invitation.coachId;
    }
  },

  async consumeCoachInviteCode(code, clientId = null) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode) return;

    if (isSupabaseConfigured && supabase) {
      try {
        await this.updateInvitationUsage(upperCode, true, clientId);
        console.log('[DEBUG] Cloud DB: Successfully consumed invitation code:', upperCode);
      } catch (err) {
        console.error('[ERROR] Failed to mark invite code as used in Supabase:', err);
        throw err;
      }
    } else {
      // Local Storage Fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      if (invites[upperCode]) {
        invites[upperCode].used = true;
        invites[upperCode].usedAt = new Date().toISOString();
        invites[upperCode].usedBy = clientId;
        localStorage.setItem('coach_invites', JSON.stringify(invites));
        console.log('[DEBUG] Local Storage: Successfully consumed invitation code:', upperCode);
      }
    }
  },

  async linkCoachAndEnterDirect(upperCode, clientId) {
    const { data: invite, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('code', upperCode)
      .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invite) throw new Error('Invalid invitation code.');
    if (invite.used) throw new Error('Invitation code has already been used.');

    console.log('[DEBUG] Direct invite validation result:', JSON.stringify(invite));
    console.log('[DEBUG] Invitation code expiration time (UTC):', invite.expires_at);
    console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

    if (isPastTimestamp(invite.expires_at)) {
      throw new Error('Invitation code has expired.');
    }

    const coachIsActive = await this.isActiveCoachUser(invite.coach_id);
    if (!coachIsActive) {
      throw new Error('Invitation belongs to an inactive or invalid coach.');
    }

    const fullName = localStorage.getItem('userName') || 'Warrior';
    const { error: clientError } = await supabase
      .from('clients')
      .upsert({
        user_id: clientId,
        coach_id: invite.coach_id,
        full_name: fullName
      }, { onConflict: 'user_id' });
    if (clientError) throw clientError;

    const { error: userError } = await supabase
      .from('users')
      .update({
        role: 'client',
        coach_id: invite.coach_id,
        full_name: fullName,
        verified: true
      })
      .eq('id', clientId);

    if (userError) {
      const { error: fallbackUserError } = await supabase
        .from('users')
        .update({
          role: 'client',
          coach_id: invite.coach_id,
          full_name: fullName
        })
        .eq('id', clientId);
      if (fallbackUserError) throw fallbackUserError;
    }

    const consumedInvite = await this.updateInvitationUsage(upperCode, true, clientId);
    if (!consumedInvite) {
      throw new Error('Invitation code has already been used.');
    }

    const { data: verifyClient } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', clientId)
      .maybeSingle();
    const { data: verifyUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (verifyClient?.coach_id !== invite.coach_id || verifyUser?.coach_id !== invite.coach_id) {
      await this.updateInvitationUsage(upperCode, false);
      throw new Error('Database transaction verification failed. Link reverted to prevent user lockout.');
    }

    return {
      success: true,
      coach_id: invite.coach_id,
      client_id: clientId,
      code_used: upperCode
    };
  },

  async linkCoachAndEnterTransaction(code, clientId) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode || !clientId) throw new Error('Code and Client ID are required.');

    if (isSupabaseConfigured && supabase) {
      try {
        console.log('[DEBUG] Executing atomic transaction RPC: link_coach_and_enter_transaction');
        const { data, error } = await supabase
          .rpc('link_coach_and_enter_transaction', {
            p_invite_code: upperCode,
            p_client_id: clientId
          });

        if (error) {
          console.error('[ERROR] RPC failed:', error.message || error);
          throw new Error(error.message || 'Database transaction failed.');
        }
        
        if (data && !data.success) {
          console.error('[ERROR] RPC transaction failed:', data.error);
          throw new Error(data.error || 'Database transaction failed.');
        }

        console.log('[DEBUG] Transaction RPC successful:', JSON.stringify(data));

        // ─── POST-TRANSACTION VERIFICATION (SELF-HEALING CHECK) ───
        console.log('[DEBUG] Starting post-transaction verification...');
        
        // 1. Verify invitation
        const { data: verifyInvite } = await supabase
          .from('invitations')
          .select('*')
          .eq('code', upperCode)
          .maybeSingle();

        // 2. Verify client profile
        const { data: verifyClient } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', clientId)
          .maybeSingle();

        // 3. Verify user record
        const { data: verifyUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', clientId)
          .maybeSingle();

        const hasUsedByColumn = verifyInvite && Object.prototype.hasOwnProperty.call(verifyInvite, 'used_by');
        const hasInvite = verifyInvite && verifyInvite.used === true && (!hasUsedByColumn || verifyInvite.used_by === clientId);
        const hasClient = verifyClient && verifyClient.coach_id === verifyInvite?.coach_id;
        const hasUser = verifyUser && verifyUser.role === 'client' && verifyUser.coach_id === verifyInvite?.coach_id && verifyUser.payment_status === 'active';

        if (!hasInvite || !hasClient || !hasUser) {
          console.error('[CRITICAL ERROR] Post-transaction consistency verification FAILED!', {
            hasInvite,
            hasClient,
            hasUser,
            verifyInvite,
            verifyClient,
            verifyUser
          });

          console.log('[DEBUG] Restoring invitation status to unused...');
          await this.updateInvitationUsage(upperCode, false);

          throw new Error('Database transaction verification failed. Link reverted to prevent user lockout.');
        }

        console.log('[DEBUG] Post-transaction verification: ALL CHECKS PASSED.');
        return data;

      } catch (err) {
        console.error('[ERROR] linkCoachAndEnterTransaction failed:', err.message || err);
        throw err;
      }
    } else {
      // Local Storage Fallback Transaction (Simulated Atomicity)
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invitation = invites[upperCode];

      if (!invitation) {
        throw new Error('Invalid invitation code.');
      }
      if (invitation.used) {
        throw new Error('Invitation code has already been used.');
      }
      if (isPastTimestamp(invitation.expiresAt)) {
        throw new Error('Invitation code has expired.');
      }

      // Check active coach
      const coachIsActive = await this.isActiveCoachUser(invitation.coachId);
      if (!coachIsActive) {
        throw new Error('Invitation belongs to an inactive or invalid coach.');
      }

      // Create/update client profile before consuming the invitation.
      const mockUsers = this.getMockTable('users');
      const mockClients = this.getMockTable('clients');
      const clientIdx = mockClients.findIndex(c => c.user_id === clientId);
      const now = new Date().toISOString();
      const newClientObj = {
        user_id: clientId,
        coach_id: invitation.coachId,
        full_name: localStorage.getItem('userName') || 'Warrior',
        linked_at: now
      };

      if (clientIdx >= 0) {
        mockClients[clientIdx] = { ...mockClients[clientIdx], ...newClientObj };
      } else {
        mockClients.push(newClientObj);
      }
      this.saveMockTable('clients', mockClients);

      const userIdx = mockUsers.findIndex(u => u.id === clientId);
      if (userIdx >= 0) {
        mockUsers[userIdx].role = 'client';
        mockUsers[userIdx].coach_id = invitation.coachId;
        this.saveMockTable('users', mockUsers);
      }

      invitation.used = true;
      invitation.usedAt = now;
      invitation.usedBy = clientId;
      localStorage.setItem('coach_invites', JSON.stringify(invites));

      // Simulated Post-Transaction Verification
      const mockVerifyInvite = JSON.parse(localStorage.getItem('coach_invites') || '{}')[upperCode];
      const mockVerifyClient = this.getMockTable('clients').find(c => c.user_id === clientId);
      const mockVerifyUser = this.getMockTable('users').find(u => u.id === clientId);

      const passInvite = mockVerifyInvite && mockVerifyInvite.used === true && mockVerifyInvite.usedBy === clientId;
      const passClient = mockVerifyClient && mockVerifyClient.coach_id === invitation.coachId;
      const passUser = mockVerifyUser && mockVerifyUser.role === 'client' && mockVerifyUser.coach_id === invitation.coachId;

      if (!passInvite || !passClient || !passUser) {
        // Rollback
        invitation.used = false;
        invitation.usedAt = null;
        invitation.usedBy = null;
        localStorage.setItem('coach_invites', JSON.stringify(invites));
        throw new Error('Local mock verification failed. Changes rolled back.');
      }

      return {
        success: true,
        coach_id: invitation.coachId,
        client_id: clientId,
        code_used: upperCode
      };
    }
  },

  // ─── CONNECT CLIENT TO COACH FROM DASHBOARD ───
  // This is the ONLY method the new dashboard modal should call.
  // userId is ALWAYS taken from localStorage (the authenticated session) —
  // never from a user-supplied form field. This directly prevents the
  // "Code and Client ID are required" bug.
  async connectClientToCoach(rawCode) {
    const code = normalizeInviteCode(rawCode);
    if (!code) return { success: false, error: 'Please enter a valid invitation code.' };

    // Resolve client's own userId from the authenticated session
    let clientId = localStorage.getItem('userId');

    // If localStorage doesn't have it yet, try resolving from Supabase auth session
    if (!clientId && isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        clientId = session?.user?.id || null;
        if (clientId) localStorage.setItem('userId', clientId);
      } catch (e) {
        console.error('[connectClientToCoach] Could not resolve userId from session:', e);
      }
    }

    if (!clientId) {
      return { success: false, error: 'Your session could not be verified. Please log out and log back in.' };
    }

    // Step 1: Validate the code before committing anything
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: invite, error: lookupErr } = await supabase
          .from('invitations')
          .select('*')
          .filter('code', 'eq', code)
          .maybeSingle();

        if (lookupErr) throw lookupErr;
        if (!invite) return { success: false, error: 'Code not found.' };
        if (invite.used === true) return { success: false, error: 'This code has already been used.' };
        if (isPastTimestamp(invite.expires_at)) return { success: false, error: 'This code has expired.' };
      } catch (e) {
        console.error('[connectClientToCoach] Validation error:', e);
        return { success: false, error: e.message || 'Could not validate code. Please try again.' };
      }
    } else {
      // Mock DB validation
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invite = invites[code];
      if (!invite) return { success: false, error: 'Code not found.' };
      if (invite.used) return { success: false, error: 'This code has already been used.' };
      if (isPastTimestamp(invite.expiresAt)) return { success: false, error: 'This code has expired.' };
    }

    // Step 2: Execute the atomic link transaction
    try {
      const result = await this.linkCoachAndEnterTransaction(code, clientId);
      if (result && result.success) {
        // Update localStorage so the dashboard reflects the new connection immediately
        localStorage.setItem('userCoachId', result.coach_id || '');
        localStorage.setItem('clientLinkedToCoach', 'true');
        return { success: true, coachId: result.coach_id };
      }
      return { success: false, error: 'Connection failed. Please try again.' };
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('expired')) return { success: false, error: 'This code has expired.' };
      if (msg.includes('already been used')) return { success: false, error: 'This code has already been used.' };
      if (msg.includes('not found') || msg.includes('Invalid')) return { success: false, error: 'Code not found.' };
      return { success: false, error: msg || 'Connection failed. Please try again.' };
    }
  },

  async getAllUsersWithRoles() {
    let users = [];
    if (isSupabaseConfigured && supabase) {
      try {
        // Query users
        const { data: dbUsers, error: uErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (dbUsers) {
          // Query coaches
          const { data: dbCoaches } = await supabase.from('coaches').select('*');
          // Query clients
          const { data: dbClients } = await supabase.from('clients').select('*');
          // Query applications
          const { data: dbApps } = await supabase.from('coach_applications').select('*');

          users = dbUsers.map(u => {
            const isSuperAdminEmail = u.email.toLowerCase() === 'subodhmankala@gmail.com';
            const coach = dbCoaches?.find(c => c.user_id === u.id);
            const client = dbClients?.find(c => c.user_id === u.id);
            const app = dbApps?.find(a => a.user_id === u.id);

            let role = 'client';
            if (isSuperAdminEmail) {
              role = 'super-admin';
            } else if (coach) {
              role = coach.status === 'approved' ? 'coach' : 'coach_pending';
            } else if (app && app.status === 'pending') {
              role = 'coach_pending';
            } else if (client) {
              role = 'client';
            }

            return {
              id: u.id,
              email: u.email,
              full_name: client?.full_name || coach?.brand_name || u.email.split('@')[0],
              role,
              verified: role === 'coach' || role === 'super-admin',
              created_at: u.created_at
            };
          });
        }
      } catch (e) {
        console.error('Cloud DB getAllUsersWithRoles error:', e);
      }
    }

    // Combine/fallback with Mock Table
    const mockUsers = this.getMockTable('users');
    const mockCoaches = this.getMockTable('coaches');
    const mockClients = this.getMockTable('clients');
    const mockApps = this.getMockTable('coach_applications');

    mockUsers.forEach(u => {
      if (!users.find(item => item.email.toLowerCase() === u.email.toLowerCase())) {
        const isSuperAdminEmail = u.email.toLowerCase() === 'subodhmankala@gmail.com';
        const coach = mockCoaches.find(c => c.user_id === u.id);
        const client = mockClients.find(c => c.user_id === u.id);
        const app = mockApps.find(a => a.user_id === u.id);

        let role = 'client';
        if (isSuperAdminEmail) {
          role = 'super-admin';
        } else if (coach) {
          role = coach.status === 'approved' ? 'coach' : 'coach_pending';
        } else if (app && app.status === 'pending') {
          role = 'coach_pending';
        } else if (client) {
          role = 'client';
        }

        users.push({
          id: u.id,
          email: u.email,
          full_name: client?.full_name || coach?.brand_name || u.email.split('@')[0],
          role,
          verified: role === 'coach' || role === 'super-admin',
          created_at: u.created_at || new Date().toISOString()
        });
      }
    });

    return users;
  },

  async requestMockPasswordReset(email) {
    const mockUsers = this.getMockTable('users');
    const u = mockUsers.find(user => user.email.toLowerCase() === email.toLowerCase().trim());
    if (u) {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const mockTokens = this.getMockTable('password_reset_tokens');
      mockTokens.push({
        id: `token-id-${Date.now()}`,
        user_id: u.id,
        token: token,
        expires_at: expiresAt,
        used: false
      });
      this.saveMockTable('password_reset_tokens', mockTokens);
      return token;
    }
    return null;
  },

  async validateMockToken(token) {
    const mockTokens = this.getMockTable('password_reset_tokens');
    const t = mockTokens.find(tok => tok.token === token);
    if (!t) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    if (t.used) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    if (new Date(t.expires_at) < new Date()) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    return { isValid: true, tokenObj: t };
  },

  async resetMockPasswordWithToken(token, newPassword) {
    const validation = await this.validateMockToken(token);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    const t = validation.tokenObj;
    const mockUsers = this.getMockTable('users');
    const uIdx = mockUsers.findIndex(user => user.id === t.user_id);
    if (uIdx >= 0) {
      mockUsers[uIdx].password_hash = newPassword;
      this.saveMockTable('users', mockUsers);
    }
    const mockTokens = this.getMockTable('password_reset_tokens');
    const tIdx = mockTokens.findIndex(tok => tok.id === t.id);
    if (tIdx >= 0) {
      mockTokens[tIdx].used = true;
      this.saveMockTable('password_reset_tokens', mockTokens);
    }
    return true;
  },

  async refreshLocalCoaches() {
    const coaches = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('coaches')
          .select('*, users(email, full_name)')
          .eq('status', 'approved');
        
        if (!error && data) {
          data.forEach(c => {
            coaches.push({
              id: c.id,
              name: c.users?.full_name || c.brand_name || 'Coach',
              email: c.users?.email || '',
              brand: c.brand_name || 'Fit Engineers',
              payment_status: 'active',
              signup_date: c.created_at,
              clientsCount: 0,
              status: c.status
            });
          });
        }
      } catch (e) {
        console.error('Cloud DB refresh coaches error:', e);
      }
    }

    // Mock coaches
    const mockCoaches = this.getMockTable('coaches').filter(c => c.status === 'approved');
    const mockUsers = this.getMockTable('users');
    
    mockCoaches.forEach(c => {
      if (!coaches.find(item => item.id === c.id)) {
        const u = mockUsers.find(user => user.id === c.user_id);
        coaches.push({
          id: c.id,
          name: u?.full_name || c.brand_name || 'Coach',
          email: u?.email || '',
          brand: c.brand_name || 'Fit Engineers',
          payment_status: 'active',
          signup_date: c.created_at || new Date().toISOString(),
          clientsCount: 0,
          status: c.status
        });
      }
    });

    localStorage.setItem('coaches_list', JSON.stringify(coaches));
    try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: coaches })); } catch(e) {}
    return coaches;
  }
};

export default databaseService;
