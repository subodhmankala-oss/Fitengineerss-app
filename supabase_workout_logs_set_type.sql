-- ==========================================
-- WORKOUT LOGS SET TYPE (Warmup / Dropset / Failure)
-- Paste this script into the Supabase SQL Editor.
--
-- workout_logs previously had no way to record a set's type, so Warmup/
-- Dropset/Failure choices made in the coach's Live Log editor were silently
-- discarded on save and never appeared in Workout History. NULL = a normal
-- working set (the correct default for all existing rows).
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS set_type TEXT
  CHECK (set_type IN ('warmup', 'drop', 'failure') OR set_type IS NULL);
