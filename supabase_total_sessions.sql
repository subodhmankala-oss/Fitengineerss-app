-- ==========================================
-- COACHING PROGRAM TOTAL SESSIONS
-- Paste this script into the Supabase SQL Editor.
--
-- Stores the coach-set program length on the per-pair clients record
-- (clients.user_id is UNIQUE, clients.coach_id = coach's users.id), so the
-- value is inherently scoped to one coach+client relationship.
--
-- Does NOT touch RLS policies, the auth.uid() mapping, the invitations
-- flow, or any other table. Safe to re-run.
-- ==========================================

-- 1. Program length. NULL = coach has not configured a total yet
--    (client home shows a "not configured" state instead of fake numbers).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS total_sessions INTEGER;

-- 2. Coach-scoped setter. SECURITY DEFINER so the write works regardless of
--    which clients RLS policy set is deployed, WITHOUT modifying any policy.
--    The WHERE clause enforces the coach<->client relationship: a coach can
--    only ever update rows where clients.coach_id is their own users.id.
CREATE OR REPLACE FUNCTION public.set_client_total_sessions(
  p_coach_id UUID,     -- coach's users.id
  p_client_id UUID,    -- client's users.id
  p_total INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_total IS NOT NULL AND p_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'total_sessions must be >= 0');
  END IF;

  UPDATE public.clients
  SET total_sessions = p_total
  WHERE user_id = p_client_id
    AND coach_id = p_coach_id;   -- multi-tenant scope check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching coach-client relationship.');
  END IF;

  RETURN jsonb_build_object('success', true, 'total_sessions', p_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
