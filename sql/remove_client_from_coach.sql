-- ==========================================
-- COACH REMOVES A CLIENT
-- Paste this script into the Supabase SQL Editor. Safe to re-run.
--
-- Lets a coach detach a client who is no longer training with them. This is
-- a DETACH, not a delete: the client keeps their account, workout history,
-- measurements and payments. Their clients row goes back to the unattached
-- state (coach_id NULL — the same "Generic" state a self-signup starts in),
-- so they can join another coach with an invite code, and the old coach no
-- longer sees them anywhere.
--
-- Same shape as set_client_paused (supabase_client_pause.sql): SECURITY
-- DEFINER, WHERE clause enforces coach<->client ownership, execute granted
-- to service_role only so api/admin-write.js (which verifies the caller's
-- real session) is the only way in.
-- ==========================================

CREATE OR REPLACE FUNCTION public.remove_client_from_coach(
  p_coach_id UUID,     -- coach's users.id
  p_client_id UUID     -- client's users.id
) RETURNS JSONB AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.clients
  SET coach_id = NULL,
      paused_at = NULL,            -- paused is a coach-side state; clear it
      total_sessions = NULL,       -- the old coach's program length no longer applies
      program_started_on = NULL,
      program_est_completion = NULL
  WHERE user_id = p_client_id
    AND coach_id = p_coach_id;     -- multi-tenant scope check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching coach-client relationship.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

revoke execute on function public.remove_client_from_coach(uuid, uuid) from public;
grant execute on function public.remove_client_from_coach(uuid, uuid) to service_role;
