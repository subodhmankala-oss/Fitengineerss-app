-- ==========================================
-- WORKOUT PLANS: is_assigned flag (Live Log should save a plan, but not
-- push it into the client's "Coach Assigned Plans" list)
-- Paste this script into the Supabase SQL Editor.
--
-- Today, every row in workout_plans with created_by='coach' is shown to
-- BOTH the coach (their own "Workout Plan" tab list) AND the client (their
-- "Coach Assigned Plans" section) — the two screens read the exact same
-- query with no way to tell "a real assignment" from "just a coach-side
-- record". That's a problem for Live Log: when a coach logs a client's
-- session in real time, the workout should be saved as a reusable plan in
-- the coach's own list, WITHOUT appearing as a newly assigned plan on the
-- client's side (assignment stays a deliberate action via the plan editor's
-- Save/Duplicate, same as it already works today).
--
-- DEFAULT true means every existing plan (all created via the deliberate
-- "assign" flow so far) keeps behaving exactly as before — nothing already
-- assigned disappears from any client's screen.
-- ==========================================

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS is_assigned BOOLEAN NOT NULL DEFAULT true;
