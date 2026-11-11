-- ==========================================
-- GYM SITE — leads: "Lost" stage, lost reason, follow-up date
-- NOT YET RUN. Paste into the Supabase SQL Editor when ready. Safe to re-run.
--
--   gym_leads.stage       gains 'lost' (CHECK constraint rewritten)
--   gym_leads.lost_reason too_expensive | joined_elsewhere | no_response | other
--                         (set exactly when stage = 'lost')
--   gym_leads.lost_at     when it was marked lost
--   gym_leads.follow_up_on  the day the owner wants to follow up (any open or
--                         lost lead); feeds "Follow up today" on Overview
--   gym_lead_action()     new optional args p_lost_reason, p_follow_up_on and a
--                         new op 'follow_up' (set or clear the date)
--
-- The app keeps working before this is applied: the new args are only sent
-- when the owner uses Lost or a follow-up date, and those report an error.
-- Rollback: sql/rollback_gym_leads_lost.sql
-- ==========================================

ALTER TABLE public.gym_leads ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.gym_leads ADD COLUMN IF NOT EXISTS lost_at timestamptz;
ALTER TABLE public.gym_leads ADD COLUMN IF NOT EXISTS follow_up_on date;

-- Drop the old stage CHECK (whatever it was named) and the ones from a previous run.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.gym_leads'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%trial_booked%' OR conname IN ('gym_leads_lost_reason_check', 'gym_leads_lost_matches_reason'))
  LOOP
    EXECUTE format('ALTER TABLE public.gym_leads DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.gym_leads ADD CONSTRAINT gym_leads_stage_check
  CHECK (stage IN ('new', 'trial_booked', 'trial_done', 'joined', 'lost'));
ALTER TABLE public.gym_leads ADD CONSTRAINT gym_leads_lost_reason_check
  CHECK (lost_reason IS NULL OR lost_reason IN ('too_expensive', 'joined_elsewhere', 'no_response', 'other'));
-- A lead has a lost reason exactly when it is lost.
ALTER TABLE public.gym_leads ADD CONSTRAINT gym_leads_lost_matches_reason
  CHECK ((stage = 'lost') = (lost_reason IS NOT NULL));

CREATE INDEX IF NOT EXISTS gym_leads_follow_up_idx ON public.gym_leads (gym_id, follow_up_on) WHERE follow_up_on IS NOT NULL;

-- Replace the old 9-argument function (a second overload would be ambiguous).
DROP FUNCTION IF EXISTS public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz);

-- Leads. p_op: 'add' | 'move' | 'follow_up' | 'delete'.
--   add:       p_name, p_phone, p_source, p_note (+ optional p_trial_at, p_follow_up_on)
--   move:      p_lead_id, p_stage (+ p_trial_at when booking a trial;
--              p_lost_reason required for 'lost'; p_follow_up_on optional)
--   follow_up: p_lead_id, p_follow_up_on (NULL clears it)
--   delete:    p_lead_id
CREATE OR REPLACE FUNCTION public.gym_lead_action(
  p_owner_id uuid, p_op text, p_lead_id uuid, p_name text, p_phone text, p_source text, p_note text, p_stage text, p_trial_at timestamptz,
  p_lost_reason text DEFAULT NULL, p_follow_up_on date DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  IF p_op = 'add' THEN
    INSERT INTO public.gym_leads (gym_id, name, phone, source, note, trial_at, follow_up_on, stage)
    VALUES (v_gym, btrim(p_name), NULLIF(btrim(p_phone), ''), COALESCE(NULLIF(p_source, ''), 'walk-in'), NULLIF(btrim(p_note), ''), p_trial_at, p_follow_up_on,
            CASE WHEN p_trial_at IS NOT NULL THEN 'trial_booked' ELSE 'new' END);
  ELSIF p_op = 'move' THEN
    IF p_stage = 'lost' AND (p_lost_reason IS NULL OR p_lost_reason NOT IN ('too_expensive', 'joined_elsewhere', 'no_response', 'other')) THEN
      RAISE EXCEPTION 'Pick why they did not join.';
    END IF;
    UPDATE public.gym_leads SET
      stage = p_stage,
      trial_at = CASE WHEN p_stage = 'trial_booked' THEN COALESCE(p_trial_at, trial_at) WHEN p_stage = 'new' THEN NULL ELSE trial_at END,
      joined_at = CASE WHEN p_stage = 'joined' THEN COALESCE(joined_at, now()) ELSE NULL END,
      lost_reason = CASE WHEN p_stage = 'lost' THEN p_lost_reason ELSE NULL END,
      lost_at = CASE WHEN p_stage = 'lost' THEN now() ELSE NULL END,
      -- Joined people need no follow-up; otherwise keep the date unless a new one is given.
      follow_up_on = CASE WHEN p_stage = 'joined' THEN NULL ELSE COALESCE(p_follow_up_on, follow_up_on) END
    WHERE id = p_lead_id AND gym_id = v_gym;
    IF NOT FOUND THEN RAISE EXCEPTION 'That lead isn’t in your gym.'; END IF;
  ELSIF p_op = 'follow_up' THEN
    UPDATE public.gym_leads SET follow_up_on = p_follow_up_on WHERE id = p_lead_id AND gym_id = v_gym;
    IF NOT FOUND THEN RAISE EXCEPTION 'That lead isn’t in your gym.'; END IF;
  ELSIF p_op = 'delete' THEN
    DELETE FROM public.gym_leads WHERE id = p_lead_id AND gym_id = v_gym;
  ELSE
    RAISE EXCEPTION 'Unknown lead action.';
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz, text, date) FROM PUBLIC, anon, authenticated;
