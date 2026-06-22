import { createClient } from '@supabase/supabase-js';

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
        detectSessionInUrl: true
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
              email,
              auth_provider: profile.auth_provider || 'email'
            }, { onConflict: 'email' })
            .select()
            .single();
          if (userError) throw userError;
          user = newUser;
        }
        userId = user.id;

        // 2. Write client/coach record
        if (profile.role === 'coach' || profile.role === 'super-admin' || profile.role === 'admin') {
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
              coach_id: profile.coach_id || 'coach-id-default', // must be uuid of coach
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
        coach_id: profile.coach_id || localStorage.getItem('userCoachId') || 'coach-subodh',
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

          // Check if coach application exists
          const { data: app } = await supabase
            .from('coach_applications')
            .select('*')
            .eq('user_id', user.id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let activeRole = 'client';
          if (isSuperAdminEmail) {
            activeRole = 'super-admin';
          } else if (coach) {
            activeRole = coach.status === 'approved' ? 'coach' : 'coach_pending';
          } else if (app && app.status === 'pending') {
            activeRole = 'coach_pending';
          } else if (client) {
            activeRole = 'client';
          }

          localStorage.setItem('userRole', activeRole);
          if (coach) localStorage.setItem('userCoachId', coach.id);
          if (client) localStorage.setItem('userCoachId', client.coach_id); // Client stores their coach's ID
          if (client) localStorage.setItem('userClientId', client.id);

          return {
            id: user.id,
            userName: client?.full_name || coach?.brand_name || user.email.split('@')[0],
            userAge: client?.age ? String(client.age) : '',
            userHeight: client?.height_cm ? String(client.height_cm) : '',
            userWeight: client?.weight_kg ? String(client.weight_kg) : '',
            userActivity: client?.activity_level || '',
            userGoal: client?.fitness_goal || '',
            userDiet: client?.dietary_preference || '',
            userCalorieTarget: client?.calorie_target ? String(client.calorie_target) : '',
            userProteinTarget: client?.protein_target ? String(client.protein_target) : '',
            userCarbsTarget: client?.carbs_target ? String(client.carbs_target) : '',
            userFatsTarget: client?.fats_target ? String(client.fats_target) : '',
            role: activeRole,
            phone: client?.phone_number || app?.phone_number || '',
            brand: coach?.brand_name || 'Fit Engineers',
            payment_status: 'active',
            coach_id: client?.coach_id || null,
            userCoachId: coach?.id || null,
            userClientId: client?.id || null,
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
      const mockApps = this.getMockTable('coach_applications');

      const mCoach = mockCoaches.find(c => c.user_id === userId);
      const mClient = mockClients.find(c => c.user_id === userId);
      const mApp = mockApps.find(a => a.user_id === userId);

      let activeRole = 'client';
      if (isSuperAdminEmail) {
        activeRole = 'super-admin';
      } else if (mCoach) {
        activeRole = mCoach.status === 'approved' ? 'coach' : 'coach_pending';
      } else if (mApp && mApp.status === 'pending') {
        activeRole = 'coach_pending';
      } else if (mClient) {
        activeRole = 'client';
      }

      localStorage.setItem('userRole', activeRole);
      if (mCoach) localStorage.setItem('userCoachId', mCoach.id);
      if (mClient) localStorage.setItem('userCoachId', mClient.coach_id);
      if (mClient) localStorage.setItem('userClientId', mClient.id);

      return {
        id: userId,
        userName: mClient?.full_name || mCoach?.brand_name || email.split('@')[0],
        userAge: mClient?.age ? String(mClient.age) : '',
        userHeight: mClient?.height_cm ? String(mClient.height_cm) : '',
        userWeight: mClient?.weight_kg ? String(mClient.weight_kg) : '',
        userActivity: mClient?.activity_level || '',
        userGoal: mClient?.fitness_goal || '',
        userDiet: mClient?.dietary_preference || '',
        userCalorieTarget: mClient?.calorie_target ? String(mClient.calorie_target) : '',
        userProteinTarget: mClient?.protein_target ? String(mClient.protein_target) : '',
        userCarbsTarget: mClient?.carbs_target ? String(mClient.carbs_target) : '',
        userFatsTarget: mClient?.fats_target ? String(mClient.fats_target) : '',
        role: activeRole,
        phone: mClient?.phone_number || mApp?.phone_number || '',
        brand: mCoach?.brand_name || 'Fit Engineers',
        payment_status: 'active',
        coach_id: mClient?.coach_id || null,
        userCoachId: mCoach?.id || null,
        userClientId: mClient?.id || null,
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
    if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
    if (profile.userCalorieTarget) localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    if (profile.userProteinTarget) localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    if (profile.userFatsTarget) localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.payment_status) localStorage.setItem('userPaymentStatus', profile.payment_status);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);
    localStorage.setItem('onboardingComplete', 'true');
  },

  async getAllUsers() {
    const loggedInEmail = localStorage.getItem('userEmail');
    const loggedInRole = localStorage.getItem('userRole');
    const loggedInCoachId = localStorage.getItem('userCoachId');

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('clients').select('*, users(email)');
        
        const isCoachOrAdmin = loggedInRole === 'coach' || loggedInRole === 'super-admin' || loggedInRole === 'admin';
        if (isCoachOrAdmin && loggedInCoachId && loggedInRole !== 'super-admin') {
          query = query.eq('coach_id', loggedInCoachId);
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
    if (isCoachOrAdmin && loggedInCoachId && loggedInRole !== 'super-admin') {
      filtered = mockClients.filter(c => c.coach_id === loggedInCoachId);
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

  // ─── WORKOUT ROUTINE TEMPLATES / PLANS ───
  async getWorkoutPlansForUser(userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Resolve user UUID if needed
        let resolvedUserId = userId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (!isUuid) {
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

    // Offline local storage fallback
    const clientKey = await getCleanClientKey(userId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Error parsing local workout plans:", e);
      }
    }
    return [];
  },

  async saveWorkoutPlan(plan) {
    const targetUserId = plan.userId;

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
          created_by: plan.createdBy || 'coach'
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
  async getAllCoaches() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('role', 'coach')
          .order('full_name', { ascending: true });

        if (error) throw error;
        if (data) {
          // Get client counts for each coach
          const { data: clientCounts } = await supabase
            .from('users')
            .select('coach_id');

          return data.map(coach => {
            const clients = clientCounts ? clientCounts.filter(c => c.coach_id === coach.id) : [];
            return {
              id: coach.id,
              name: coach.full_name || 'Coach',
              email: coach.email,
              brand: coach.brand || 'Fit Engineers',
              payment_status: coach.payment_status || 'active',
              signup_date: coach.created_at || new Date().toISOString(),
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

    // Compute client counts from local storage clients
    coaches.forEach(coach => {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('client_') && key.endsWith('_userCoachId')) {
          if (localStorage.getItem(key) === coach.id) {
            count++;
          }
        }
      }
      coach.clientsCount = count;
    });

    return coaches;
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

  // ─── COACH APPLICATIONS & INVITES ───
  async submitCoachApplication(applicationData) {
    const { email, name, certifications, experience, specialization, socialMedia, location } = applicationData;
    let userId = null;

    if (isSupabaseConfigured && supabase) {
      try {
        // Check if user exists in users table
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Insert into users
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({
              email: email,
              auth_provider: 'email'
            })
            .select()
            .single();
          if (userError) throw userError;
          userId = newUser.id;
        }

        // Insert coach application
        const { error: appError } = await supabase
          .from('coach_applications')
          .insert({
            user_id: userId,
            full_name: name,
            phone_number: applicationData.phone || '',
            experience_notes: experience || '',
            status: 'pending'
          });
        if (appError) throw appError;
      } catch (err) {
        console.error('Cloud DB Coach Application Submit Error:', err);
        throw new Error(err.message || 'Database error occurred while submitting application.');
      }
    }

    // Mock Database Update
    const mockUsers = this.getMockTable('users');
    let mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!mUser) {
      mUser = { id: `mock-uid-${Date.now()}`, email, auth_provider: 'email' };
      mockUsers.push(mUser);
      this.saveMockTable('users', mockUsers);
    }
    userId = mUser.id;

    const mockApps = this.getMockTable('coach_applications');
    const newApp = {
      id: `app-id-${Date.now()}`,
      user_id: userId,
      full_name: name,
      phone_number: applicationData.phone || '',
      experience_notes: experience || '',
      status: 'pending',
      submitted_at: new Date().toISOString()
    };
    mockApps.push(newApp);
    this.saveMockTable('coach_applications', mockApps);

    localStorage.setItem('userEmail', email);
    localStorage.setItem('userName', name);
    localStorage.setItem('userRole', 'coach_pending');
    localStorage.setItem('userId', userId);
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

  async generateCoachInviteCode(coachId) {
    // Force uppercase normalization
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    
    // Store coachId and mock database expiration timestamp
    invites[code] = {
      coachId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24-hour expiration
    };

    // Await simulation write confirmation to prevent premature client validations
    await new Promise(resolve => setTimeout(resolve, 800));

    localStorage.setItem('coach_invites', JSON.stringify(invites));
    return code;
  },

  async validateCoachInviteCode(code) {
    if (!code) return null;
    const upperCode = code.toUpperCase();
    
    // Debug Requirement: Log exact query path, searched document ID, and result
    console.log('[DEBUG] Query Path: collections/invitations');
    console.log('[DEBUG] Query Document ID:', upperCode);
    
    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    const invitation = invites[upperCode];

    if (!invitation) {
      console.log('[DEBUG] Query Result: null');
      return null;
    }

    console.log('[DEBUG] Query Result:', JSON.stringify(invitation));

    // Expiration checks using ServerTimestamp equivalent (ISOString format)
    const now = new Date().toISOString();
    if (invitation.expiresAt && invitation.expiresAt < now) {
      console.log('[DEBUG] Code expired. Expiration:', invitation.expiresAt, 'Now:', now);
      return null;
    }

    return invitation.coachId;
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
