-- ==========================================
-- WORKOUT LOGS SESSION METRICS (Live timer duration + calories burned)
-- Paste this script into the Supabase SQL Editor.
--
-- The coach's Live Log tab now runs a session timer and estimates calories
-- burned (from reps x weight per set, plus rest time between sets) while
-- logging live. workout_logs is a per-set table with no session-level row,
-- so — same pattern as set_type in supabase_workout_logs_set_type.sql — the
-- session's final duration/calories are written onto every set row that
-- belongs to it and read back from any one of them when grouping by date.
-- NULL = a session saved before this feature existed, or logged without a
-- live timer running.
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS calories_burned NUMERIC;
