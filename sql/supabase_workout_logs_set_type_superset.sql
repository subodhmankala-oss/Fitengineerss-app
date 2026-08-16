-- ==========================================
-- WORKOUT LOGS SET TYPE: add 'superset'
-- Paste this script into the Supabase SQL Editor.
--
-- supabase_workout_logs_set_type.sql created workout_logs.set_type with a
-- CHECK constraint limited to warmup/drop/failure. Superset is a new set
-- type (client Log Sets + coach Live Log/Plan editor), so the constraint
-- needs to allow it too or every superset save 23514s.
-- ==========================================

ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_set_type_check;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_set_type_check
  CHECK (set_type IN ('warmup', 'drop', 'failure', 'superset') OR set_type IS NULL);
