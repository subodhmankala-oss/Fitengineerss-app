-- ==========================================
-- FITENGINEERS ROLE-LESS AUTHENTICATION SCHEMA
-- Paste this script into the Supabase SQL Editor to initialize the tables.
-- ==========================================

-- 1. Create Public Users Table (Synchronized with auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'email')),
  password_hash TEXT, -- only for email auth fallback / custom validations
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own user record" ON public.users;
CREATE POLICY "Users can read their own user record" ON public.users 
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own user record" ON public.users;
CREATE POLICY "Users can update their own user record" ON public.users 
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow public inserts on users during signup" ON public.users;
CREATE POLICY "Allow public inserts on users during signup" ON public.users 
  FOR INSERT WITH CHECK (true);


-- 2. Create Coaches Table
CREATE TABLE IF NOT EXISTS public.coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  brand_name TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);

-- Enable RLS for coaches
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone logged in can view coaches list" ON public.coaches;
CREATE POLICY "Anyone logged in can view coaches list" ON public.coaches 
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Coaches can update their own profile" ON public.coaches;
CREATE POLICY "Coaches can update their own profile" ON public.coaches 
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update any coach status" ON public.coaches;
CREATE POLICY "Admins can update any coach status" ON public.coaches 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND email = 'subodhmankala@gmail.com'
    )
  );


-- 3. Create Clients Table
-- coach_id is nullable: a client can exist before being linked to any coach
-- (coach linking now happens from inside the dashboard, not as a login gate).
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  fitness_goal TEXT,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  age INTEGER,
  activity_level TEXT,
  dietary_preference TEXT,
  calorie_target INTEGER,
  protein_target INTEGER,
  carbs_target INTEGER,
  fats_target INTEGER,
  issue TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration for an already-existing table: drop the NOT NULL constraint and switch
-- the FK action to SET NULL so a coach can be deleted without taking the client with it.
-- Safe to run any number of times; never affects existing rows' data.
ALTER TABLE public.clients ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_coach_id_fkey;
ALTER TABLE public.clients ADD CONSTRAINT clients_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;

-- One-time post-signup onboarding wizard (Part 2): program/activity/concern selections
-- plus the completion flag that gates whether the wizard is shown again.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS program TEXT
  CHECK (program IN ('fat_loss', 'muscle_building', 'gut_repair'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_concern TEXT
  CHECK (primary_concern IN ('bloating_constipation', 'digestion_issues', 'just_stay_fit'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Don't force clients who already completed the old body-stats flow (pre-wizard)
-- back through onboarding just because the new flag defaults to false.
UPDATE public.clients
SET onboarding_completed = true
WHERE onboarding_completed = false
  AND age IS NOT NULL AND weight_kg IS NOT NULL AND height_cm IS NOT NULL;

-- Enable RLS for clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read their own client profile" ON public.clients;
CREATE POLICY "Clients can read their own client profile" ON public.clients 
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Clients can update their own client profile" ON public.clients;
CREATE POLICY "Clients can update their own client profile" ON public.clients 
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can read their own clients" ON public.clients;
CREATE POLICY "Coaches can read their own clients" ON public.clients 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.coaches c 
      WHERE c.user_id = auth.uid() AND c.id = public.clients.coach_id
    )
  );

DROP POLICY IF EXISTS "Admins can read all clients" ON public.clients;
CREATE POLICY "Admins can read all clients" ON public.clients 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND email = 'subodhmankala@gmail.com'
    )
  );

DROP POLICY IF EXISTS "Allow new client profile creation" ON public.clients;
CREATE POLICY "Allow new client profile creation" ON public.clients 
  FOR INSERT WITH CHECK (user_id = auth.uid());


-- 4. Create Coach Applications Table
CREATE TABLE IF NOT EXISTS public.coach_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  experience_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Enable RLS for coach applications
ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own application" ON public.coach_applications;
CREATE POLICY "Users can view their own application" ON public.coach_applications 
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own application" ON public.coach_applications;
CREATE POLICY "Users can insert their own application" ON public.coach_applications 
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all applications" ON public.coach_applications;
CREATE POLICY "Admins can manage all applications" ON public.coach_applications 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND email = 'subodhmankala@gmail.com'
    )
  );
