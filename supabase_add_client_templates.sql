-- =========================================================================
-- MIGRATION: Add client_id to workout_templates
-- Run this in: Supabase Dashboard → SQL Editor
-- =========================================================================

-- Step 1: Create workout_templates if it does not exist yet
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exercises JSONB NOT NULL,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Add client_id column (nullable — generic templates keep client_id = NULL)
ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Step 3: Index for fast per-client lookups
CREATE INDEX IF NOT EXISTS idx_workout_templates_client_id
  ON public.workout_templates(client_id);

-- Step 4: Enable RLS
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on workout_templates" ON public.workout_templates;
CREATE POLICY "Allow public access on workout_templates"
  ON public.workout_templates FOR ALL USING (true) WITH CHECK (true);

-- Step 5: Seed generic templates (safe, skips if already exist)
INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Push day', '[{"name":"Bench Press","sets":3,"reps":10},{"name":"Overhead Press","sets":3,"reps":10},{"name":"Triceps Pushdown","sets":3,"reps":12},{"name":"Lateral Raise","sets":3,"reps":15}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Push day');

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Pull day', '[{"name":"Pull-up","sets":3,"reps":8},{"name":"Barbell Row","sets":3,"reps":10},{"name":"Biceps Curl","sets":3,"reps":12},{"name":"Face Pull","sets":3,"reps":15}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Pull day');

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Leg day', '[{"name":"Squat","sets":3,"reps":10},{"name":"Romanian Deadlift","sets":3,"reps":10},{"name":"Leg Press","sets":3,"reps":12},{"name":"Calf Raise","sets":3,"reps":15}]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Leg day');