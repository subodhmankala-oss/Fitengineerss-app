-- Client training profile for the AI Draft Builder (2026-10-23).
--
-- Experience level, injuries and equipment used to be typed into the AI
-- builder on every draft and thrown away afterwards. They're stored here,
-- one row per client, so every later draft starts filled in. Written by
-- the client's coach from AIWorkoutBuilderModal (databaseService
-- .saveClientTrainingProfile); same access rule as body_measurements:
-- the client, their coach (is_my_client) or a super-admin.
--
-- Additive only — a new table, nothing existing changes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.client_training_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  experience_level TEXT,
  injuries TEXT,
  equipment TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_training_profiles DROP CONSTRAINT IF EXISTS client_training_profiles_experience_check;
ALTER TABLE public.client_training_profiles ADD CONSTRAINT client_training_profiles_experience_check
  CHECK (experience_level IS NULL OR experience_level IN ('Beginner', 'Intermediate', 'Advanced'));

ALTER TABLE public.client_training_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_training_profiles_select" ON public.client_training_profiles;
CREATE POLICY "client_training_profiles_select" ON public.client_training_profiles FOR SELECT USING (
  user_id = public.current_app_user_id() OR public.is_my_client(user_id) OR public.is_super_admin()
);

DROP POLICY IF EXISTS "client_training_profiles_insert" ON public.client_training_profiles;
CREATE POLICY "client_training_profiles_insert" ON public.client_training_profiles FOR INSERT WITH CHECK (
  user_id = public.current_app_user_id() OR public.is_my_client(user_id) OR public.is_super_admin()
);

DROP POLICY IF EXISTS "client_training_profiles_update" ON public.client_training_profiles;
CREATE POLICY "client_training_profiles_update" ON public.client_training_profiles FOR UPDATE
  USING (user_id = public.current_app_user_id() OR public.is_my_client(user_id) OR public.is_super_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_my_client(user_id) OR public.is_super_admin());
