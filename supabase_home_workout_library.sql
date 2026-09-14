-- Adds a `category` dimension ('gym' | 'home') to public.workout_templates
-- alongside the existing `difficulty_level`, and seeds a Home Beginner/
-- Intermediate/Advanced library (bodyweight/no-equipment only) mirroring
-- the existing Gym one — see supabase_generic_workout_levels.sql.
--
-- Every existing row (the current Gym library) is backfilled to
-- category = 'gym', so nothing already shipped changes behavior.
--
-- Safe to re-run: column creation is idempotent, seed insert is guarded by
-- a NOT EXISTS check per template name + difficulty_level + category.

ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'gym'
  CHECK (category IN ('gym', 'home'));

-- Backfill: every row that existed before this column did is the Gym
-- library — the DEFAULT above only applies to new rows, not existing ones.
UPDATE public.workout_templates SET category = 'gym' WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_templates_category_level
  ON public.workout_templates(category, difficulty_level)
  WHERE difficulty_level IS NOT NULL;

-- ─── HOME — BEGINNER ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Beginner Full Body A', '[
  {"name": "Squat", "sets": 3, "reps": "12", "rest": "60s", "order": 1},
  {"name": "Push Up", "sets": 3, "reps": "10", "rest": "60s", "order": 2},
  {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": "45s", "order": 3},
  {"name": "Plank", "sets": 3, "reps": "30s", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Beginner Full Body A' AND difficulty_level = 'beginner' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Beginner Full Body B', '[
  {"name": "Split Squat", "sets": 3, "reps": "10", "rest": "60s", "order": 1},
  {"name": "Incline Push-up", "sets": 3, "reps": "12", "rest": "60s", "order": 2},
  {"name": "Superman", "sets": 3, "reps": "15", "rest": "45s", "order": 3},
  {"name": "Dead Bug", "sets": 3, "reps": "12", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Beginner Full Body B' AND difficulty_level = 'beginner' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Beginner Core & Mobility', '[
  {"name": "Bird dog", "sets": 3, "reps": "10", "rest": "45s", "order": 1},
  {"name": "Cat camel", "sets": 3, "reps": "10", "rest": "45s", "order": 2},
  {"name": "Crunch", "sets": 3, "reps": "15", "rest": "45s", "order": 3},
  {"name": "Wall Sit", "sets": 3, "reps": "30s", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Beginner Core & Mobility' AND difficulty_level = 'beginner' AND category = 'home'
);

-- ─── HOME — INTERMEDIATE ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Intermediate Upper Body', '[
  {"name": "Push Up", "sets": 4, "reps": "15", "rest": "60s", "order": 1},
  {"name": "Diamond Push-up", "sets": 3, "reps": "12", "rest": "60s", "order": 2},
  {"name": "Explosive / Plyometric Push-Up", "sets": 3, "reps": "10", "rest": "75s", "order": 3},
  {"name": "Superman", "sets": 3, "reps": "15", "rest": "45s", "order": 4},
  {"name": "Plank", "sets": 3, "reps": "45s", "rest": "45s", "order": 5}
]'::jsonb, true, 'intermediate', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Intermediate Upper Body' AND difficulty_level = 'intermediate' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Intermediate Lower Body', '[
  {"name": "Jump Squat", "sets": 4, "reps": "12", "rest": "75s", "order": 1},
  {"name": "Bulgarian Split Squat", "sets": 3, "reps": "10", "rest": "75s", "order": 2},
  {"name": "Reverse Lunge", "sets": 3, "reps": "12", "rest": "60s", "order": 3},
  {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": "60s", "order": 4},
  {"name": "Wall Sit", "sets": 3, "reps": "40s", "rest": "45s", "order": 5}
]'::jsonb, true, 'intermediate', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Intermediate Lower Body' AND difficulty_level = 'intermediate' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Intermediate Core & Cardio', '[
  {"name": "Russian Twist", "sets": 3, "reps": "20", "rest": "45s", "order": 1},
  {"name": "V Up", "sets": 3, "reps": "15", "rest": "45s", "order": 2},
  {"name": "Sit Up", "sets": 3, "reps": "20", "rest": "45s", "order": 3},
  {"name": "Mountain Climber", "sets": 3, "reps": "30s", "rest": "45s", "order": 4},
  {"name": "Burpee", "sets": 3, "reps": "12", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Intermediate Core & Cardio' AND difficulty_level = 'intermediate' AND category = 'home'
);

-- ─── HOME — ADVANCED ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Advanced Push', '[
  {"name": "Diamond Push-up", "sets": 4, "reps": "15", "rest": "60s", "order": 1},
  {"name": "Explosive / Plyometric Push-Up", "sets": 4, "reps": "12", "rest": "75s", "order": 2},
  {"name": "Deficit Push-Up", "sets": 3, "reps": "12", "rest": "75s", "order": 3},
  {"name": "Push-up (Wide Grip)", "sets": 3, "reps": "15", "rest": "60s", "order": 4},
  {"name": "Plank", "sets": 4, "reps": "45s", "rest": "45s", "order": 5}
]'::jsonb, true, 'advanced', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Advanced Push' AND difficulty_level = 'advanced' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Advanced Legs', '[
  {"name": "Jump Squat", "sets": 5, "reps": "15", "rest": "75s", "order": 1},
  {"name": "Bulgarian Split Squat", "sets": 4, "reps": "12", "rest": "75s", "order": 2},
  {"name": "Curtsy Lunge", "sets": 3, "reps": "12", "rest": "60s", "order": 3},
  {"name": "Single Leg Deadlift", "sets": 3, "reps": "10", "rest": "60s", "order": 4},
  {"name": "Wall Sit", "sets": 4, "reps": "45s", "rest": "45s", "order": 5}
]'::jsonb, true, 'advanced', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Advanced Legs' AND difficulty_level = 'advanced' AND category = 'home'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Advanced Conditioning', '[
  {"name": "Burpee", "sets": 5, "reps": "15", "rest": "60s", "order": 1},
  {"name": "High Knees", "sets": 4, "reps": "30s", "rest": "45s", "order": 2},
  {"name": "Jumping Jack", "sets": 4, "reps": "30s", "rest": "45s", "order": 3},
  {"name": "Mountain Climber", "sets": 4, "reps": "30s", "rest": "45s", "order": 4},
  {"name": "Foot Fires", "sets": 3, "reps": "30s", "rest": "45s", "order": 5}
]'::jsonb, true, 'advanced', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Advanced Conditioning' AND difficulty_level = 'advanced' AND category = 'home'
);
