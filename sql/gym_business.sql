-- ==========================================
-- GYM SITE — stage 2: plans, memberships, payments, settings
--
-- STATUS: NOT YET APPLIED.
-- Purely additive: four new tables (RLS on, no policies → service-role API
-- only, like gyms) and functions called only from api/admin-write.js with the
-- VERIFIED caller as p_owner_id; EXECUTE revoked from anon/authenticated.
-- Rollback: sql/rollback_gym_business.sql
--
--   gym_plans        what the gym sells (Monthly, Quarterly, …) — price in ₹
--   gym_memberships  one row per plan a member bought; the newest is current
--   gym_payments     money received, optionally against a membership
--   gym_settings     gym colour + which automatic WhatsApp messages are on
--
-- A membership is "due" while the payments against it add up to less than
-- its price. Members leaving (users deleted) take their rows with them.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.gym_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  months     integer NOT NULL CHECK (months BETWEEN 1 AND 36),
  sessions   integer CHECK (sessions IS NULL OR sessions BETWEEN 1 AND 1000),
  price_inr  integer NOT NULL CHECK (price_inr BETWEEN 0 AND 10000000),
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_plans_gym_idx ON public.gym_plans (gym_id);

CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  member_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id    uuid REFERENCES public.gym_plans(id),
  plan_name  text NOT NULL,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL CHECK (ends_on >= starts_on),
  price_inr  integer NOT NULL CHECK (price_inr >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_memberships_gym_idx ON public.gym_memberships (gym_id, ends_on);
CREATE INDEX IF NOT EXISTS gym_memberships_member_idx ON public.gym_memberships (member_id, ends_on DESC);

CREATE TABLE IF NOT EXISTS public.gym_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        uuid NOT NULL REFERENCES public.gyms(id),
  member_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.gym_memberships(id) ON DELETE SET NULL,
  amount_inr    integer NOT NULL CHECK (amount_inr > 0),
  method        text NOT NULL DEFAULT 'upi' CHECK (method IN ('upi', 'cash', 'card', 'other')),
  paid_on       date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_payments_gym_idx ON public.gym_payments (gym_id, paid_on DESC);

CREATE TABLE IF NOT EXISTS public.gym_settings (
  gym_id      uuid PRIMARY KEY REFERENCES public.gyms(id),
  brand_color text NOT NULL DEFAULT 'blue' CHECK (brand_color IN ('blue', 'teal', 'green', 'orange', 'pink')),
  wa_renewal  boolean NOT NULL DEFAULT true,
  wa_miss     boolean NOT NULL DEFAULT true,
  wa_receipt  boolean NOT NULL DEFAULT true,
  wa_birthday boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gym_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_settings    ENABLE ROW LEVEL SECURITY;

-- Default plans for a gym that has none yet.
CREATE OR REPLACE FUNCTION public.gym_seed_default_plans(p_gym_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  INSERT INTO public.gym_plans (gym_id, name, months, sessions, price_inr, sort_order)
  SELECT p_gym_id, v.name, v.months, v.sessions, v.price, v.ord
  FROM (VALUES
    ('Monthly', 1, NULL::int, 3000, 1),
    ('Quarterly', 3, NULL::int, 8400, 2),
    ('Half-yearly', 6, NULL::int, 15000, 3),
    ('PT · 12 sessions', 3, 12, 9000, 4)
  ) AS v(name, months, sessions, price, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.gym_plans WHERE gym_id = p_gym_id);
$function$;

CREATE OR REPLACE FUNCTION public.gym_seed_plans_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  PERFORM public.gym_seed_default_plans(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS gym_seed_plans ON public.gyms;
CREATE TRIGGER gym_seed_plans AFTER INSERT ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.gym_seed_plans_trigger();

SELECT public.gym_seed_default_plans(id) FROM public.gyms;

-- Resolves the ACTIVE gym a verified caller owns, or raises.
CREATE OR REPLACE FUNCTION public.gym_owned_by(p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid;
  v_status text;
BEGIN
  SELECT id, status INTO v_gym, v_status FROM public.gyms WHERE owner_id = p_owner_id ORDER BY created_at LIMIT 1;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'You don’t own a gym.'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'This gym is suspended.'; END IF;
  RETURN v_gym;
END;
$function$;

-- Start a plan for a member. p_paid_inr = how much they paid now (0 = not yet,
-- so it shows as "Payment due"). A plan bought while another is still running
-- starts the day the running one ends.
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
  INSERT INTO public.gym_memberships (gym_id, member_id, plan_id, plan_name, starts_on, ends_on, price_inr)
  VALUES (v_gym, p_member_id, v_plan.id, v_plan.name, v_start, (v_start + (v_plan.months || ' months')::interval)::date - 1, v_plan.price_inr)
  RETURNING id INTO v_id;

  IF COALESCE(p_paid_inr, 0) > 0 THEN
    INSERT INTO public.gym_payments (gym_id, member_id, membership_id, amount_inr, method, paid_on)
    VALUES (v_gym, p_member_id, v_id, p_paid_inr, COALESCE(NULLIF(p_method, ''), 'upi'), v_paid_on);
  END IF;
  RETURN jsonb_build_object('success', true, 'membershipId', v_id);
END;
$function$;

-- Record a payment against a membership (settling a due amount).
CREATE OR REPLACE FUNCTION public.gym_pay_membership(
  p_owner_id uuid, p_membership_id uuid, p_amount_inr integer, p_method text, p_paid_on date
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_m public.gym_memberships%ROWTYPE;
  v_paid integer;
BEGIN
  SELECT * INTO v_m FROM public.gym_memberships WHERE id = p_membership_id AND gym_id = v_gym;
  IF NOT FOUND THEN RAISE EXCEPTION 'That membership isn’t in your gym.'; END IF;
  SELECT COALESCE(sum(amount_inr), 0) INTO v_paid FROM public.gym_payments WHERE membership_id = v_m.id;
  IF COALESCE(p_amount_inr, 0) <= 0 OR p_amount_inr > v_m.price_inr - v_paid THEN
    RAISE EXCEPTION 'Enter an amount between ₹1 and what is still due (₹%).', v_m.price_inr - v_paid;
  END IF;
  INSERT INTO public.gym_payments (gym_id, member_id, membership_id, amount_inr, method, paid_on)
  VALUES (v_gym, v_m.member_id, v_m.id, p_amount_inr, COALESCE(NULLIF(p_method, ''), 'upi'), COALESCE(p_paid_on, (now() AT TIME ZONE 'Asia/Kolkata')::date));
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Replace the gym's plan list. Plans the owner removes are switched off (not
-- deleted) so past memberships keep their plan name.
CREATE OR REPLACE FUNCTION public.gym_save_plans(p_owner_id uuid, p_plans jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_item jsonb;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_ord integer := 0;
BEGIN
  IF jsonb_typeof(p_plans) <> 'array' OR jsonb_array_length(p_plans) > 20 THEN
    RAISE EXCEPTION 'Send a list of up to 20 plans.';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_plans) LOOP
    v_ord := v_ord + 1;
    v_id := NULLIF(v_item->>'id', '')::uuid;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.gym_plans WHERE id = v_id AND gym_id = v_gym) THEN
      UPDATE public.gym_plans SET
        name = btrim(v_item->>'name'), months = (v_item->>'months')::int,
        sessions = NULLIF(v_item->>'sessions', '')::int, price_inr = (v_item->>'priceInr')::int,
        sort_order = v_ord, active = true
      WHERE id = v_id;
    ELSE
      INSERT INTO public.gym_plans (gym_id, name, months, sessions, price_inr, sort_order)
      VALUES (v_gym, btrim(v_item->>'name'), (v_item->>'months')::int, NULLIF(v_item->>'sessions', '')::int, (v_item->>'priceInr')::int, v_ord)
      RETURNING id INTO v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;
  UPDATE public.gym_plans SET active = false WHERE gym_id = v_gym AND NOT (id = ANY (v_keep));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gym_save_settings(
  p_owner_id uuid, p_color text, p_renewal boolean, p_miss boolean, p_receipt boolean, p_birthday boolean
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  INSERT INTO public.gym_settings (gym_id, brand_color, wa_renewal, wa_miss, wa_receipt, wa_birthday, updated_at)
  VALUES (v_gym, p_color, p_renewal, p_miss, p_receipt, p_birthday, now())
  ON CONFLICT (gym_id) DO UPDATE SET
    brand_color = EXCLUDED.brand_color, wa_renewal = EXCLUDED.wa_renewal, wa_miss = EXCLUDED.wa_miss,
    wa_receipt = EXCLUDED.wa_receipt, wa_birthday = EXCLUDED.wa_birthday, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_seed_default_plans(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_seed_plans_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_owned_by(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_start_membership(uuid, uuid, uuid, integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_pay_membership(uuid, uuid, integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_save_plans(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_save_settings(uuid, text, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
