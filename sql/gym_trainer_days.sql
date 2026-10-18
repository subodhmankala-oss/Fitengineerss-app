-- ==========================================
-- GYM SITE — trainer days in + member high-fives
--
-- STATUS: NOT YET APPLIED. Additive.
-- Rollback: sql/rollback_gym_trainer_days.sql
--
-- Light-touch attendance (user decision 2026-10-18: "they should be more free
-- when they use our app"): a trainer's day counts as IN the first time they
-- open the coach app that day — nothing to tap, no times, no late flags.
-- The trainer can mark a day off themselves; the owner can mark a day in/off
-- or clear it. No approvals.
--
--   gym_trainer_days  one row per trainer per India-time day: 'in' or 'off'
--   gym_high_fives    a member's one-a-day thumbs-up for their trainer
--                     (positive only — never a rating)
--
-- RLS on, no policies (service-role API only). Functions take the VERIFIED
-- caller's users.id; EXECUTE revoked from anon/authenticated.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.gym_trainer_days (
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  trainer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  status     text NOT NULL CHECK (status IN ('in', 'off')),
  source     text NOT NULL CHECK (source IN ('auto', 'trainer', 'owner')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, trainer_id, day)
);

CREATE TABLE IF NOT EXISTS public.gym_high_fives (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  member_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, trainer_id, day)
);
CREATE INDEX IF NOT EXISTS gym_high_fives_trainer_idx ON public.gym_high_fives (trainer_id, day DESC);
CREATE INDEX IF NOT EXISTS gym_high_fives_gym_idx ON public.gym_high_fives (gym_id, day DESC);

ALTER TABLE public.gym_trainer_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_high_fives   ENABLE ROW LEVEL SECURITY;

-- The trainer opened the coach app: count today as in (unless they already
-- marked it off). Quietly does nothing for anyone not training in an active gym.
CREATE OR REPLACE FUNCTION public.gym_trainer_touch(p_trainer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid;
BEGIN
  SELECT u.gym_id INTO v_gym
  FROM public.users u JOIN public.gyms g ON g.id = u.gym_id
  WHERE u.id = p_trainer_id AND u.role <> 'client' AND g.status = 'active';
  IF v_gym IS NULL THEN RETURN jsonb_build_object('success', true, 'counted', false); END IF;
  INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source)
  VALUES (v_gym, p_trainer_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'in', 'auto')
  ON CONFLICT (gym_id, trainer_id, day) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'counted', true);
END;
$function$;

-- The trainer marks TODAY off (p_off) or back in.
CREATE OR REPLACE FUNCTION public.gym_trainer_set_today(p_trainer_id uuid, p_off boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid;
BEGIN
  SELECT u.gym_id INTO v_gym
  FROM public.users u JOIN public.gyms g ON g.id = u.gym_id
  WHERE u.id = p_trainer_id AND u.role <> 'client' AND g.status = 'active';
  IF v_gym IS NULL THEN RAISE EXCEPTION 'You aren’t training at a gym.'; END IF;
  INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source, updated_at)
  VALUES (v_gym, p_trainer_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, CASE WHEN p_off THEN 'off' ELSE 'in' END, 'trainer', now())
  ON CONFLICT (gym_id, trainer_id, day) DO UPDATE SET status = EXCLUDED.status, source = 'trainer', updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- The owner marks any day for one of their trainers: 'in', 'off', or NULL to clear.
CREATE OR REPLACE FUNCTION public.gym_owner_mark_day(p_owner_id uuid, p_trainer_id uuid, p_day date, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_trainer_id AND gym_id = v_gym AND role <> 'client') THEN
    RAISE EXCEPTION 'That trainer isn’t in your gym.';
  END IF;
  IF p_day IS NULL OR p_day > (now() AT TIME ZONE 'Asia/Kolkata')::date + 60 THEN
    RAISE EXCEPTION 'Pick a valid day.';
  END IF;
  IF p_status IS NULL THEN
    DELETE FROM public.gym_trainer_days WHERE gym_id = v_gym AND trainer_id = p_trainer_id AND day = p_day;
  ELSIF p_status IN ('in', 'off') THEN
    INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source, updated_at)
    VALUES (v_gym, p_trainer_id, p_day, p_status, 'owner', now())
    ON CONFLICT (gym_id, trainer_id, day) DO UPDATE SET status = EXCLUDED.status, source = 'owner', updated_at = now();
  ELSE
    RAISE EXCEPTION 'Unknown day status.';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- A member high-fives their own trainer, at most once a day.
CREATE OR REPLACE FUNCTION public.gym_high_five(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid;
  v_coach uuid;
BEGIN
  SELECT u.gym_id, u.coach_id INTO v_gym, v_coach
  FROM public.users u JOIN public.gyms g ON g.id = u.gym_id
  WHERE u.id = p_member_id AND u.role = 'client' AND g.status = 'active';
  IF v_gym IS NULL OR v_coach IS NULL THEN RAISE EXCEPTION 'You don’t have a gym trainer yet.'; END IF;
  INSERT INTO public.gym_high_fives (gym_id, member_id, trainer_id, day)
  VALUES (v_gym, p_member_id, v_coach, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ON CONFLICT (member_id, trainer_id, day) DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_trainer_touch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_trainer_set_today(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_owner_mark_day(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_high_five(uuid) FROM PUBLIC, anon, authenticated;
