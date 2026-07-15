-- ==========================================
-- WORKOUT LOGS CARDIO FIELDS (distance + duration for cardio exercises)
-- Paste this script into the Supabase SQL Editor.
--
-- Cardio exercises (Running, Jogging, Cycling, Cross Trainer, Incline Walk,
-- and any custom exercise auto-classified as Cardio — see isCardioExercise
-- in src/data/exerciseLibrary.js) are logged as distance (km) + time instead
-- of weight + reps. workout_logs is a per-set table with fixed reps/weight_kg
-- columns, so these two new nullable columns hold the cardio-specific values;
-- reps/weight_kg are still written as 0 for cardio rows so the NOT NULL-style
-- insert shape stays uniform across every set.
-- NULL on both = a strength set (or a cardio session logged before this
-- migration ran).
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS cardio_duration_seconds INTEGER;
