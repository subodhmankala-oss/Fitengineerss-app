-- ==========================================
-- GYM TIER — owner moves a client to another trainer in their gym
--
-- STATUS: APPLIED to production 2026-10-14.
--
-- Called only from api/admin-write.js?action=owner-assign-client, which
-- passes p_owner_id resolved from the caller's VERIFIED token (never from
-- the request body). EXECUTE is revoked from anon/authenticated below, so
-- the API route is the only way in — same pattern as
-- sql/revoke_admin_rpc_anon_execute.sql.
--
-- All checks happen here, in one transaction:
--   * the client is a client in a gym the caller owns, and that gym is active
--   * the new trainer is an ACTIVE member of that same gym (role coach or
--     super-admin — the owner can assign to themselves)
-- Then users.coach_id + clients.coach_id move, and coach_assignments closes
-- the open row and opens a new one (source 'owner_assign', assigned_by =
-- owner). Assigning to the current trainer is a successful no-op.
-- ==========================================

CREATE OR REPLACE FUNCTION public.owner_assign_client(p_owner_id uuid, p_client_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
  v_gym_status TEXT;
  v_prev_coach_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_owner_id IS NULL OR p_client_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'Missing owner, client or trainer.';
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

  IF NOT EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = p_coach_id
      AND t.gym_id = v_gym_id
      AND t.gym_status = 'active'
      AND t.role IN ('coach', 'super-admin')
  ) THEN
    RAISE EXCEPTION 'That trainer is not in your gym.';
  END IF;

  IF v_prev_coach_id IS NOT DISTINCT FROM p_coach_id THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'coach_id', p_coach_id);
  END IF;

  UPDATE public.users SET coach_id = p_coach_id WHERE id = p_client_id;

  INSERT INTO public.clients (user_id, coach_id)
  VALUES (p_client_id, p_coach_id)
  ON CONFLICT (user_id) DO UPDATE SET coach_id = EXCLUDED.coach_id;

  UPDATE public.coach_assignments
  SET ended_at = v_now
  WHERE client_id = p_client_id AND ended_at IS NULL;

  INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at)
  VALUES (p_client_id, p_coach_id, v_gym_id, p_owner_id, 'owner_assign', v_now);

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'coach_id', p_coach_id,
    'previous_coach_id', v_prev_coach_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_assign_client(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
