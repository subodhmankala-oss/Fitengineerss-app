-- ==========================================
-- GYM TIER — step 1: schema only
--
-- STATUS: NOT APPLIED. Nothing in the app reads or writes these yet.
-- Rollback: sql/rollback_gym_tier.sql
--
-- Adds a Gym level between the admin and coaches:
--
--   super-admin
--    └── gyms (owned by a 'gym_owner' user)
--         ├── coaches  (users.gym_id = gym, users.gym_status = pending|active)
--         │    └── clients (users.coach_id = coach, users.gym_id = gym)
--         └── unassigned clients (users.gym_id = gym, users.coach_id IS NULL)
--
-- Purely additive and backward compatible:
--   * every new column is nullable — independent coaches/clients keep
--     gym_id = NULL and behave exactly as today;
--   * the only behaviour change to existing code is in
--     link_coach_and_enter_transaction(): the client now inherits the
--     coach's gym (NULL for independent coaches) and an assignment history
--     row is written. Its inputs and existing response keys are unchanged.
--
-- New tables are RLS-enabled with NO policies, so only the service role
-- (api/*) and SECURITY DEFINER functions can touch them. Owner-facing read
-- policies come with the owner dashboard (step 3), not before.
--
-- Idempotent — safe to re-run.
-- ==========================================


-- ------------------------------------------
-- 1. Role: allow 'gym_owner'
-- ------------------------------------------
-- The live constraint is CHECK (role IN ('client','coach','super-admin')).
-- Drop whatever role CHECK exists (name not guaranteed) and re-add it.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'coach', 'super-admin', 'gym_owner'));


-- ------------------------------------------
-- 2. Gym join codes: GYM-XXXX
-- ------------------------------------------
-- No 0/O/1/I so codes survive being read aloud at a front desk.
CREATE OR REPLACE FUNCTION public.generate_gym_join_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
BEGIN
  LOOP
    v_code := 'GYM-';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN to_regclass('public.gyms') IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.gyms WHERE join_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$function$;


-- ------------------------------------------
-- 3. gyms
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- SET NULL, not CASCADE: deleting an owner account must never take the
  -- gym (and its coach/client links) with it. Admin re-assigns an owner.
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  join_code TEXT NOT NULL UNIQUE DEFAULT public.generate_gym_join_code(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  -- Owners see attendance/progress by default; private coach notes and
  -- progress photos only when this is switched on for the gym.
  owner_sees_private BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gyms_owner_id ON public.gyms(owner_id);

ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gyms FROM anon, authenticated;


-- ------------------------------------------
-- 4. users.gym_id / users.gym_status
-- ------------------------------------------
-- gym_id is stored on clients directly (not derived through their coach) so
-- "all clients in my gym" is one indexed filter, and a client between
-- coaches (coach_id NULL) still belongs to the gym.
--
-- gym_status:
--   coach  — 'pending' after entering a gym code, 'active' once the owner
--            approves. Only 'active' coaches pass their gym to new clients.
--   client — always 'active' when gym_id is set.
--   NULL   — not in a gym.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gym_status TEXT;

-- COALESCE: a CHECK that evaluates to NULL passes, so a bare
-- `gym_status IN (...)` would let gym_id-without-status rows through.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_gym_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_gym_status_check
  CHECK (
    (gym_id IS NULL AND gym_status IS NULL)
    OR (gym_id IS NOT NULL AND COALESCE(gym_status IN ('pending', 'active'), false))
  );

CREATE INDEX IF NOT EXISTS idx_users_gym_id ON public.users(gym_id) WHERE gym_id IS NOT NULL;


-- ------------------------------------------
-- 5. coach_assignments — who coached a client, when, and who decided
-- ------------------------------------------
-- Workout logs already belong to the client, so the training history moves
-- with them on reassignment; this table records the coaching history.
-- Exactly one open row (ended_at IS NULL) per client at a time.
CREATE TABLE IF NOT EXISTS public.coach_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL,
  -- NULL = the client did it themselves (invite code / gym code).
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL
    CHECK (source IN ('backfill', 'invite_code', 'gym_code', 'owner_assign', 'admin_assign')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_assignments_open
  ON public.coach_assignments(client_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coach_assignments_coach
  ON public.coach_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_gym
  ON public.coach_assignments(gym_id) WHERE gym_id IS NOT NULL;

ALTER TABLE public.coach_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_assignments FROM anon, authenticated;

-- One open row for every client who already has a coach. started_at is the
-- client's account creation — the best "since" we have for existing links.
INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, source, started_at)
SELECT u.id, u.coach_id, u.gym_id, 'backfill', COALESCE(u.created_at, now())
FROM public.users u
WHERE u.role = 'client'
  AND u.coach_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.coach_assignments a
    WHERE a.client_id = u.id AND a.ended_at IS NULL
  );


-- ------------------------------------------
-- 6. link_coach_and_enter_transaction — inherit the coach's gym
-- ------------------------------------------
-- Same as sql/link_coach_and_enter_transaction.sql, plus:
--   * the client's gym_id follows the coach's ACTIVE gym (a pending coach,
--     or an independent one, gives NULL — joining an independent coach
--     takes the client out of their old gym);
--   * on a coach change, closes the open coach_assignments row and opens a
--     new one (source 'invite_code'); a same-coach renewal leaves it alone;
--   * the response gains 'gym_id'.
-- Keep sql/link_coach_and_enter_transaction.sql in sync if either changes.
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
  v_coach_gym_id UUID;
  v_client_email TEXT;
  v_client_name TEXT;
  v_prev_coach_id UUID;
  v_is_new BOOLEAN;
  v_validation_time TIMESTAMPTZ;
  v_response JSONB;
BEGIN
  p_invite_code := trim(upper(p_invite_code));
  v_validation_time := now();

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

  -- The coach's gym only counts once the owner approved them AND the gym
  -- itself is active.
  SELECT u.role, u.email, c.status,
         CASE WHEN u.gym_status = 'active' AND g.status = 'active' THEN u.gym_id END
  INTO v_coach_role, v_coach_email, v_coach_status, v_coach_gym_id
  FROM public.users u
  LEFT JOIN public.coaches c ON c.user_id = u.id
  LEFT JOIN public.gyms g ON g.id = u.gym_id
  WHERE u.id = v_coach_id;

  IF v_coach_email IS NULL OR NOT (
    v_coach_role IN ('coach', 'super-admin', 'admin') OR
    v_coach_status = 'approved' OR
    lower(v_coach_email) = 'subodhmankala@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Invitation belongs to an inactive or invalid coach.';
  END IF;

  SELECT email, NULLIF(full_name, 'Warrior'), coach_id
  INTO v_client_email, v_client_name, v_prev_coach_id
  FROM public.users
  WHERE id = p_client_id;

  v_is_new := (v_prev_coach_id IS DISTINCT FROM v_coach_id);

  IF v_client_name IS NULL AND v_client_email IS NOT NULL THEN
    SELECT NULLIF(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'), 'Warrior')
    INTO v_client_name
    FROM auth.users
    WHERE lower(email) = lower(v_client_email)
    LIMIT 1;
  END IF;

  v_client_email := COALESCE(v_client_email, 'client_' || p_client_id || '@fitengineers.com');

  INSERT INTO public.users (id, email, role, coach_id, verified, full_name, payment_status, gym_id, gym_status)
  VALUES (p_client_id, v_client_email, 'client', v_coach_id, true, v_client_name, 'active',
          v_coach_gym_id, CASE WHEN v_coach_gym_id IS NOT NULL THEN 'active' END)
  ON CONFLICT (id) DO UPDATE
  SET role = 'client',
      coach_id = v_coach_id,
      verified = true,
      payment_status = 'active',
      full_name = COALESCE(NULLIF(public.users.full_name, 'Warrior'), v_client_name),
      gym_id = v_coach_gym_id,
      gym_status = CASE WHEN v_coach_gym_id IS NOT NULL THEN 'active' END;

  INSERT INTO public.clients (user_id, coach_id, full_name)
  VALUES (p_client_id, v_coach_id, v_client_name)
  ON CONFLICT (user_id) DO UPDATE
  SET coach_id = v_coach_id,
      full_name = COALESCE(NULLIF(public.clients.full_name, 'Warrior'), v_client_name);

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coach_clients' AND table_schema = 'public') THEN
    INSERT INTO public.coach_clients (coach_id, client_id, status)
    VALUES (v_coach_id, p_client_id, 'active')
    ON CONFLICT (coach_id, client_id) DO UPDATE
    SET status = 'active';
  END IF;

  -- Coaching history. A same-coach renewal keeps the existing open row;
  -- a missing open row (e.g. pre-backfill client) is always opened.
  IF v_is_new OR NOT EXISTS (
    SELECT 1 FROM public.coach_assignments
    WHERE client_id = p_client_id AND ended_at IS NULL
  ) THEN
    UPDATE public.coach_assignments
    SET ended_at = v_validation_time
    WHERE client_id = p_client_id AND ended_at IS NULL;

    INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at)
    VALUES (p_client_id, v_coach_id, v_coach_gym_id, NULL, 'invite_code', v_validation_time);
  END IF;

  UPDATE public.invitations
  SET used = true,
      used_at = now(),
      used_by = p_client_id
  WHERE id = v_invite_id;

  INSERT INTO public.notifications (recipient_user_id, type, actor_user_id, payload)
  VALUES (
    v_coach_id,
    'client_connected',
    p_client_id,
    jsonb_build_object(
      'client_name', v_client_name,
      'client_email', v_client_email,
      'invite_code', p_invite_code,
      'is_new', v_is_new
    )
  );

  IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE id = v_invite_id AND used = true) THEN
    RAISE EXCEPTION 'Verification failed: invitation not marked used.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_client_id AND coach_id = v_coach_id) THEN
    RAISE EXCEPTION 'Verification failed: client profile not created/updated.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_client_id AND role = 'client' AND coach_id = v_coach_id AND payment_status = 'active') THEN
    RAISE EXCEPTION 'Verification failed: user role or coach ID not updated.';
  END IF;

  v_response := jsonb_build_object(
    'success', true,
    'coach_id', v_coach_id,
    'client_id', p_client_id,
    'gym_id', v_coach_gym_id,
    'is_new', v_is_new,
    'code_used', p_invite_code,
    'expires_at', v_expires_at,
    'validation_time', v_validation_time
  );

  RETURN v_response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;
