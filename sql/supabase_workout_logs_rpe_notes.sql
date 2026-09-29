-- ==========================================
-- WORKOUT LOGS RPE + EXERCISE NOTES
-- Paste this script into the Supabase SQL Editor.
--
-- The live logger (client WorkoutTracker + coach Live Log) now has a
-- collapsed-by-default "RPE & Notes" panel per exercise. Same pattern as
-- avg_heart_rate_bpm in supabase_workout_logs_heart_rate.sql: workout_logs is
-- a per-set table with no exercise-level row, so the exercise's RPE and
-- notes are written onto every set row of that exercise and read back from
-- any one of them. NULL = not filled in.
--
-- Until this runs, saves still succeed — databaseService/save-workout-session
-- drop any column PostgREST reports as missing and retry — the RPE/notes are
-- just not stored.
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS rpe NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  ADD COLUMN IF NOT EXISTS exercise_notes TEXT;
