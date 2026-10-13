-- Adds five trend-based Workout Library programs (Oct 2026): the 12-3-30
-- incline walk, Zone 2 cardio, Hyrox, an Upper/Lower leg day and a
-- Pilates-style core & mobility day, plus the three exercises they need
-- that the shared catalog didn't have (Sled Push, Wall Ball, Hundred).
--
-- Cardio moves put their duration in `reps` ("30 min"); the logger turns
-- that into the time target (see utils/templateTargets.js).
--
-- Safe to re-run: every insert is guarded by a NOT EXISTS / ON CONFLICT.

-- ─── NEW EXERCISES ───

INSERT INTO public.exercises (name, category, primary_muscle, secondary_muscle, setup, execution, tip)
VALUES
  ('Sled Push', 'Legs', 'Quadriceps', 'Glutes, Calves',
   'Load the sled and grip the posts or handles low, arms straight, body leaning forward at about 45 degrees.',
   'Drive through the legs with short, powerful steps, keeping your back flat and hips low. Log the load (kg) and the distance (m).',
   'Stay low and keep stepping — do not stand up tall. Start light and build the load week by week.'),
  ('Wall Ball', 'Other', 'Full Body', 'Quadriceps, Shoulders',
   'Hold a medicine ball at your chest, facing a wall, standing an arm''s length away with feet shoulder-width apart.',
   'Squat to full depth, then drive up and throw the ball to a target on the wall above head height. Catch it and go straight into the next squat.',
   'Use the leg drive to throw, not just the arms. Keep your chest up as you catch and descend.'),
  ('Hundred', 'Core', 'Core / Abs', 'Hip Flexors',
   'Lie on your back, legs lifted to a tabletop or extended at a low angle, head and shoulders curled off the floor.',
   'Reach your arms long by your sides and pump them in small, quick beats while you breathe in for 5 and out for 5. Hold for the time shown.',
   'Press your lower back into the floor. If it lifts, raise your legs higher or bend the knees.')
ON CONFLICT (name) DO NOTHING;

-- ─── GYM — BEGINNER ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Beginner Incline Walk 12-3-30', '[
  {"name": "Incline Walk", "sets": 1, "reps": "30 min", "rest": "0s", "order": 1},
  {"name": "Dead Bug", "sets": 3, "reps": "10", "rest": "30s", "order": 2},
  {"name": "Bird dog", "sets": 3, "reps": "10", "rest": "30s", "order": 3},
  {"name": "Plank", "sets": 3, "reps": "30s", "rest": "30s", "order": 4}
]'::jsonb, true, 'beginner', 'gym'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Beginner Incline Walk 12-3-30' AND difficulty_level = 'beginner' AND category = 'gym'
);

-- ─── GYM — INTERMEDIATE ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Intermediate Zone 2 Cardio Base', '[
  {"name": "Cycling", "sets": 1, "reps": "40 min", "rest": "0s", "order": 1},
  {"name": "Incline Walk", "sets": 1, "reps": "20 min", "rest": "0s", "order": 2},
  {"name": "Bird dog", "sets": 3, "reps": "10", "rest": "30s", "order": 3},
  {"name": "Dead Bug", "sets": 3, "reps": "12", "rest": "30s", "order": 4},
  {"name": "Side Plank", "sets": 3, "reps": "30s", "rest": "30s", "order": 5}
]'::jsonb, true, 'intermediate', 'gym'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Zone 2 Cardio Base' AND difficulty_level = 'intermediate' AND category = 'gym'
);

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Intermediate Lower', '[
  {"name": "Goblet Squat", "sets": 4, "reps": "10", "rest": "90s", "order": 1},
  {"name": "Romanian Deadlift", "sets": 4, "reps": "8", "rest": "120s", "order": 2},
  {"name": "Hip Thrust", "sets": 3, "reps": "10", "rest": "90s", "order": 3},
  {"name": "Step-up", "sets": 3, "reps": "10", "rest": "60s", "order": 4},
  {"name": "Standing Calf Raise", "sets": 4, "reps": "15", "rest": "45s", "order": 5}
]'::jsonb, true, 'intermediate', 'gym'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Intermediate Lower' AND difficulty_level = 'intermediate' AND category = 'gym'
);

-- ─── GYM — ADVANCED ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Advanced Hyrox Engine', '[
  {"name": "Running", "sets": 4, "reps": "1 km", "rest": "60s", "order": 1},
  {"name": "Sled Push", "sets": 4, "reps": "25m", "rest": "60s", "order": 2},
  {"name": "Air Rowing", "sets": 4, "reps": "500m", "rest": "60s", "order": 3},
  {"name": "Farmer Walk", "sets": 4, "reps": "40m", "rest": "60s", "order": 4},
  {"name": "Wall Ball", "sets": 4, "reps": "20", "rest": "60s", "order": 5}
]'::jsonb, true, 'advanced', 'gym'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Advanced Hyrox Engine' AND difficulty_level = 'advanced' AND category = 'gym'
);

-- ─── HOME — BEGINNER ───

INSERT INTO public.workout_templates (name, exercises, is_default, difficulty_level, category)
SELECT 'Home Beginner Pilates Core & Mobility', '[
  {"name": "Hundred", "sets": 3, "reps": "30s", "rest": "30s", "order": 1},
  {"name": "Dead Bug", "sets": 3, "reps": "10", "rest": "30s", "order": 2},
  {"name": "Bird dog", "sets": 3, "reps": "10", "rest": "30s", "order": 3},
  {"name": "Glute Bridge", "sets": 3, "reps": "12", "rest": "30s", "order": 4}
]'::jsonb, true, 'beginner', 'home'
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_templates WHERE name = 'Home Beginner Pilates Core & Mobility' AND difficulty_level = 'beginner' AND category = 'home'
);
