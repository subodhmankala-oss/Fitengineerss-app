-- ==========================================
-- GYM SITE — owner finish: UPI payment link + "Today's messages" log
-- NOT YET RUN. Paste into the Supabase SQL Editor when ready. Safe to re-run.
--
--   gym_settings.upi_id   the gym's UPI ID (e.g. irondenfit@okhdfcbank), used to
--                         build the pay link / QR on the Payments screen and in
--                         the "payment due" WhatsApp message.
--   gym_save_upi()        owner-only setter (verified caller, like the others).
--   gym_message_log       which automatic-style WhatsApp messages the owner has
--                         already sent (or skipped), so "Today's messages" does
--                         not show the same member twice for the same event.
--   gym_message_sent()    owner-only: record a message as sent / skipped.
--
-- Nothing here changes an existing function, so the app keeps working before
-- this is applied (the UPI field and the sent-tracking just report an error).
-- Rollback: sql/rollback_gym_owner_finish.sql
-- ==========================================

ALTER TABLE public.gym_settings ADD COLUMN IF NOT EXISTS upi_id text
  CHECK (upi_id IS NULL OR upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,32}$');

CREATE TABLE IF NOT EXISTS public.gym_message_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     uuid NOT NULL REFERENCES public.gyms(id),
  member_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('renewal', 'miss', 'receipt')),
  -- What the message was about: the plan's end date (renewal), the date of the
  -- member's last workout (miss), or the payment id (receipt).
  ref        text NOT NULL CHECK (length(ref) BETWEEN 1 AND 64),
  action     text NOT NULL DEFAULT 'sent' CHECK (action IN ('sent', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, member_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS gym_message_log_gym_idx ON public.gym_message_log (gym_id, created_at DESC);
ALTER TABLE public.gym_message_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gym_save_upi(p_owner_id uuid, p_upi_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  INSERT INTO public.gym_settings (gym_id, upi_id, updated_at)
  VALUES (v_gym, NULLIF(btrim(p_upi_id), ''), now())
  ON CONFLICT (gym_id) DO UPDATE SET upi_id = EXCLUDED.upi_id, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gym_message_sent(p_owner_id uuid, p_member_id uuid, p_kind text, p_ref text, p_action text)
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
  INSERT INTO public.gym_message_log (gym_id, member_id, kind, ref, action)
  VALUES (v_gym, p_member_id, p_kind, p_ref, COALESCE(NULLIF(p_action, ''), 'sent'))
  ON CONFLICT (gym_id, member_id, kind, ref) DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_save_upi(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gym_message_sent(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
