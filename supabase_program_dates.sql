-- ==========================================
-- PROGRAM DATES + TOTAL-SESSIONS "LAST UPDATED" TIMESTAMP
-- Paste this script into the Supabase SQL Editor.
--
-- Extends the coach-set program-length feature (supabase_total_sessions.sql)
-- with:
--   1. total_sessions_updated_at — stamped server-side every time a coach
--      changes total_sessions, so the coach dashboard can show "Last
--      updated: <date>" without trusting client clocks.
--   2. program_started_on / program_est_completion — coach-editable dates
--      shown on the client's Program Sessions card, scoped to the
--      coach<->client pair exactly like total_sessions already is.
--
-- Does NOT touch RLS policies, the auth.uid() mapping, the invitations
-- flow, or any other table. Safe to re-run.
-- ==========================================

-- 1. New columns. NULL = not set yet (coach hasn't configured them).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS total_sessions_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS program_started_on DATE,
  ADD COLUMN IF NOT EXISTS program_est_completion DATE;

-- 2. Replace the total-sessions setter so it also stamps
--    total_sessions_updated_at = now() and returns it, so the coach UI can
--    show "Last updated" immediately without a second round-trip.
CREATE OR REPLACE FUNCTION public.set_client_total_sessions(
  p_coach_id UUID,     -- coach's users.id
  p_client_id UUID,    -- client's users.id
  p_total INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_updated INTEGER;
  v_updated_at TIMESTAMPTZ := now();
BEGIN
  IF p_total IS NOT NULL AND p_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'total_sessions must be >= 0');
  END IF;

  UPDATE public.clients
  SET total_sessions = p_total,
      total_sessions_updated_at = v_updated_at
  WHERE user_id = p_client_id
    AND coach_id = p_coach_id;   -- multi-tenant scope check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching coach-client relationship.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_sessions', p_total,
    'total_sessions_updated_at', v_updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Coach-scoped setter for the program's start/estimated-completion
--    dates. Same SECURITY DEFINER + WHERE-clause scope check as above.
--    Either date may be passed NULL to clear it.
CREATE OR REPLACE FUNCTION public.set_client_program_dates(
  p_coach_id UUID,       -- coach's users.id
  p_client_id UUID,      -- client's users.id
  p_started_on DATE,
  p_est_completion DATE
) RETURNS JSONB AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.clients
  SET program_started_on = p_started_on,
      program_est_completion = p_est_completion
  WHERE user_id = p_client_id
    AND coach_id = p_coach_id;   -- multi-tenant scope check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching coach-client relationship.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'program_started_on', p_started_on,
    'program_est_completion', p_est_completion
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
