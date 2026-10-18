-- ==========================================
-- GYM SITE — stage 3: leads, live check-ins, trainer payday
--
-- STATUS: NOT YET APPLIED. Additive on top of sql/gym_business.sql.
-- Same rules: RLS on with no policies (service-role API only), functions take
-- the VERIFIED caller as p_owner_id, EXECUTE revoked from anon/authenticated.
-- Rollback: sql/rollback_gym_business_2.sql
--
--   gym_leads            enquiry → trial booked → trial done → joined
--   gym_checkins         who is in the gym now (owner checks people in/out)
--   gym_trainer_payouts  a trainer's monthly payout once marked paid
--   gym_settings         + monthly joins goal, gym capacity, trainer share %
--   gym_memberships      + is_pt (plan with sessions) so PT fees can be split
-- ==========================================

ALTER TABLE public.gym_memberships ADD COLUMN IF NOT EXISTS is_pt boolean NOT NULL DEFAULT false;
ALTER TABLE public.gym_settings ADD COLUMN IF NOT EXISTS join_goal integer NOT NULL DEFAULT 20 CHECK (join_goal BETWEEN 1 AND 100000);
ALTER TABLE public.gym_settings ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 60 CHECK (capacity BETWEEN 1 AND 100000);
ALTER TABLE public.gym_settings ADD COLUMN IF NOT EXISTS trainer_share_pct integer NOT NULL DEFAULT 70 CHECK (trainer_share_pct BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS public.gym_leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  phone      text CHECK (phone IS NULL OR length(phone) <= 20),
  source     text NOT NULL DEFAULT 'walk-in' CHECK (source IN ('instagram', 'walk-in', 'referral', 'google', 'other')),
  note       text CHECK (note IS NULL OR length(note) <= 200),
  stage      text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'trial_booked', 'trial_done', 'joined')),
  trial_at   timestamptz,
  joined_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_leads_gym_idx ON public.gym_leads (gym_id, stage);

CREATE TABLE IF NOT EXISTS public.gym_checkins (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id    uuid NOT NULL REFERENCES public.gyms(id),
  member_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  in_at     timestamptz NOT NULL DEFAULT now(),
  out_at    timestamptz
);
CREATE INDEX IF NOT EXISTS gym_checkins_gym_idx ON public.gym_checkins (gym_id, in_at DESC);

CREATE TABLE IF NOT EXISTS public.gym_trainer_payouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  trainer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month      date NOT NULL CHECK (EXTRACT(day FROM month) = 1),
  amount_inr integer NOT NULL CHECK (amount_inr >= 0),
  paid_on    date NOT NULL,
  UNIQUE (gym_id, trainer_id, month)
);

ALTER TABLE public.gym_leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_checkins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_trainer_payouts  ENABLE ROW LEVEL SECURITY;

-- Mark plans with sessions as PT when a membership starts.
CREATE OR REPLACE FUNCTION public.gym_start_membership(
  p_owner_id uuid, p_member_id uuid, p_plan_id uuid, p_paid_inr integer, p_method text, p_paid_on date
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_plan public.gym_plans%ROWTYPE;
  v_current date;
  v_start date;
  v_id uuid;
  v_paid_on date := COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_member_id AND gym_id = v_gym AND role = 'client') THEN
    RAISE EXCEPTION 'That member isn’t in your gym.';
  END IF;
  SELECT * INTO v_plan FROM public.gym_plans WHERE id = p_plan_id AND gym_id = v_gym AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick one of your plans.'; END IF;
  IF COALESCE(p_paid_inr, 0) < 0 OR COALESCE(p_paid_inr, 0) > v_plan.price_inr THEN
    RAISE EXCEPTION 'Amount paid can’t be more than the plan price.';
  END IF;

  SELECT max(ends_on) INTO v_current FROM public.gym_memberships WHERE member_id = p_member_id AND gym_id = v_gym;
  v_start := GREATEST(v_paid_on, COALESCE(v_current + 1, v_paid_on));
  INSERT INTO public.gym_memberships (gym_id, member_id, plan_id, plan_name, starts_on, ends_on, price_inr, is_pt)
  VALUES (v_gym, p_member_id, v_plan.id, v_plan.name, v_start, (v_start + (v_plan.months || ' months')::interval)::date - 1, v_plan.price_inr, v_plan.sessions IS NOT NULL)
  RETURNING id INTO v_id;

  IF COALESCE(p_paid_inr, 0) > 0 THEN
    INSERT INTO public.gym_payments (gym_id, member_id, membership_id, amount_inr, method, paid_on)
    VALUES (v_gym, p_member_id, v_id, p_paid_inr, COALESCE(NULLIF(p_method, ''), 'upi'), v_paid_on);
  END IF;
  RETURN jsonb_build_object('success', true, 'membershipId', v_id);
END;
$function$;

