-- ==========================================
-- GENERIC WORKOUT TEMPLATES SCHEMA (Part 3)
-- Paste this script into the Supabase SQL Editor.
-- These templates are not tied to any coach or client — every client has
-- access to them as a baseline, regardless of coach_id.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on workout_templates" ON public.workout_templates;
CREATE POLICY "Allow public read on workout_templates" ON public.workout_templates
  FOR SELECT USING (true);

-- Seed the 3 starter templates exactly once (safe to re-run).
INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Push Day',
  '[
    {"name": "Bench Press", "sets": 3, "reps": "8-12", "order": 1},
    {"name": "Overhead Press", "sets": 3, "reps": "8-12", "order": 2},
    {"name": "Triceps Pushdown", "sets": 3, "reps": "8-12", "order": 3},
    {"name": "Lateral Raise", "sets": 3, "reps": "8-12", "order": 4}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Push Day' AND is_default = true
);

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Pull Day',
  '[
    {"name": "Deadlift", "sets": 3, "reps": "8-12", "order": 1},
    {"name": "Lat Pulldown", "sets": 3, "reps": "8-12", "order": 2},
    {"name": "Seated Row", "sets": 3, "reps": "8-12", "order": 3},
    {"name": "Bicep Curl", "sets": 3, "reps": "8-12", "order": 4}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Pull Day' AND is_default = true
);

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Leg Day',
  '[
    {"name": "Squat", "sets": 3, "reps": "8-12", "order": 1},
    {"name": "Leg Press", "sets": 3, "reps": "8-12", "order": 2},
    {"name": "Leg Curl", "sets": 3, "reps": "8-12", "order": 3},
    {"name": "Calf Raise", "sets": 3, "reps": "8-12", "order": 4}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Leg Day' AND is_default = true
);
