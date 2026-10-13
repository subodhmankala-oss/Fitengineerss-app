-- Adds a Hyrox section to the Workout Library: a third `category`
-- ('hyrox') next to 'gym' and 'home', with its own Beginner/Intermediate/
-- Advanced programs, and the four Hyrox station exercises the shared
-- catalog was missing (SkiErg, Sled Pull, Sandbag Lunge, Burpee Broad Jump).
-- Advanced Hyrox Engine (supabase_trend_workout_library.sql) moves here
-- from Gym > Advanced.
--
-- Hyrox programs never swap exercises week to week (utils/weeklySwaps.js)
-- and use the gym warm-ups. Timed moves put their duration in `reps`
-- ("4 min"); the logger turns it into the timer's target.
--
-- Safe to re-run.

ALTER TABLE public.workout_templates DROP CONSTRAINT IF EXISTS workout_templates_category_check;
ALTER TABLE public.workout_templates
  ADD CONSTRAINT workout_templates_category_check CHECK (category IN ('gym', 'home', 'hyrox'));

-- ─── NEW EXERCISES ───

INSERT INTO public.exercises (name, category, primary_muscle, secondary_muscle, setup, execution, tip)
VALUES
  ('SkiErg', 'Cardio', 'Cardio', 'Back, Shoulders, Core',
   'Stand facing the SkiErg, feet hip-width apart, arms reaching up to the handles.',
   'Pull both handles down in one powerful motion, hinging at the hips and bending the knees slightly, then let the arms rise back up. Log the time.',
   'Drive with your lats and hips, not just your arms. Keep a steady rhythm you can hold for the whole set.'),
  ('Sled Pull', 'Legs', 'Quadriceps', 'Back, Glutes, Forearms',
   'Attach a rope to the loaded sled and walk back until it is tight. Stand facing the sled in a low athletic stance.',
   'Pull the rope hand over hand, sitting your hips back and driving through your legs, until the sled reaches you. Log the load (kg) and the distance (m).',
   'Use your legs and back together. Stay low and keep the pull continuous instead of jerking the rope.'),
  ('Sandbag Lunge', 'Legs', 'Quadriceps', 'Glutes, Core',
   'Rest a sandbag across your shoulders behind your neck, standing tall with feet hip-width apart.',
   'Step forward into a lunge until your back knee lightly touches the floor, then drive up and step through into the next lunge. Log the load (kg) and the distance (m).',
   'Keep your chest up and your front knee tracking over your toes. Short, controlled steps beat long, wobbly ones.'),
  ('Burpee Broad Jump', 'Other', 'Full Body', 'Quadriceps, Core, Chest',
   'Stand with feet shoulder-width apart, with clear space in front of you.',
   'Drop into a burpee with your chest to the floor, then jump your feet in and leap forward as far as you can with both feet. Land softly and go straight into the next burpee.',
   'Find a pace you can repeat. A steady rhythm is faster over a race than big jumps followed by long rests.')
ON CONFLICT (name) DO NOTHING;

-- ─── MOVE HYROX ENGINE INTO THE SECTION ───

UPDATE public.workout_templates SET category = 'hyrox'
WHERE name = 'Advanced Hyrox Engine' AND difficulty_level = 'advanced' AND category = 'gym';

-- ─── HYROX — BEGINNER ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Starter', '[
  {"name": "Running", "sets": 3, "reps": "500 m", "rest": "90s", "order": 1},
  {"name": "Sled Push", "sets": 3, "reps": "15m", "rest": "90s", "order": 2},
  {"name": "Farmer Walk", "sets": 3, "reps": "30m", "rest": "60s", "order": 3},
  {"name": "Wall Ball", "sets": 3, "reps": "10", "rest": "60s", "order": 4}
]'::jsonb, true, 'beginner', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Starter' AND category = 'hyrox');

