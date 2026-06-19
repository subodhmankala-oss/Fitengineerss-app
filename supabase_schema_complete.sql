-- ==========================================
-- FITENGINEERS COMPLETE DATABASE SCHEMA
-- Enhanced with RBAC, Access Control, and All Required Tables
-- Paste this into Supabase SQL Editor
-- ==========================================

-- ==========================================
-- 1. CORE USER MANAGEMENT
-- ==========================================

-- Users Table (Core authentication and roles)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id UUID,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT UNIQUE,
  role TEXT DEFAULT 'client' CHECK (role IN ('client', 'coach', 'coach_pending', 'super-admin')),
  verified BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- Enable RLS and create policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read their own data" ON users FOR SELECT
  USING (auth.uid() = id);

-- Super admin can read all users
CREATE POLICY "Super admin can read all users" ON users FOR SELECT
  USING (role = 'super-admin');

-- Users can update their own data
CREATE POLICY "Users can update their own data" ON users FOR UPDATE
  USING (auth.uid() = id);

-- Super admin can update any user
CREATE POLICY "Super admin can update any user" ON users FOR UPDATE
  USING (role = 'super-admin');


-- User Profiles (Extended information)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  activity_level TEXT,
  fitness_goal TEXT,
  dietary_preference TEXT,
  calorie_target INTEGER,
  protein_target INTEGER,
  fats_target INTEGER,
  carbs_target INTEGER,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE
  USING (user_id = auth.uid());


-- ==========================================
-- 2. COACH MANAGEMENT
-- ==========================================

-- Coach Profiles
CREATE TABLE IF NOT EXISTS coach_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certifications TEXT[],
  experience_years INTEGER,
  specialization TEXT,
  social_media_handle TEXT,
  location TEXT,
  bio TEXT,
  hourly_rate NUMERIC,
  availability JSONB,
  max_clients INTEGER DEFAULT 20,
  current_clients_count INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  approved BOOLEAN DEFAULT false,
  approval_date TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE coach_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can read own profile" ON coach_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can read all profiles" ON coach_profiles FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- Coach Applications
CREATE TABLE IF NOT EXISTS coach_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  certifications TEXT,
  experience_years INTEGER,
  specialization TEXT,
  social_media_handle TEXT,
  location TEXT,
  submission_date TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE coach_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants can read own application" ON coach_applications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can read all applications" ON coach_applications FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );

CREATE POLICY "Super admin can update applications" ON coach_applications FOR UPDATE
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- Coach-Client Relationships
CREATE TABLE IF NOT EXISTS coach_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  join_date TIMESTAMPTZ DEFAULT now(),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  subscription_tier TEXT DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_coach_client UNIQUE (coach_id, client_id)
);

ALTER TABLE coach_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own clients" ON coach_clients FOR SELECT
  USING (coach_id = auth.uid());

CREATE POLICY "Client can read own coaches" ON coach_clients FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Super admin can read all relationships" ON coach_clients FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- ==========================================
-- 3. WORKOUT & NUTRITION MANAGEMENT
-- ==========================================

-- Workout Plans
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  description TEXT,
  exercises JSONB NOT NULL DEFAULT '[]',
  duration_weeks INTEGER,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  created_by TEXT CHECK (created_by IN ('coach', 'client')),
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their workout plans" ON workout_plans FOR SELECT
  USING (client_id = auth.uid() OR coach_id = auth.uid());

CREATE POLICY "Coach can update their client's plans" ON workout_plans FOR UPDATE
  USING (coach_id = auth.uid());


-- Meal Plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  description TEXT,
  meals JSONB NOT NULL DEFAULT '[]',
  macros JSONB NOT NULL DEFAULT '{"protein": 0, "carbs": 0, "fats": 0, "calories": 0}',
  duration_days INTEGER,
  created_by TEXT CHECK (created_by IN ('coach', 'client')),
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their meal plans" ON meal_plans FOR SELECT
  USING (client_id = auth.uid() OR coach_id = auth.uid());

CREATE POLICY "Coach can update their client's plans" ON meal_plans FOR UPDATE
  USING (coach_id = auth.uid());


