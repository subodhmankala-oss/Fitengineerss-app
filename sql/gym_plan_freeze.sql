-- ==========================================
-- GYM SITE — freeze a member's plan (travel, illness, exams…)
--
-- STATUS: NOT YET APPLIED.
-- Purely additive: one new table (RLS on, no policies → service-role API
-- only, like the other gym tables) and two functions called only from
-- api/admin-write.js with the VERIFIED caller as p_owner_id; EXECUTE revoked
-- from anon/authenticated. Rollback: sql/rollback_gym_plan_freeze.sql
--
-- A freeze covers starts_on..ends_on (both days included). Freezing moves the
-- member's current plan end date — and any renewal already queued after it —
-- forward by the frozen days, so every "ends soon / ended" list keeps working
-- off gym_memberships.ends_on with no extra maths. Ending a freeze early gives
-- the unused days back (moves those dates back again).
-- ==========================================

CREATE TABLE IF NOT EXISTS public.gym_plan_freezes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        uuid NOT NULL REFERENCES public.gyms(id),
  member_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.gym_memberships(id) ON DELETE SET NULL,
  starts_on     date NOT NULL,
  ends_on       date NOT NULL CHECK (ends_on >= starts_on),
  reason        text CHECK (reason IS NULL OR reason IN ('travel', 'illness', 'injury', 'exams', 'other')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_plan_freezes_gym_idx ON public.gym_plan_freezes (gym_id, ends_on DESC);
CREATE INDEX IF NOT EXISTS gym_plan_freezes_member_idx ON public.gym_plan_freezes (member_id, ends_on DESC);
ALTER TABLE public.gym_plan_freezes ENABLE ROW LEVEL SECURITY;

-- Freeze a member's running plan for p_days (1–90) from p_starts_on (default
-- today, India time). The plan must still be running on that day, and the
-- member can't already have a freeze that is running or still to come.
CREATE OR REPLACE FUNCTION public.gym_freeze_membership(
  p_owner_id uuid, p_member_id uuid, p_days integer, p_reason text, p_starts_on date
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := COALESCE(p_starts_on, v_today);
  v_m public.gym_memberships%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN RAISE EXCEPTION 'Freeze for 1 to 90 days.'; END IF;
  IF v_start < v_today OR v_start > v_today + 60 THEN RAISE EXCEPTION 'Start the freeze today or within the next 60 days.'; END IF;
  IF p_reason IS NOT NULL AND p_reason NOT IN ('travel', 'illness', 'injury', 'exams', 'other') THEN
    RAISE EXCEPTION 'Pick a reason from the list.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_member_id AND gym_id = v_gym AND role = 'client') THEN
    RAISE EXCEPTION 'That member isn’t in your gym.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gym_plan_freezes WHERE member_id = p_member_id AND gym_id = v_gym AND ends_on >= v_today) THEN
    RAISE EXCEPTION 'This member already has a freeze. End it first.';
  END IF;

  -- The plan running on the freeze's first day.
  SELECT * INTO v_m FROM public.gym_memberships
   WHERE member_id = p_member_id AND gym_id = v_gym AND starts_on <= v_start AND ends_on >= v_start
   ORDER BY ends_on DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'There’s no plan running on that day to freeze.'; END IF;

  -- Push this plan, and any renewal queued after it, forward.
  UPDATE public.gym_memberships SET
    starts_on = CASE WHEN id = v_m.id THEN starts_on ELSE starts_on + p_days END,
    ends_on = ends_on + p_days
  WHERE member_id = p_member_id AND gym_id = v_gym AND (id = v_m.id OR starts_on > v_m.ends_on);

  INSERT INTO public.gym_plan_freezes (gym_id, member_id, membership_id, starts_on, ends_on, reason)
  VALUES (v_gym, p_member_id, v_m.id, v_start, v_start + p_days - 1, NULLIF(p_reason, ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'freezeId', v_id, 'endsOn', v_m.ends_on + p_days);
END;
$function$;

-- End a freeze early: the member is back from today. Days not used are taken
-- off the plan end date again. A freeze that hasn't started yet is cancelled.
CREATE OR REPLACE FUNCTION public.gym_end_freeze(p_owner_id uuid, p_freeze_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_f public.gym_plan_freezes%ROWTYPE;
  v_m public.gym_memberships%ROWTYPE;
  v_unused integer;
BEGIN
  SELECT * INTO v_f FROM public.gym_plan_freezes WHERE id = p_freeze_id AND gym_id = v_gym;
  IF NOT FOUND THEN RAISE EXCEPTION 'That freeze isn’t in your gym.'; END IF;
  IF v_f.ends_on < v_today THEN RAISE EXCEPTION 'This freeze has already ended.'; END IF;

  -- Days from today (or the freeze start, if later) to the last frozen day.
  v_unused := v_f.ends_on - GREATEST(v_today, v_f.starts_on) + 1;

  SELECT * INTO v_m FROM public.gym_memberships WHERE id = v_f.membership_id;
  IF FOUND THEN
    UPDATE public.gym_memberships SET
      starts_on = CASE WHEN id = v_m.id THEN starts_on ELSE starts_on - v_unused END,
      ends_on = GREATEST(starts_on, ends_on - v_unused)
    WHERE member_id = v_f.member_id AND gym_id = v_gym AND (id = v_m.id OR starts_on > v_m.ends_on);
  END IF;

  IF v_f.starts_on >= v_today THEN
    DELETE FROM public.gym_plan_freezes WHERE id = v_f.id;
  ELSE
    UPDATE public.gym_plan_freezes SET ends_on = v_today - 1 WHERE id = v_f.id;
  END IF;
  RETURN jsonb_build_object('success', true, 'daysBack', v_unused);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_freeze_membership(uuid, uuid, integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_end_freeze(uuid, uuid) FROM PUBLIC, anon, authenticated;
