-- ==========================================
-- WORKOUT LOGS HEART RATE (Bluetooth heart rate monitor / smartwatch sync)
-- Paste this script into the Supabase SQL Editor.
--
-- WorkoutTracker can now pair with any BLE wearable exposing the standard
-- GATT Heart Rate Service (smartwatches, fitness bands, chest straps) via
-- Web Bluetooth (see src/hooks/useHeartRateMonitor.js). Same pattern as
-- duration_seconds/calories_burned in supabase_workout_logs_session_metrics.sql:
-- workout_logs is a per-set table with no session-level row, so the
-- session's avg/max BPM is written onto every set row that belongs to it
-- and read back from any one of them when grouping by date. NULL = no
-- heart rate monitor was connected for that session.
-- ==========================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS avg_heart_rate_bpm INTEGER,
  ADD COLUMN IF NOT EXISTS max_heart_rate_bpm INTEGER;
