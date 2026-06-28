-- =========================================================================
-- FITENGINEERS SCHEMAS UPDATE - CLIENT ONBOARDING & COACH CONNECTION REDESIGN
-- Paste this script into the Supabase SQL Editor to execute migrations.
-- =========================================================================

-- 1. Alter public.clients table to add program, primary_concern, onboarding_completed
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_concern TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- 2. Create public.invite_codes table
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.invite_codes(code);

-- Enable RLS and add public access policies for invite_codes
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on invite_codes" ON public.invite_codes;
CREATE POLICY "Allow public access on invite_codes" ON public.invite_codes FOR ALL USING (true) WITH CHECK (true);

-- 3. Create public.workout_templates table
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exercises JSONB NOT NULL, -- Array of {name, sets, reps, order}
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and add public access policies for workout_templates
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on workout_templates" ON public.workout_templates;
CREATE POLICY "Allow public access on workout_templates" ON public.workout_templates FOR ALL USING (true) WITH CHECK (true);

-- 4. Seed Default Workout Templates (Push day, Pull day, Leg day) if they don't exist
INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Push day', '[
  {"name": "Bench Press", "sets": 3, "reps": 10, "order": 1},
  {"name": "Overhead Press", "sets": 3, "reps": 10, "order": 2},
  {"name": "Triceps Pushdown", "sets": 3, "reps": 12, "order": 3},
  {"name": "Lateral Raise", "sets": 3, "reps": 15, "order": 4}
]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Push day');

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Pull day', '[
  {"name": "Pull-up", "sets": 3, "reps": 8, "order": 1},
  {"name": "Barbell Row", "sets": 3, "reps": 10, "order": 2},
  {"name": "Biceps Curl", "sets": 3, "reps": 12, "order": 3},
  {"name": "Face Pull", "sets": 3, "reps": 15, "order": 4}
]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Pull day');

INSERT INTO public.workout_templates (name, exercises, is_default)
SELECT 'Leg day', '[
  {"name": "Squat", "sets": 3, "reps": 10, "order": 1},
  {"name": "Romanian Deadlift", "sets": 3, "reps": 10, "order": 2},
  {"name": "Leg Press", "sets": 3, "reps": 12, "order": 3},
  {"name": "Calf Raise", "sets": 3, "reps": 15, "order": 4}
]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.workout_templates WHERE name = 'Leg day');

-- 5. Create atomic client-coach connection stored procedure
CREATE OR REPLACE FUNCTION public.link_client_to_coach_by_code(
  p_invite_code TEXT,
  p_client_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_invite_id UUID;
  v_coach_pk_id UUID;
  v_coach_user_id UUID;
  v_client_pk_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_used_by UUID;
BEGIN
  -- Normalize code comparison (uppercase + trim)
  p_invite_code := trim(upper(p_invite_code));

  -- 1. Look up invite code details
  SELECT id, coach_id, expires_at, used_by_client_id
  INTO v_invite_id, v_coach_pk_id, v_expires_at, v_used_by
  FROM public.invite_codes
  WHERE trim(upper(code)) = p_invite_code;

  -- 2. Validate availability and state
  IF v_invite_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found');
  END IF;

  IF v_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This code has expired');
  END IF;

  IF v_used_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This code has already been used');
  END IF;

  -- 3. Resolve public.clients.id from user_id
  SELECT id INTO v_client_pk_id
  FROM public.clients
  WHERE user_id = p_client_user_id;

  -- Auto-create clients row if not present
  IF v_client_pk_id IS NULL THEN
    INSERT INTO public.clients (user_id, coach_id, onboarding_completed)
    VALUES (p_client_user_id, NULL, false)
    RETURNING id INTO v_client_pk_id;
  END IF;

  -- 4. Get coach's user_id from public.coaches
  SELECT user_id INTO v_coach_user_id
  FROM public.coaches
  WHERE id = v_coach_pk_id;

  IF v_coach_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coach account not found');
  END IF;

  -- 5. Atomically update linked fields
  -- Update clients profile
  UPDATE public.clients
  SET coach_id = v_coach_user_id
  WHERE id = v_client_pk_id;

  -- Update users role mapping
  UPDATE public.users
  SET coach_id = v_coach_user_id
  WHERE id = p_client_user_id;

  -- Mark invitation code as claimed by this client
  UPDATE public.invite_codes
  SET used_by_client_id = v_client_pk_id
  WHERE id = v_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'coach_id', v_coach_user_id,
    'client_id', v_client_pk_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
