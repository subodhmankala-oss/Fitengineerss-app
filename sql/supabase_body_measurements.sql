-- ==========================================
-- BODY MEASUREMENTS (15-day progress tracking, shared with the coach)
-- Paste this script into the Supabase SQL Editor.
--
-- Body measurements used to live only in localStorage / a single overwritten
-- snapshot on the client, so nothing was comparable over time and the coach
-- could never see them. This is a history table: one row per save, each
-- stamped with measured_at, so the client and their coach can compare change
-- across entries. The app enforces one save per 15 days on the client side
-- (a client can't spam new rows); the coach reads the same rows read-only.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Per-part cm values as a flexible map (chest, waist, hips, thighs, calves,
  -- shoulders, upperArm, forearm, neck, and body weight) — same keys the
  -- client's Measurements form uses, so new parts don't need a migration.
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_id_date
  ON public.body_measurements(user_id, measured_at DESC);

-- Same permissive-RLS model as workout_logs/workout_plans/workout_drafts in
-- this project — the app talks to PostgREST with the anon key only, so a
-- default-deny policy would block every read/write. Access is scoped in
-- client code (own user_id, or a client the coach is viewing).
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "body_measurements_allow_all" ON public.body_measurements;
CREATE POLICY "body_measurements_allow_all" ON public.body_measurements
  FOR ALL USING (true) WITH CHECK (true);
