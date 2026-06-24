-- ==========================================
-- FITENGINEERS DB SCHEMA & TRANSACTION PROCEDURES
-- Paste this script into the Supabase SQL Editor.
-- ==========================================

-- 1. Create coaches table
CREATE TABLE IF NOT EXISTS public.coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  brand_name TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  full_name TEXT,
  phone_number TEXT,
  fitness_goal TEXT,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  age INTEGER,
  activity_level TEXT,
  dietary_preference TEXT,
  calorie_target INTEGER,
  protein_target INTEGER,
  carbs_target INTEGER,
  fats_target INTEGER,
  issue TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  coach_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);
CREATE INDEX IF NOT EXISTS idx_clients_coach_id ON public.clients(coach_id);
CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON public.coaches(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Configure RLS Policies (Allow public access for rapid prototyping and validation)
DROP POLICY IF EXISTS "Allow public access on coaches" ON public.coaches;
CREATE POLICY "Allow public access on coaches" ON public.coaches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on clients" ON public.clients;
CREATE POLICY "Allow public access on clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on invitations" ON public.invitations;
CREATE POLICY "Allow public access on invitations" ON public.invitations FOR ALL USING (true) WITH CHECK (true);


-- 4. Create Atomic Transaction RPC Stored Procedure
CREATE OR REPLACE FUNCTION public.link_coach_and_enter_transaction(
  p_invite_code TEXT,
  p_client_id UUID
) RETURNS JSONB AS $$
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

  -- Get client email and name from auth.users (if it exists)
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
  INTO v_client_email, v_client_name
  FROM auth.users
  WHERE id = p_client_id;

  -- Fallback to public.users if not found in auth.users
  IF v_client_email IS NULL THEN
    SELECT email, full_name
    INTO v_client_email, v_client_name
    FROM public.users
    WHERE id = p_client_id;
  END IF;

  -- Fallbacks for defaults
  v_client_email := COALESCE(v_client_email, 'client_' || p_client_id || '@fitengineers.com');
  v_client_name := COALESCE(v_client_name, 'Warrior');

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
      full_name = COALESCE(v_client_name, public.users.full_name);

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
      full_name = COALESCE(v_client_name, public.clients.full_name);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