-- ==========================================
-- 4. TRACKING & PROGRESS
-- ==========================================

-- Workout Logs
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES workout_plans(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  exercise_name TEXT NOT NULL,
  sets JSONB NOT NULL DEFAULT '[]',
  total_volume_kg NUMERIC DEFAULT 0,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own logs" ON workout_logs FOR SELECT
  USING (user_id = auth.uid() OR
    EXISTS(SELECT 1 FROM coach_clients WHERE coach_id = auth.uid() AND client_id = user_id)
  );


-- Progress Tracking
CREATE TABLE IF NOT EXISTS progress_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES users(id) ON DELETE SET NULL,
  track_date DATE NOT NULL,
  weight_kg NUMERIC,
  body_fat_percentage NUMERIC,
  measurements JSONB DEFAULT '{"chest": 0, "waist": 0, "hips": 0, "arms": 0, "thighs": 0}',
  photos TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE progress_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress" ON progress_tracking FOR SELECT
  USING (user_id = auth.uid() OR coach_id = auth.uid());


-- Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  attended BOOLEAN DEFAULT false,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own attendance records" ON attendance_records FOR SELECT
  USING (coach_id = auth.uid());

CREATE POLICY "Client can read own attendance" ON attendance_records FOR SELECT
  USING (client_id = auth.uid());


-- ==========================================
-- 5. COMMUNICATION
-- ==========================================

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  file_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their messages" ON chat_messages FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can insert own messages" ON chat_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());


-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('info', 'warning', 'error', 'success')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());


-- ==========================================
-- 6. BILLING & SUBSCRIPTIONS
-- ==========================================

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'premium', 'elite')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'failed')),
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription" ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can read all subscriptions" ON subscriptions FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  transaction_id TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payments" ON payments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can read all payments" ON payments FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- ==========================================
-- 7. AUDIT & LOGGING
-- ==========================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read audit logs" ON audit_logs FOR SELECT
  USING (
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );


-- ==========================================
-- 8. LEGACY TABLES (Existing compatibility)
-- ==========================================

-- Daily Tracker Logs
CREATE TABLE IF NOT EXISTS tracker_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  water_glasses INTEGER DEFAULT 0,
  synced_steps INTEGER DEFAULT 0,
  logged_calories INTEGER DEFAULT 0,
  logged_protein INTEGER DEFAULT 0,
  logged_fats INTEGER DEFAULT 0,
  walk_lunch_dinner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tracker_logs_user_date_unique UNIQUE (user_id, log_date)
);

ALTER TABLE tracker_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tracker logs" ON tracker_logs FOR SELECT
  USING (user_id = auth.uid());


-- Progress History (30-day tracking)
CREATE TABLE IF NOT EXISTS progress_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  water_val NUMERIC DEFAULT 0.0,
  protein_val INTEGER DEFAULT 0,
  fats_val INTEGER DEFAULT 0,
  lifting_val NUMERIC DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT progress_history_user_day_unique UNIQUE (user_id, day_number)
);

ALTER TABLE progress_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress history" ON progress_history FOR SELECT
  USING (user_id = auth.uid());


-- Push Subscriptions (PWA notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public write for push subscriptions" ON push_subscriptions FOR INSERT
  WITH CHECK (true);


-- ==========================================
-- 9. INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_coach_clients_coach ON coach_clients(coach_id);
CREATE INDEX idx_coach_clients_client ON coach_clients(client_id);
CREATE INDEX idx_workout_plans_client ON workout_plans(client_id);
CREATE INDEX idx_meal_plans_client ON meal_plans(client_id);
CREATE INDEX idx_workout_logs_user ON workout_logs(user_id);
CREATE INDEX idx_progress_tracking_user ON progress_tracking(user_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_receiver ON chat_messages(receiver_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_coach_applications_status ON coach_applications(status);
CREATE INDEX idx_tracker_logs_user_date ON tracker_logs(user_id, log_date);


-- ==========================================
-- 10. VERIFICATION
-- ==========================================

-- Verify all tables created
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