-- ─── HYROX — INTERMEDIATE ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Builder', '[
  {"name": "Running", "sets": 4, "reps": "1 km", "rest": "90s", "order": 1},
  {"name": "SkiErg", "sets": 4, "reps": "2 min", "rest": "60s", "order": 2},
  {"name": "Sled Push", "sets": 4, "reps": "20m", "rest": "90s", "order": 3},
  {"name": "Burpee Broad Jump", "sets": 3, "reps": "10", "rest": "60s", "order": 4},
  {"name": "Wall Ball", "sets": 3, "reps": "15", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Builder' AND category = 'hyrox');

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Strength', '[
  {"name": "Barbell Squat", "sets": 4, "reps": "6", "rest": "120s", "order": 1},
  {"name": "Romanian Deadlift", "sets": 4, "reps": "8", "rest": "90s", "order": 2},
  {"name": "Sled Pull", "sets": 4, "reps": "20m", "rest": "90s", "order": 3},
  {"name": "Sandbag Lunge", "sets": 3, "reps": "20m", "rest": "90s", "order": 4},
  {"name": "Farmer Walk", "sets": 4, "reps": "40m", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Strength' AND category = 'hyrox');

-- ─── HYROX — ADVANCED ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Half Race Sim', '[
  {"name": "Running", "sets": 8, "reps": "500 m", "rest": "0s", "order": 1},
  {"name": "SkiErg", "sets": 1, "reps": "4 min", "rest": "0s", "order": 2},
  {"name": "Sled Push", "sets": 1, "reps": "25m", "rest": "0s", "order": 3},
  {"name": "Sled Pull", "sets": 1, "reps": "25m", "rest": "0s", "order": 4},
  {"name": "Burpee Broad Jump", "sets": 1, "reps": "20", "rest": "0s", "order": 5},
  {"name": "Air Rowing", "sets": 1, "reps": "4 min", "rest": "0s", "order": 6},
  {"name": "Farmer Walk", "sets": 1, "reps": "100m", "rest": "0s", "order": 7},
  {"name": "Sandbag Lunge", "sets": 1, "reps": "50m", "rest": "0s", "order": 8},
  {"name": "Wall Ball", "sets": 1, "reps": "50", "rest": "0s", "order": 9}
]'::jsonb, true, 'advanced', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Half Race Sim' AND category = 'hyrox');

-- ─── THIRD PROGRAM PER LEVEL (same 3-per-level pattern as Gym/Home) ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Run & Row', '[
  {"name": "Running", "sets": 4, "reps": "400 m", "rest": "90s", "order": 1},
  {"name": "Air Rowing", "sets": 3, "reps": "2 min", "rest": "60s", "order": 2},
  {"name": "Lunge", "sets": 3, "reps": "10", "rest": "60s", "order": 3},
  {"name": "Wall Ball", "sets": 3, "reps": "10", "rest": "60s", "order": 4}
]'::jsonb, true, 'beginner', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Run & Row' AND category = 'hyrox');

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Foundations', '[
  {"name": "Goblet Squat", "sets": 3, "reps": "10", "rest": "90s", "order": 1},
  {"name": "Kettlebell Swing", "sets": 3, "reps": "12", "rest": "60s", "order": 2},
  {"name": "Sled Pull", "sets": 3, "reps": "15m", "rest": "90s", "order": 3},
  {"name": "Farmer Walk", "sets": 3, "reps": "30m", "rest": "60s", "order": 4}
]'::jsonb, true, 'beginner', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Foundations' AND category = 'hyrox');

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Compromised Run', '[
  {"name": "Running", "sets": 4, "reps": "800 m", "rest": "0s", "order": 1},
  {"name": "Sandbag Lunge", "sets": 4, "reps": "20m", "rest": "60s", "order": 2},
  {"name": "Air Rowing", "sets": 4, "reps": "2 min", "rest": "60s", "order": 3},
  {"name": "Wall Ball", "sets": 4, "reps": "15", "rest": "60s", "order": 4},
  {"name": "Farmer Walk", "sets": 4, "reps": "40m", "rest": "60s", "order": 5}
]'::jsonb, true, 'intermediate', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Compromised Run' AND category = 'hyrox');

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Hyrox Heavy Stations', '[
  {"name": "Front Squat", "sets": 4, "reps": "5", "rest": "120s", "order": 1},
  {"name": "Sled Push", "sets": 5, "reps": "20m", "rest": "120s", "order": 2},
  {"name": "Sled Pull", "sets": 5, "reps": "20m", "rest": "120s", "order": 3},
  {"name": "Sandbag Lunge", "sets": 4, "reps": "30m", "rest": "90s", "order": 4},
  {"name": "Wall Ball", "sets": 4, "reps": "25", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced', 'hyrox'
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Hyrox Heavy Stations' AND category = 'hyrox');
