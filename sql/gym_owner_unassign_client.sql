-- ==========================================
-- GYM TIER — owner takes a client off their trainer (back to "waiting")
--
-- STATUS: APPLIED to production 2026-10-15.
--
-- owner_unassign_client(p_owner_id, p_client_id): the client stays in the
-- gym with no trainer, so they show under "waiting for a trainer" in My Gym
-- again and their app shows "Trainer coming soon · <gym>". Called only from
-- api/admin-write.js (owner-unassign-client) with p_owner_id from the
-- VERIFIED caller; EXECUTE revoked from anon/authenticated.
--
-- Checks: the client is a client in a gym the caller owns, the gym is
-- active, and the client currently has a trainer. Clears users.coach_id and
-- clients.coach_id, and closes the open coach_assignments row (the history
-- keeps who coached them and until when).
-- ==========================================

CREATE OR REPLACE FUNCTION public.owner_unassign_client(p_owner_id uuid, p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
  v_gym_status TEXT;
  v_prev_coach_id UUID;
BEGIN
  IF p_owner_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'Missing owner or client.';
  END IF;

  SELECT g.id, g.status, c.coach_id
  INTO v_gym_id, v_gym_status, v_prev_coach_id
  FROM public.users c
  JOIN public.gyms g ON g.id = c.gym_id
  WHERE c.id = p_client_id
    AND c.role = 'client'
    AND g.owner_id = p_owner_id
  FOR UPDATE OF c;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'That client is not in your gym.';
  END IF;
  IF v_gym_status <> 'active' THEN
    RAISE EXCEPTION 'Your gym is suspended. Contact support.';
  END IF;
  IF v_prev_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'changed', false);
  END IF;

  UPDATE public.users SET coach_id = NULL WHERE id = p_client_id;
  UPDATE public.clients SET coach_id = NULL WHERE user_id = p_client_id;
  UPDATE public.coach_assignments
  SET ended_at = now()
  WHERE client_id = p_client_id AND ended_at IS NULL;

  RETURN jsonb_build_object('success', true, 'changed', true, 'previous_coach_id', v_prev_coach_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_unassign_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
