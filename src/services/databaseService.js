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
  return email && TRAINER_EMAILS.includes(email.toLowerCase());
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
            fats_target: parseInt(profile.userFatsTarget)
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
            userFatsTarget: String(data.fats_target)
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
          const records = [];
          session.exercises.forEach(ex => {
            ex.sets.forEach((set, sIdx) => {
              records.push({
                user_id: user.id,
                log_date: session.date,
                exercise_name: ex.name,
                set_number: sIdx + 1,
                reps: parseInt(set.reps || '0'),
                weight_kg: parseFloat(set.weight || '0.0')
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

    // Always merge in local storage
    const stored = localStorage.getItem('workoutSessions');
    let sessions = [];
    if (stored) {
      try { sessions = JSON.parse(stored); } catch(e) {}
    }
    localStorage.setItem('workoutSessions', JSON.stringify(sessions));
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
            userFatsTarget: String(data.fats_target)
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
    if (profile.userAge) localStorage.setItem('userAge', profile.userAge);
    if (profile.userHeight) localStorage.setItem('userHeight', profile.userHeight);
    if (profile.userWeight) localStorage.setItem('userWeight', profile.userWeight);
    if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
    if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
    if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
    if (profile.userCalorieTarget) localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    if (profile.userProteinTarget) localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    if (profile.userFatsTarget) localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    localStorage.setItem('onboardingComplete', 'true');
  },

  async getAllUsers() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('full_name', { ascending: true });
        
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
            userFatsTarget: String(u.fats_target || '')
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
        userFatsTarget: localStorage.getItem('userFatsTarget') || ''
      });
      clientNamesSeen.add(uKey);
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
          clientNamesSeen.add(clientKey);
          const keyPrefix = `client_${clientKey}_`;
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
            userFatsTarget: localStorage.getItem(`${keyPrefix}userFatsTarget`) || ''
          });
        }
      }
    }

    return localClients;
  },

  async getWorkoutLogsForUser(userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('user_id', userId)
          .order('log_date', { ascending: false })
          .order('exercise_name', { ascending: true })
          .order('set_number', { ascending: true });
        
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error('Cloud DB Fetch workout logs error:', e);
      }
    }

    // Offline local storage fallback
    const keyPrefix = `client_${userId}_`;
    const stored = localStorage.getItem(`${keyPrefix}workoutSessions`) || localStorage.getItem('workoutSessions');
    if (stored) {
      try {
        const sessions = JSON.parse(stored);
        const flatLogs = [];
        sessions.forEach(sess => {
          if (sess.exercises) {
            sess.exercises.forEach(ex => {
              if (ex.sets) {
                ex.sets.forEach((set, sIdx) => {
                  flatLogs.push({
                    log_date: sess.date,
                    exercise_name: ex.name,
                    set_number: sIdx + 1,
                    reps: parseInt(set.reps || '0'),
                    weight_kg: parseFloat(set.weight || '0.0')
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
  }
};

export default databaseService;
