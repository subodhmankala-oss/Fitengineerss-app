-- ==========================================
-- WORKOUT LOGS RPE + EXERCISE NOTES
-- Applied to production on 2026-09-29.
--
-- Added for a per-exercise "RPE & Notes" panel in the live loggers that was
-- removed again before shipping. Nothing reads or writes these columns now;
-- they are nullable and empty. Kept here only so the repo matches the
-- production schema. To drop them:
--   ALTER TABLE public.workout_logs DROP COLUMN IF EXISTS rpe, DROP COLUMN IF EXISTS exercise_notes;
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS rpe NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  ADD COLUMN IF NOT EXISTS exercise_notes TEXT;
