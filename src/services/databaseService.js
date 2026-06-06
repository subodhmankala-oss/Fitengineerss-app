import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
    const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

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
    const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

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
    const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

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
    localStorage.setItem('userName', profile.userName);
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userAge', profile.userAge);
    localStorage.setItem('userHeight', profile.userHeight);
    localStorage.setItem('userWeight', profile.userWeight);
    localStorage.setItem('userActivity', profile.userActivity);
    localStorage.setItem('userGoal', profile.userGoal);
    localStorage.setItem('userDiet', profile.userDiet);
    localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    localStorage.setItem('onboardingComplete', 'true');
  }
};

export default databaseService;
