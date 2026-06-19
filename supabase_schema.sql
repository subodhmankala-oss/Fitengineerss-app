-- ==========================================
-- FITENGINEERS DATABASE SCHEMA
-- Paste this script into the Supabase SQL Editor to create the tables.
-- ==========================================

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  age INTEGER,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  activity_level TEXT,
  fitness_goal TEXT,
  dietary_preference TEXT,
  calorie_target INTEGER,
  protein_target INTEGER,
  fats_target INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) or public access for quick setup.
-- If you want restricted access, configure policies for authenticated users.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and write access" ON users FOR ALL USING (true) WITH CHECK (true);


-- 2. Create Daily Tracker Logs Table
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
CREATE POLICY "Allow public read and write access" ON tracker_logs FOR ALL USING (true) WITH CHECK (true);


-- 3. Create Progress History Table (30-day tracking history)
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
CREATE POLICY "Allow public read and write access" ON progress_history FOR ALL USING (true) WITH CHECK (true);


-- 4. Create Workout Logs Table (Workout sessions & sets tracking)
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps INTEGER DEFAULT 0,
  weight_kg NUMERIC DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and write access" ON workout_logs FOR ALL USING (true) WITH CHECK (true);


-- 5. Create Push Subscriptions Table (PWA lock-screen notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and write access" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);


-- 6. Create Chat Messages Table (Coaching Chat Portal)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'coach')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and write access" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- 7. Create Workout Plans Table (Routines & Templates)
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  exercises JSONB NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('coach', 'client')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read and write access" ON workout_plans FOR ALL USING (true) WITH CHECK (true);

-- 8. Multi-Coach Schema Extensions
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client'; -- 'client', 'coach', 'super-admin'
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'active'; -- 'active' or 'failed'
ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 9. Workout Log routine name tracking
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS plan_name TEXT;

