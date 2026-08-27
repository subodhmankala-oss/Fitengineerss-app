-- ==========================================
-- CUSTOM EXERCISES — coach/client "Create Exercise" from the Add Exercise
-- picker (ExercisePickerModal's "Create '{query}'" row), separate from the
-- shared admin-curated public.exercises catalog (exercises_table.sql),
-- which stays admin-only.
--
-- Visibility (confirmed with the user):
-- - A coach creates one while working with a specific client (TrainerDashboard's
--   selectedClient context) -> visible to that coach + that one client only.
-- - A client creates one on their own (WorkoutTracker) -> visible to only
--   that client (their own private library) — NOT automatically shared with
--   their assigned coach.
-- - super-admin sees everything, and gets a push notification every time
--   anyone creates one (see api/push.js's custom_exercise_created event).
--
-- Run this once in the Supabase SQL editor (same manual-apply pattern as
-- every other sql/*.sql file in this repo).
-- ==========================================

CREATE TABLE IF NOT EXISTS public.custom_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  equipment TEXT,
  category TEXT,
  primary_muscle TEXT,
  secondary_muscles TEXT[],
  media_url TEXT,
  -- Always the user who tapped "Create" — a coach or a client.
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Set only when a coach created this (for their own client); null for a
  -- client-created (self-only) exercise.
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- The client this exercise is scoped to: the client themselves when
  -- client-created, or the specific client the coach was working with when
  -- coach-created.
  client_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_exercises DROP CONSTRAINT IF EXISTS custom_exercises_equipment_check;
ALTER TABLE public.custom_exercises ADD CONSTRAINT custom_exercises_equipment_check
  CHECK (equipment IS NULL OR equipment IN ('Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Resistance Band', 'Other'));

ALTER TABLE public.custom_exercises DROP CONSTRAINT IF EXISTS custom_exercises_category_check;
ALTER TABLE public.custom_exercises ADD CONSTRAINT custom_exercises_category_check
  CHECK (category IS NULL OR category IN ('Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Warm Up', 'Whole Body'));

CREATE INDEX IF NOT EXISTS custom_exercises_created_by_idx ON public.custom_exercises (created_by_user_id);
CREATE INDEX IF NOT EXISTS custom_exercises_coach_id_idx ON public.custom_exercises (coach_id);
CREATE INDEX IF NOT EXISTS custom_exercises_client_user_id_idx ON public.custom_exercises (client_user_id);

ALTER TABLE public.custom_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_exercises_select" ON public.custom_exercises;
CREATE POLICY "custom_exercises_select" ON public.custom_exercises FOR SELECT USING (
  created_by_user_id = public.current_app_user_id()
  OR coach_id = public.current_app_user_id()
  OR client_user_id = public.current_app_user_id()
  OR public.is_super_admin()
);

-- A coach may only insert one scoped to a client they actually coach
-- (is_my_client) and stamped with their own coach_id; a client may only
-- insert one scoped to themselves with no coach_id. Either way the creator
-- must be the caller.
DROP POLICY IF EXISTS "custom_exercises_insert" ON public.custom_exercises;
CREATE POLICY "custom_exercises_insert" ON public.custom_exercises FOR INSERT WITH CHECK (
  created_by_user_id = public.current_app_user_id()
  AND (
    (coach_id IS NULL AND client_user_id = public.current_app_user_id())
    OR (coach_id = public.current_app_user_id() AND public.is_my_client(client_user_id))
  )
);

-- No UPDATE/DELETE policy — deliberately not offered yet (no edit/delete UI
-- was asked for). RLS denies both by default with no policy present.

-- ─── Storage bucket for the "Add Asset" photo/video on a custom exercise ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('custom-exercise-media', 'custom-exercise-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "custom_exercise_media_insert" ON storage.objects;
CREATE POLICY "custom_exercise_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'custom-exercise-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "custom_exercise_media_read" ON storage.objects;
CREATE POLICY "custom_exercise_media_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'custom-exercise-media');
