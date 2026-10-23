-- ==========================================
-- GYM TIER — "trains on their own" gym members
--
-- STATUS: APPLIED to production 2026-10-15.
--
-- 2026-10-15: "there is no option if the client doesn't want a trainer" —
-- the only no-trainer state was the waiting list, which promises a trainer
-- is coming. A gym client is now one of:
--   * with a trainer          users.coach_id set
--   * waiting for a trainer   coach_id NULL, gym_self_guided false
--   * trains on their own     coach_id NULL, gym_self_guided true
--
-- 1. users.gym_self_guided (default false). Only meaningful while gym_id is
--    set and coach_id is NULL.
-- 2. owner_unassign_client gains p_self_guided (replaces the 2-arg version
--    in sql/gym_owner_unassign_client.sql): takes the trainer off (if any)
--    and sets the client to waiting (false) or trains-on-their-own (true).
--    Also moves a no-trainer client between those two states.
-- 3. owner_assign_client clears the flag (re-created from
--    sql/gym_client_join.sql, unchanged otherwise).
-- 4. client_join_gym resets the flag when a client joins a different gym, so
--    a choice made in one gym never leaks into another.
--
-- All service-role only (EXECUTE revoked from anon/authenticated).
-- ==========================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gym_self_guided BOOLEAN NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.owner_unassign_client(uuid, uuid);

CREATE OR REPLACE FUNCTION public.owner_unassign_client(p_owner_id uuid, p_client_id uuid, p_self_guided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
  v_gym_status TEXT;
  v_prev_coach_id UUID;
  v_prev_self BOOLEAN;
  v_target BOOLEAN := coalesce(p_self_guided, false);
BEGIN
  IF p_owner_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'Missing owner or client.';
  END IF;

  SELECT g.id, g.status, c.coach_id, c.gym_self_guided
  INTO v_gym_id, v_gym_status, v_prev_coach_id, v_prev_self
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
  IF v_prev_coach_id IS NULL AND v_prev_self = v_target THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'self_guided', v_target);
  END IF;

  UPDATE public.users SET coach_id = NULL, gym_self_guided = v_target WHERE id = p_client_id;

  IF v_prev_coach_id IS NOT NULL THEN
    UPDATE public.clients SET coach_id = NULL WHERE user_id = p_client_id;
    UPDATE public.coach_assignments
    SET ended_at = now()
    WHERE client_id = p_client_id AND ended_at IS NULL;
  END IF;

  RETURN jsonb_build_object('success', true, 'changed', true, 'self_guided', v_target, 'previous_coach_id', v_prev_coach_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_unassign_client(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_assign_client(p_owner_id uuid, p_client_id uuid, p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
  v_gym_name TEXT;
  v_gym_status TEXT;
  v_prev_coach_id UUID;
  v_client_name TEXT;
  v_client_email TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_owner_id IS NULL OR p_client_id IS NULL OR p_coach_id IS NULL THEN
    RAISE EXCEPTION 'Missing owner, client or trainer.';
  END IF;

  SELECT g.id, g.name, g.status, c.coach_id, NULLIF(c.full_name, 'Warrior'), c.email
  INTO v_gym_id, v_gym_name, v_gym_status, v_prev_coach_id, v_client_name, v_client_email
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

  UPDATE public.users SET coach_id = p_coach_id, gym_self_guided = false WHERE id = p_client_id;

  INSERT INTO public.clients (user_id, coach_id)
  VALUES (p_client_id, p_coach_id)
  ON CONFLICT (user_id) DO UPDATE SET coach_id = EXCLUDED.coach_id;

  UPDATE public.coach_assignments
  SET ended_at = v_now
  WHERE client_id = p_client_id AND ended_at IS NULL;

  INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at)
  VALUES (p_client_id, p_coach_id, v_gym_id, p_owner_id, 'owner_assign', v_now);

  IF p_coach_id <> p_owner_id THEN
    INSERT INTO public.notifications (recipient_user_id, type, actor_user_id, payload)
    VALUES (
      p_coach_id,
      'client_connected',
      p_client_id,
      jsonb_build_object(
        'client_name', v_client_name,
        'client_email', v_client_email,
        'is_new', true,
        'assigned_by_gym', v_gym_name
      )
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.client_join_gym(p_client_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_code TEXT;
  v_gym_id UUID;
  v_gym_name TEXT;
  v_gym_status TEXT;
  v_role TEXT;
  v_coach_id UUID;
  v_current_gym UUID;
  v_coach_gym UUID;
BEGIN
  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  IF v_code = '' THEN
    RAISE EXCEPTION 'Enter your gym code.';
  END IF;
  IF left(v_code, 4) <> 'GYM-' THEN
    v_code := 'GYM-' || regexp_replace(v_code, '^GYM', '');
  END IF;

  SELECT id, name, status INTO v_gym_id, v_gym_name, v_gym_status
  FROM public.gyms WHERE join_code = v_code;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No gym found with that code. Check it with your gym.';
  END IF;
  IF v_gym_status <> 'active' THEN
    RAISE EXCEPTION 'That gym isn''t active right now.';
  END IF;

  SELECT role, coach_id, gym_id INTO v_role, v_coach_id, v_current_gym
  FROM public.users WHERE id = p_client_id FOR UPDATE;
  IF v_role IS DISTINCT FROM 'client' THEN
    RAISE EXCEPTION 'Only client accounts can join a gym this way. Trainers join from Profile → My Gym.';
  END IF;

  IF v_coach_id IS NOT NULL THEN
    SELECT gym_id INTO v_coach_gym FROM public.users
    WHERE id = v_coach_id AND gym_status = 'active';
    IF v_coach_gym IS DISTINCT FROM v_gym_id THEN
      RAISE EXCEPTION 'You''re already connected to a coach. Ask your gym to move you over.';
    END IF;
  END IF;

  UPDATE public.users SET gym_id = v_gym_id, gym_status = 'active', gym_self_guided = false
  WHERE id = p_client_id AND gym_id IS DISTINCT FROM v_gym_id;

  RETURN jsonb_build_object(
    'success', true,
    'gym_id', v_gym_id,
    'gym_name', v_gym_name,
    'has_trainer', v_coach_id IS NOT NULL,
    'already_member', v_current_gym IS NOT DISTINCT FROM v_gym_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.client_join_gym(uuid, text) FROM PUBLIC, anon, authenticated;
