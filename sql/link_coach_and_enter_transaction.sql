-- Connect-client-to-coach transaction (invite-code redemption).
-- Called from databaseService.connectClientToCoach → linkCoachAndEnterTransaction.
--
-- Fixed 2026-07-09:
--   1. Name clobbering — the old version force-defaulted v_client_name to
--      'Warrior' BEFORE the writes, so `full_name = COALESCE(v_client_name,
--      existing)` always overwrote a real existing name (with 'Warrior' when
--      nothing better was found). Now we treat 'Warrior'/blank as "no name",
--      never downgrade a real existing name, and only fill when the stored
--      name is missing/placeholder.
--   2. Dead auth.users lookup — the old version read auth.users WHERE id =
--      p_client_id, but p_client_id is public.users.id, which never equals
--      auth.users.id (the auth UID) on this project, so the Google display
--      name was never captured. Now it matches auth.users on EMAIL.
--
-- p_client_id is always public.users.id (the app resolves it via
-- resolveCanonicalUserId before calling — never the auth UID).

CREATE OR REPLACE FUNCTION public.link_coach_and_enter_transaction(p_invite_code text, p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_invite_id UUID;
  v_coach_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_used BOOLEAN;
  v_coach_role TEXT;
  v_coach_email TEXT;
  v_coach_status TEXT;
  v_client_email TEXT;
  v_client_name TEXT;
  v_validation_time TIMESTAMPTZ;
  v_response JSONB;
BEGIN
  -- Normalization
  p_invite_code := trim(upper(p_invite_code));
  v_validation_time := now();

  -- 1. Validate invitation code
  SELECT id, coach_id, expires_at, used
  INTO v_invite_id, v_coach_id, v_expires_at, v_used
  FROM public.invitations
  WHERE trim(upper(code)) = p_invite_code
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation code.';
  END IF;

  IF v_used IS TRUE THEN
    RAISE EXCEPTION 'Invitation code has already been used.';
  END IF;

  IF v_expires_at < v_validation_time THEN
    RAISE EXCEPTION 'Invitation code has expired.';
  END IF;

  -- Ensure coach exists and is an active coach
  SELECT u.role, u.email, c.status
  INTO v_coach_role, v_coach_email, v_coach_status
  FROM public.users u
  LEFT JOIN public.coaches c ON c.user_id = u.id
  WHERE u.id = v_coach_id;

  IF v_coach_email IS NULL OR NOT (
    v_coach_role IN ('coach', 'super-admin', 'admin') OR
    v_coach_status = 'approved' OR
    lower(v_coach_email) = 'subodhmankala@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Invitation belongs to an inactive or invalid coach.';
  END IF;

  -- Resolve the client's email + existing REAL name from public.users (the
  -- app's source of truth). NULLIF collapses the 'Warrior' placeholder to NULL
  -- so it is treated as "no name yet".
  SELECT email, NULLIF(full_name, 'Warrior')
  INTO v_client_email, v_client_name
  FROM public.users
  WHERE id = p_client_id;

  -- If there is still no real name, try the Google display name from
  -- auth.users — matched by EMAIL (auth.users.id != public.users.id here).
  IF v_client_name IS NULL AND v_client_email IS NOT NULL THEN
    SELECT NULLIF(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'), 'Warrior')
    INTO v_client_name
    FROM auth.users
    WHERE lower(email) = lower(v_client_email)
    LIMIT 1;
  END IF;

  -- Email fallback for a brand-new row. Deliberately NO 'Warrior' default for
  -- the name — leaving it NULL lets the app fall back to the email prefix and,
  -- more importantly, guarantees the writes below can never clobber a real
  -- name with a placeholder.
  v_client_email := COALESCE(v_client_email, 'client_' || p_client_id || '@fitengineers.com');

  -- 3. Create or update user row in public.users
  INSERT INTO public.users (
    id,
    email,
    role,
    coach_id,
    verified,
    full_name,
    payment_status
  ) VALUES (
    p_client_id,
    v_client_email,
    'client',
    v_coach_id,
    true,
    v_client_name,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET role = 'client',
      coach_id = v_coach_id,
      verified = true,
      payment_status = 'active',
      -- Keep any real existing name; only fill from the resolved name when the
      -- stored value is missing or the 'Warrior' placeholder. Never downgrade.
      full_name = COALESCE(NULLIF(public.users.full_name, 'Warrior'), v_client_name);

  -- 4. Create or update client profile in public.clients
  INSERT INTO public.clients (
    user_id,
    coach_id,
    full_name
  ) VALUES (
    p_client_id,
    v_coach_id,
    v_client_name
  )
  ON CONFLICT (user_id) DO UPDATE
  SET coach_id = v_coach_id,
      full_name = COALESCE(NULLIF(public.clients.full_name, 'Warrior'), v_client_name);

  -- 4b. Create/update coach-client relationship in coach_clients if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coach_clients' AND table_schema = 'public') THEN
    INSERT INTO public.coach_clients (
      coach_id,
      client_id,
      status
    ) VALUES (
      v_coach_id,
      p_client_id,
      'active'
    )
    ON CONFLICT (coach_id, client_id) DO UPDATE
    SET status = 'active';
  END IF;

  -- 2. Mark invitation as used
  UPDATE public.invitations
  SET used = true,
      used_at = now(),
      used_by = p_client_id
  WHERE id = v_invite_id;

  -- 5. Post-transaction internal verification checks
  IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE id = v_invite_id AND used = true) THEN
    RAISE EXCEPTION 'Verification failed: invitation not marked used.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_client_id AND coach_id = v_coach_id) THEN
    RAISE EXCEPTION 'Verification failed: client profile not created/updated.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_client_id AND role = 'client' AND coach_id = v_coach_id AND payment_status = 'active') THEN
    RAISE EXCEPTION 'Verification failed: user role or coach ID not updated.';
  END IF;

  -- Build success response
  v_response := jsonb_build_object(
    'success', true,
    'coach_id', v_coach_id,
    'client_id', p_client_id,
    'code_used', p_invite_code,
    'expires_at', v_expires_at,
    'validation_time', v_validation_time
  );

  RETURN v_response;
EXCEPTION
  WHEN OTHERS THEN
    -- PL/pgSQL automatically rolls back the entire transaction if an exception is raised
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;
