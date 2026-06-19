import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

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
  return cachedRole === 'coach' || cachedRole === 'super-admin';
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
  // ─── USER PROFILE ───
  async saveUserProfile(profile) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .upsert({
            email: profile.email || `${profile.userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`,
            full_name: profile.userName,
            age: parseInt(profile.userAge),
            height_cm: parseFloat(profile.userHeight),
            weight_kg: parseFloat(profile.userWeight),
            activity_level: profile.userActivity,
            fitness_goal: profile.userGoal,
            dietary_preference: profile.userDiet,
            calorie_target: parseInt(profile.userCalorieTarget),
            protein_target: parseInt(profile.userProteinTarget),
            fats_target: parseInt(profile.userFatsTarget),
            role: profile.role || 'client',
            phone: profile.phone || null,
            brand: profile.brand || null,
            payment_status: profile.payment_status || 'active',
            coach_id: profile.coach_id || null
          }, { onConflict: 'email' })
          .select();
        
        if (error) throw error;
        console.log('Cloud DB: Saved user profile:', data);
      } catch (e) {
        console.error('Cloud DB Sync Error: falling back to local.', e);
      }
    }
    
    // Always write to local storage as fallback/cache
    localStorage.setItem('userName', profile.userName);
    localStorage.setItem('userAge', profile.userAge);
    localStorage.setItem('userHeight', profile.userHeight);
    localStorage.setItem('userWeight', profile.userWeight);
    localStorage.setItem('userActivity', profile.userActivity);
    localStorage.setItem('userGoal', profile.userGoal);
    localStorage.setItem('userDiet', profile.userDiet);
    localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    localStorage.setItem('userCarbsTarget', profile.userCarbsTarget);
    localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    if (profile.userIssue) localStorage.setItem('userIssue', profile.userIssue);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.payment_status) localStorage.setItem('userPaymentStatus', profile.payment_status);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);
  },

  async getUserProfile(userName) {
    if (isSupabaseConfigured && supabase) {
      try {
        const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is code for no row found
        if (data) {
          return {
            userName: data.full_name,
            userAge: String(data.age),
            userHeight: String(data.height_cm),
            userWeight: String(data.weight_kg),
            userActivity: data.activity_level,
            userGoal: data.fitness_goal,
            userDiet: data.dietary_preference,
            userCalorieTarget: String(data.calorie_target),
            userProteinTarget: String(data.protein_target),
            userFatsTarget: String(data.fats_target),
            role: data.role,
            phone: data.phone,
            brand: data.brand,
            payment_status: data.payment_status,
            coach_id: data.coach_id
          };
        }
      } catch (e) {
        console.error('Cloud DB Fetch Error: falling back to local.', e);
      }
    }
    
    return {
      userName: localStorage.getItem('userName') || '',
      userAge: localStorage.getItem('userAge') || '',
      userHeight: localStorage.getItem('userHeight') || '',
      userWeight: localStorage.getItem('userWeight') || '',
      userActivity: localStorage.getItem('userActivity') || '',
      userGoal: localStorage.getItem('userGoal') || '',
      userDiet: localStorage.getItem('userDiet') || '',
      userCalorieTarget: localStorage.getItem('userCalorieTarget') || '',
      userProteinTarget: localStorage.getItem('userProteinTarget') || '',
      userFatsTarget: localStorage.getItem('userFatsTarget') || ''
    };
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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
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
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          if (data.role) {
            localStorage.setItem('userRole', data.role);
          }
          return {
            id: data.id,
            userName: data.full_name,
            userAge: String(data.age),
            userHeight: String(data.height_cm),
            userWeight: String(data.weight_kg),
            userActivity: data.activity_level,
            userGoal: data.fitness_goal,
            userDiet: data.dietary_preference,
            userCalorieTarget: String(data.calorie_target),
            userProteinTarget: String(data.protein_target),
            userFatsTarget: String(data.fats_target),
            role: data.role,
            phone: data.phone,
            brand: data.brand,
            payment_status: data.payment_status,
            coach_id: data.coach_id
          };
        }
      } catch (e) {
        console.error('Cloud DB Fetch Error by email:', e);
      }
    }
    return null;
  },

  async loadProfileIntoLocalStorage(profile, email) {
    localStorage.setItem('userName', profile.userName || 'Trainer');
    localStorage.setItem('userEmail', email);
    if (profile.id) localStorage.setItem('userId', profile.id);
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
    const loggedInId = localStorage.getItem('userId');
    const superAdmin = isSuperAdmin(loggedInEmail);

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('users')
          .select('*')
          .order('full_name', { ascending: true });

        // Enforce isolation for regular coaches
        if (loggedInRole === 'coach' && !superAdmin && loggedInId) {
          query = query.eq('coach_id', loggedInId);
        }

        const { data, error } = await query;
        
        if (error) throw error;
        if (data) {
          return data.map(u => ({
            id: u.id,
            email: u.email,
            userName: u.full_name || 'Warrior',
            userAge: String(u.age || ''),
            userHeight: String(u.height_cm || ''),
            userWeight: String(u.weight_kg || ''),
            userActivity: u.activity_level || '',
            userGoal: u.fitness_goal || '',
            userDiet: u.dietary_preference || '',
            userCalorieTarget: String(u.calorie_target || ''),
            userProteinTarget: String(u.protein_target || ''),
            userFatsTarget: String(u.fats_target || ''),
            role: u.role,
            phone: u.phone,
            brand: u.brand,
            payment_status: u.payment_status,
            coach_id: u.coach_id
          }));
        }
      } catch (e) {
        console.error('Cloud DB Fetch all users error:', e);
      }
    }
    
    // Offline local storage fallback
    const localClients = [];
    const clientNamesSeen = new Set();
    
    // 1. Add current user if exists and not trainer
    const currentName = localStorage.getItem('userName');
    const currentEmail = localStorage.getItem('userEmail');
    if (currentName && currentEmail && !isTrainer(currentEmail)) {
      const uKey = currentName.toLowerCase().replace(/\s+/g, '');
      const clientCoachId = localStorage.getItem(`client_${uKey}_userCoachId`) || '';
      
      // Enforce isolation for regular coaches
      if (!(loggedInRole === 'coach' && !superAdmin && loggedInId && clientCoachId !== loggedInId)) {
        localClients.push({
          id: uKey,
          email: currentEmail,
          userName: currentName,
          userAge: localStorage.getItem('userAge') || '',
          userHeight: localStorage.getItem('userHeight') || '',
          userWeight: localStorage.getItem('userWeight') || '',
          userActivity: localStorage.getItem('userActivity') || '',
          userGoal: localStorage.getItem('userGoal') || '',
          userDiet: localStorage.getItem('userDiet') || '',
          userCalorieTarget: localStorage.getItem('userCalorieTarget') || '',
          userProteinTarget: localStorage.getItem('userProteinTarget') || '',
          userFatsTarget: localStorage.getItem('userFatsTarget') || '',
          role: 'client',
          coach_id: clientCoachId
        });
        clientNamesSeen.add(uKey);
      }
    }

    // 2. Scan all client partitions and chats in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        let clientKey = '';
        if (key.startsWith('client_')) {
          const parts = key.split('_');
          if (parts.length >= 2) {
            clientKey = parts[1];
          }
        } else if (key.startsWith('local_chat_')) {
          clientKey = key.replace('local_chat_', '');
        }

        if (clientKey && clientKey !== 'guest' && !clientNamesSeen.has(clientKey)) {
          const keyPrefix = `client_${clientKey}_`;
          const clientCoachId = localStorage.getItem(`${keyPrefix}userCoachId`) || '';

          // Enforce isolation for regular coaches
          if (loggedInRole === 'coach' && !superAdmin && loggedInId && clientCoachId !== loggedInId) {
            continue;
          }

          clientNamesSeen.add(clientKey);
          const email = localStorage.getItem(`${keyPrefix}userEmail`) || `${clientKey}@fitengineers.com`;
          const name = localStorage.getItem(`${keyPrefix}userName`) || (clientKey.charAt(0).toUpperCase() + clientKey.slice(1));
          
          localClients.push({
            id: clientKey,
            email: email,
            userName: name,
            userAge: localStorage.getItem(`${keyPrefix}userAge`) || '',
            userHeight: localStorage.getItem(`${keyPrefix}userHeight`) || '',
            userWeight: localStorage.getItem(`${keyPrefix}userWeight`) || '',
            userActivity: localStorage.getItem(`${keyPrefix}userActivity`) || '',
            userGoal: localStorage.getItem(`${keyPrefix}userGoal`) || '',
            userDiet: localStorage.getItem(`${keyPrefix}userDiet`) || '',
            userCalorieTarget: localStorage.getItem(`${keyPrefix}userCalorieTarget`) || '',
            userProteinTarget: localStorage.getItem(`${keyPrefix}userProteinTarget`) || '',
            userFatsTarget: localStorage.getItem(`${keyPrefix}userFatsTarget`) || '',
            role: 'client',
            coach_id: clientCoachId
          });
        }
      }
    }

    return localClients;
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
            payment_status: coach.payment_status
          })
          .eq('id', coach.id);
        if (error) throw error;
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
  }
};

export default databaseService;
