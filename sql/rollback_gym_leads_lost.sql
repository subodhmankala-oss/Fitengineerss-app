-- Rollback for sql/gym_leads_lost.sql. Lost leads are put back to 'new' first so
-- the old stage CHECK holds; the lost reason and follow-up dates are dropped.
UPDATE public.gym_leads SET stage = 'new', lost_reason = NULL WHERE stage = 'lost';

ALTER TABLE public.gym_leads DROP CONSTRAINT IF EXISTS gym_leads_lost_matches_reason;
ALTER TABLE public.gym_leads DROP CONSTRAINT IF EXISTS gym_leads_lost_reason_check;
ALTER TABLE public.gym_leads DROP CONSTRAINT IF EXISTS gym_leads_stage_check;
ALTER TABLE public.gym_leads ADD CONSTRAINT gym_leads_stage_check CHECK (stage IN ('new', 'trial_booked', 'trial_done', 'joined'));

DROP INDEX IF EXISTS public.gym_leads_follow_up_idx;
ALTER TABLE public.gym_leads DROP COLUMN IF EXISTS follow_up_on;
ALTER TABLE public.gym_leads DROP COLUMN IF EXISTS lost_at;
ALTER TABLE public.gym_leads DROP COLUMN IF EXISTS lost_reason;

DROP FUNCTION IF EXISTS public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz, text, date);

-- The original function, as in sql/gym_business_2.sql.
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
REVOKE EXECUTE ON FUNCTION public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
