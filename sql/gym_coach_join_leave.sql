-- ==========================================
-- GYM TIER — trainers join / leave a gym with its code
--
-- STATUS: APPLIED to production 2026-10-15.
--
-- Called only from api/admin-write.js (coach-join-gym / coach-leave-gym) and
-- api/auth-register.js (optional gym code on Coach Sign Up), always with
-- p_coach_id resolved from a VERIFIED identity. EXECUTE is revoked from
-- anon/authenticated below.
--
-- No approval (sql/gym_tier_no_approval.sql): a valid code for an active gym
-- puts the trainer in the gym immediately.
--
-- Existing clients: only moved into the gym when p_bring_clients is true —
-- the trainer chooses (default off), so an independent trainer's private
-- clients never become visible to a gym owner without that choice. Clients
-- who connect to the trainer AFTER joining get the gym automatically via
-- link_coach_and_enter_transaction (sql/gym_tier.sql).
--
-- Leaving: the trainer's clients in that gym leave with them (they keep their
-- trainer). An owner cannot leave the gym they own.
-- ==========================================

CREATE OR REPLACE FUNCTION public.coach_join_gym(p_coach_id uuid, p_code text, p_bring_clients boolean DEFAULT false)
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
  v_current_gym UUID;
  v_current_name TEXT;
  v_moved INT := 0;
BEGIN
  -- Accept "gym-7x6p", " 7X6P " etc.: uppercase, strip spaces, add the prefix.
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
    RAISE EXCEPTION 'No gym found with that code. Check it with your gym owner.';
  END IF;
  IF v_gym_status <> 'active' THEN
    RAISE EXCEPTION 'That gym isn''t active right now.';
  END IF;

  SELECT role, gym_id INTO v_role, v_current_gym
  FROM public.users WHERE id = p_coach_id FOR UPDATE;
  IF v_role IS NULL OR v_role NOT IN ('coach', 'super-admin') THEN
    RAISE EXCEPTION 'Only coach accounts can join a gym.';
  END IF;
  IF v_current_gym IS NOT NULL AND v_current_gym <> v_gym_id THEN
    SELECT name INTO v_current_name FROM public.gyms WHERE id = v_current_gym;
    RAISE EXCEPTION 'You''re already in %. Leave it first to join another gym.', coalesce(v_current_name, 'another gym');
  END IF;

  UPDATE public.users SET gym_id = v_gym_id, gym_status = 'active'
  WHERE id = p_coach_id AND gym_id IS DISTINCT FROM v_gym_id;

  IF p_bring_clients THEN
    WITH moved AS (
      UPDATE public.users SET gym_id = v_gym_id, gym_status = 'active'
      WHERE coach_id = p_coach_id AND role = 'client' AND gym_id IS NULL
      RETURNING id
    ), hist AS (
      UPDATE public.coach_assignments a SET gym_id = v_gym_id
      FROM moved WHERE a.client_id = moved.id AND a.ended_at IS NULL AND a.gym_id IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_moved FROM moved;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_member', v_current_gym IS NOT DISTINCT FROM v_gym_id,
    'gym_id', v_gym_id,
    'gym_name', v_gym_name,
    'clients_moved', v_moved
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.coach_leave_gym(p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
  v_gym_name TEXT;
  v_owner UUID;
  v_left INT := 0;
BEGIN
  SELECT u.gym_id, g.name, g.owner_id INTO v_gym_id, v_gym_name, v_owner
  FROM public.users u LEFT JOIN public.gyms g ON g.id = u.gym_id
  WHERE u.id = p_coach_id AND u.role IN ('coach', 'super-admin')
  FOR UPDATE OF u;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'You''re not in a gym.';
  END IF;
  IF v_owner = p_coach_id THEN
    RAISE EXCEPTION 'You own %, so you can''t leave it.', v_gym_name;
  END IF;

  WITH left_clients AS (
    UPDATE public.users SET gym_id = NULL, gym_status = NULL
    WHERE coach_id = p_coach_id AND role = 'client' AND gym_id = v_gym_id
    RETURNING id
  )
  SELECT count(*) INTO v_left FROM left_clients;

  UPDATE public.users SET gym_id = NULL, gym_status = NULL WHERE id = p_coach_id;

  RETURN jsonb_build_object('success', true, 'gym_name', v_gym_name, 'clients_left', v_left);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.coach_join_gym(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.coach_leave_gym(uuid) FROM PUBLIC, anon, authenticated;
