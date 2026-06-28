-- Adds difficulty levels to public.workout_templates and seeds the
-- Beginner/Intermediate/Advanced generic workout library from
-- docs/generic_workout_library.md.
--
-- Safe to re-run: table/column creation is idempotent, seed insert is
-- guarded by a NOT EXISTS check per template name + difficulty_level so
-- re-running this file will not create duplicates.
--
-- NOTE: public.workout_templates did not exist in production at all
-- (the app was silently running on a hardcoded JS fallback). The block
-- below recreates it exactly as defined in supabase_workout_templates_schema.sql
-- (same RLS policy: public read-only, no new/loosened access) so the
-- rest of this migration has a table to alter. It does NOT seed the
-- original Push/Pull/Leg Day rows — those keep using the JS fallback
-- unless you separately ask to migrate them too.

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

ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT
  CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));

CREATE INDEX IF NOT EXISTS idx_workout_templates_difficulty_level
  ON public.workout_templates(difficulty_level)
  WHERE difficulty_level IS NOT NULL;

-- ─── BEGINNER ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Beginner Full Body A', '[
  {"name": "Goblet Squat", "sets": 3, "reps": "12", "rest": "60s", "order": 1},
  {"name": "Push-up", "sets": 3, "reps": "10", "rest": "60s", "order": 2},
  {"name": "Dumbbell Row", "sets": 3, "reps": "12", "rest": "60s", "order": 3},
  {"name": "Plank", "sets": 3, "reps": "30s", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Beginner Full Body A' AND difficulty_level = 'beginner'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Beginner Full Body B', '[
  {"name": "Leg Press", "sets": 3, "reps": "12", "rest": "60s", "order": 1},
  {"name": "Chest Press (Machine)", "sets": 3, "reps": "12", "rest": "60s", "order": 2},
  {"name": "Seated Row (Machine)", "sets": 3, "reps": "12", "rest": "60s", "order": 3},
  {"name": "Dead Bug", "sets": 3, "reps": "12", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Beginner Full Body B' AND difficulty_level = 'beginner'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Beginner Lower & Core', '[
  {"name": "Dumbbell Squat", "sets": 3, "reps": "12", "rest": "60s", "order": 1},
  {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": "45s", "order": 2},
  {"name": "Calf Raise (Standing)", "sets": 3, "reps": "15", "rest": "45s", "order": 3},
  {"name": "Crunch", "sets": 3, "reps": "15", "rest": "45s", "order": 4}
]'::jsonb, true, 'beginner'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Beginner Lower & Core' AND difficulty_level = 'beginner'
);

-- ─── INTERMEDIATE ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Intermediate Push', '[
  {"name": "Bench Press", "sets": 4, "reps": "8–10", "rest": "90s", "order": 1},
  {"name": "Overhead Press (Dumbbell)", "sets": 3, "reps": "10", "rest": "75s", "order": 2},
  {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10", "rest": "75s", "order": 3},
  {"name": "Cable Fly", "sets": 3, "reps": "12", "rest": "60s", "order": 4},
  {"name": "Triceps Pushdown", "sets": 3, "reps": "12", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Push' AND difficulty_level = 'intermediate'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Intermediate Pull', '[
  {"name": "Barbell Row", "sets": 4, "reps": "8–10", "rest": "90s", "order": 1},
  {"name": "Lat Pulldown", "sets": 3, "reps": "10", "rest": "75s", "order": 2},
  {"name": "Seated Cable Row", "sets": 3, "reps": "12", "rest": "75s", "order": 3},
  {"name": "Face Pull", "sets": 3, "reps": "15", "rest": "60s", "order": 4},
  {"name": "Hammer Curl", "sets": 3, "reps": "12", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Pull' AND difficulty_level = 'intermediate'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Intermediate Legs', '[
  {"name": "Barbell Squat", "sets": 4, "reps": "8–10", "rest": "90s", "order": 1},
  {"name": "Romanian Deadlift", "sets": 3, "reps": "10", "rest": "90s", "order": 2},
  {"name": "Leg Press", "sets": 3, "reps": "12", "rest": "75s", "order": 3},
  {"name": "Leg Curl (Seated)", "sets": 3, "reps": "12", "rest": "60s", "order": 4},
  {"name": "Calf Raise (Standing)", "sets": 3, "reps": "15", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Legs' AND difficulty_level = 'intermediate'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Intermediate Upper Body', '[
  {"name": "Shoulder Press (Barbell)", "sets": 4, "reps": "8", "rest": "90s", "order": 1},
  {"name": "Pull-up", "sets": 3, "reps": "8", "rest": "90s", "order": 2},
  {"name": "Dip", "sets": 3, "reps": "10", "rest": "75s", "order": 3},
  {"name": "Dumbbell Row", "sets": 3, "reps": "10", "rest": "75s", "order": 4},
  {"name": "Lateral Raise", "sets": 3, "reps": "15", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Upper Body' AND difficulty_level = 'intermediate'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Intermediate Core & Conditioning', '[
  {"name": "Kettlebell Swing", "sets": 4, "reps": "15", "rest": "60s", "order": 1},
  {"name": "Russian Twist", "sets": 3, "reps": "20", "rest": "45s", "order": 2},
  {"name": "Hanging Knee Raise", "sets": 3, "reps": "12", "rest": "45s", "order": 3},
  {"name": "Mountain Climber", "sets": 3, "reps": "30s", "rest": "45s", "order": 4},
  {"name": "Farmer Walk", "sets": 3, "reps": "40m", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Core & Conditioning' AND difficulty_level = 'intermediate'
);

-- ─── ADVANCED ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Push (Strength)', '[
  {"name": "Bench Press", "sets": 5, "reps": "5", "rest": "120s", "order": 1},
  {"name": "Incline Barbell Press", "sets": 4, "reps": "6", "rest": "100s", "order": 2},
  {"name": "Overhead Press (Barbell)", "sets": 4, "reps": "6", "rest": "100s", "order": 3},
  {"name": "Close Grip Bench Press", "sets": 3, "reps": "8", "rest": "90s", "order": 4},
  {"name": "Cable Overhead Triceps Extension", "sets": 3, "reps": "12", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Push (Strength)' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Pull (Strength)', '[
  {"name": "Deadlift", "sets": 5, "reps": "5", "rest": "150s", "order": 1},
  {"name": "Pendlay Row", "sets": 4, "reps": "6", "rest": "100s", "order": 2},
  {"name": "Pull-up", "sets": 4, "reps": "8", "rest": "90s", "order": 3},
  {"name": "Barbell Shrug", "sets": 3, "reps": "10", "rest": "75s", "order": 4},
  {"name": "Face Pull (Cable)", "sets": 3, "reps": "15", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Pull (Strength)' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Legs (Strength)', '[
  {"name": "Front Squat", "sets": 5, "reps": "5", "rest": "150s", "order": 1},
  {"name": "Romanian Deadlift", "sets": 4, "reps": "8", "rest": "100s", "order": 2},
  {"name": "Bulgarian Split Squat", "sets": 3, "reps": "10", "rest": "90s", "order": 3},
  {"name": "Hack Squat", "sets": 3, "reps": "10", "rest": "90s", "order": 4},
  {"name": "Seated Calf Raise", "sets": 4, "reps": "15", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Legs (Strength)' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Hypertrophy Push', '[
  {"name": "Incline Dumbbell Press", "sets": 4, "reps": "10", "rest": "90s", "order": 1},
  {"name": "Chest Dip", "sets": 4, "reps": "10", "rest": "90s", "order": 2},
  {"name": "Cable Crossover", "sets": 3, "reps": "15", "rest": "60s", "order": 3},
  {"name": "Lateral Raise (Cable)", "sets": 4, "reps": "15", "rest": "60s", "order": 4},
  {"name": "Triceps Rope Pushdown", "sets": 4, "reps": "12", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Hypertrophy Push' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Hypertrophy Pull', '[
  {"name": "Lat Pulldown (Wide Grip)", "sets": 4, "reps": "10", "rest": "90s", "order": 1},
  {"name": "One Arm Dumbbell Row", "sets": 4, "reps": "10", "rest": "90s", "order": 2},
  {"name": "Cable Row (Seated)", "sets": 4, "reps": "12", "rest": "75s", "order": 3},
  {"name": "Rear Delt Fly (Cable)", "sets": 3, "reps": "15", "rest": "60s", "order": 4},
  {"name": "EZ Bar Curl", "sets": 4, "reps": "10", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Hypertrophy Pull' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Athletic Conditioning', '[
  {"name": "Box Jump", "sets": 5, "reps": "5", "rest": "90s", "order": 1},
  {"name": "Burpee", "sets": 4, "reps": "15", "rest": "60s", "order": 2},
  {"name": "Kettlebell Swing", "sets": 4, "reps": "20", "rest": "60s", "order": 3},
  {"name": "Sumo Deadlift", "sets": 4, "reps": "6", "rest": "120s", "order": 4},
  {"name": "Plank (Side)", "sets": 3, "reps": "45s", "rest": "45s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Athletic Conditioning' AND difficulty_level = 'advanced'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level)
SELECT 'Advanced Full Body Power', '[
  {"name": "Clean and Press", "sets": 5, "reps": "5", "rest": "120s", "order": 1},
  {"name": "Front Squat", "sets": 4, "reps": "8", "rest": "100s", "order": 2},
  {"name": "Push-up (Wide Grip)", "sets": 4, "reps": "15", "rest": "60s", "order": 3},
  {"name": "Box Squat", "sets": 4, "reps": "8", "rest": "90s", "order": 4},
  {"name": "V Up", "sets": 4, "reps": "15", "rest": "45s", "order": 5}
]'::jsonb, true, 'advanced'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Full Body Power' AND difficulty_level = 'advanced'
);
