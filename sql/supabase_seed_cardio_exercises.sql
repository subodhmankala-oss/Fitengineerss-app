-- ==========================================
-- SEED CARDIO EXERCISES (Running, Jogging, Cycling, Cross Trainer, Incline Walk)
-- Paste this script into the Supabase SQL Editor.
--
-- The "Add Exercise" picker reads from the live public.exercises table, not
-- from the app's local exercise list — and that table only self-seeds once,
-- the first time it's ever empty (see databaseService.seedExerciseLibrary()).
-- Since this project's exercises table is already populated, the app will
-- never automatically add these 5 new cardio exercises on its own. This
-- inserts them directly (safe to re-run — ON CONFLICT (name) DO NOTHING).
--
-- Once these are in the catalog, they're auto-detected as cardio by name
-- (src/data/exerciseLibrary.js's isCardioExercise) — that's what makes the
-- workout logger show KM/TIME fields for them instead of WEIGHT/REPS. A
-- coach can also add more cardio exercises later from Coach Dashboard ->
-- Super-Admin -> Exercise Library, picking "Cardio" as the category — this
-- migration is only needed to seed these first 5.
-- ==========================================

INSERT INTO public.exercises (name, category, primary_muscle, secondary_muscle, video_url, setup, execution, tip)
VALUES
  ('Running', 'Cardio', 'Cardio', 'Legs, Core', '',
   'Wear supportive running shoes on a treadmill, track, or outdoor route.',
   'Maintain a steady pace with relaxed shoulders and a natural arm swing. Log the distance covered and total time.',
   'Start at a conversational pace and build up gradually — consistency beats speed early on.'),
  ('Jogging', 'Cardio', 'Cardio', 'Legs, Core', '',
   'Wear supportive running shoes. Warm up with a brisk walk for 2-3 minutes first.',
   'Keep a light, steady jogging pace you can sustain. Log the distance covered and total time.',
   'Land softly and keep your stride relaxed — jogging is about endurance, not speed.'),
  ('Cycling', 'Cardio', 'Cardio', 'Legs, Glutes', '',
   'Set up a stationary bike or outdoor bicycle with the seat at hip height.',
   'Pedal at a steady cadence, keeping your core engaged. Log the distance covered and total time.',
   'Adjust resistance to keep your heart rate in a sustainable zone for the full session.'),
  ('Cross Trainer', 'Cardio', 'Cardio', 'Full Body', '',
   'Step onto the elliptical/cross trainer and grip the moving handles.',
   'Push and pull through the handles while pedaling in a smooth, controlled motion. Log the distance covered and total time.',
   'Keep your posture upright — avoid leaning heavily on the handles to get the full-body benefit.'),
  ('Incline Walk', 'Cardio', 'Cardio', 'Legs, Glutes', '',
   'Set the treadmill to an incline (start around 5-10%) at a brisk walking pace.',
   'Walk with a tall posture, driving through your heels. Log the distance covered and total time.',
   'Avoid holding the handrails — let your legs and core do the work for the full benefit.')
ON CONFLICT (name) DO NOTHING;