-- Settings now also carry the joins goal, capacity and the trainer share.
DROP FUNCTION IF EXISTS public.gym_save_settings(uuid, text, boolean, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.gym_save_settings(
  p_owner_id uuid, p_color text, p_renewal boolean, p_miss boolean, p_receipt boolean, p_birthday boolean,
  p_join_goal integer, p_capacity integer, p_share_pct integer
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  INSERT INTO public.gym_settings (gym_id, brand_color, wa_renewal, wa_miss, wa_receipt, wa_birthday, join_goal, capacity, trainer_share_pct, updated_at)
  VALUES (v_gym, p_color, p_renewal, p_miss, p_receipt, p_birthday, p_join_goal, p_capacity, p_share_pct, now())
  ON CONFLICT (gym_id) DO UPDATE SET
    brand_color = EXCLUDED.brand_color, wa_renewal = EXCLUDED.wa_renewal, wa_miss = EXCLUDED.wa_miss,
    wa_receipt = EXCLUDED.wa_receipt, wa_birthday = EXCLUDED.wa_birthday, join_goal = EXCLUDED.join_goal,
    capacity = EXCLUDED.capacity, trainer_share_pct = EXCLUDED.trainer_share_pct, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Leads. p_op: 'add' | 'move' | 'delete'.
--   add:    p_name, p_phone, p_source, p_note (+ optional p_trial_at)
--   move:   p_lead_id, p_stage (+ p_trial_at when booking a trial)
--   delete: p_lead_id
CREATE OR REPLACE FUNCTION public.gym_lead_action(
  p_owner_id uuid, p_op text, p_lead_id uuid, p_name text, p_phone text, p_source text, p_note text, p_stage text, p_trial_at timestamptz
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  IF p_op = 'add' THEN
    INSERT INTO public.gym_leads (gym_id, name, phone, source, note, trial_at, stage)
    VALUES (v_gym, btrim(p_name), NULLIF(btrim(p_phone), ''), COALESCE(NULLIF(p_source, ''), 'walk-in'), NULLIF(btrim(p_note), ''), p_trial_at,
            CASE WHEN p_trial_at IS NOT NULL THEN 'trial_booked' ELSE 'new' END);
  ELSIF p_op = 'move' THEN
    UPDATE public.gym_leads SET
      stage = p_stage,
      trial_at = CASE WHEN p_stage = 'trial_booked' THEN COALESCE(p_trial_at, trial_at) WHEN p_stage = 'new' THEN NULL ELSE trial_at END,
      joined_at = CASE WHEN p_stage = 'joined' THEN COALESCE(joined_at, now()) ELSE NULL END
    WHERE id = p_lead_id AND gym_id = v_gym;
    IF NOT FOUND THEN RAISE EXCEPTION 'That lead isn’t in your gym.'; END IF;
  ELSIF p_op = 'delete' THEN
    DELETE FROM public.gym_leads WHERE id = p_lead_id AND gym_id = v_gym;
  ELSE
    RAISE EXCEPTION 'Unknown lead action.';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Check a member in (no-op if already inside) or out. Anyone still "inside"
-- after 6 hours is treated as gone when counting who is in now.
CREATE OR REPLACE FUNCTION public.gym_checkin(p_owner_id uuid, p_member_id uuid, p_out boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_member_id AND gym_id = v_gym AND role = 'client') THEN
    RAISE EXCEPTION 'That member isn’t in your gym.';
  END IF;
  IF p_out THEN
    UPDATE public.gym_checkins SET out_at = now() WHERE gym_id = v_gym AND member_id = p_member_id AND out_at IS NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.gym_checkins WHERE gym_id = v_gym AND member_id = p_member_id AND out_at IS NULL AND in_at > now() - interval '6 hours'
  ) THEN
    UPDATE public.gym_checkins SET out_at = now() WHERE gym_id = v_gym AND member_id = p_member_id AND out_at IS NULL;
    INSERT INTO public.gym_checkins (gym_id, member_id) VALUES (v_gym, p_member_id);
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Mark a trainer's month paid (p_paid) with the amount shown, or undo it.
CREATE OR REPLACE FUNCTION public.gym_trainer_payout(p_owner_id uuid, p_trainer_id uuid, p_month date, p_amount_inr integer, p_paid boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_trainer_id AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'That trainer isn’t in your gym.';
  END IF;
  IF p_paid THEN
    INSERT INTO public.gym_trainer_payouts (gym_id, trainer_id, month, amount_inr, paid_on)
    VALUES (v_gym, p_trainer_id, v_month, GREATEST(COALESCE(p_amount_inr, 0), 0), (now() AT TIME ZONE 'Asia/Kolkata')::date)
    ON CONFLICT (gym_id, trainer_id, month) DO NOTHING;
  ELSE
    DELETE FROM public.gym_trainer_payouts WHERE gym_id = v_gym AND trainer_id = p_trainer_id AND month = v_month;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_start_membership(uuid, uuid, uuid, integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_save_settings(uuid, text, boolean, boolean, boolean, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_checkin(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_trainer_payout(uuid, uuid, date, integer, boolean) FROM PUBLIC, anon, authenticated;
