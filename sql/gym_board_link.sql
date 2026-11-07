-- ==========================================
-- GYM SITE — shareable Live board link
--
-- STATUS: NOT YET APPLIED. Additive.
-- Rollback: sql/rollback_gym_board_link.sql
--
-- gyms.board_token is the secret part of the public, read-only link
-- /gym/board/<token>: anyone holding it sees the Live board with no login.
-- The owner can change it, which kills the old link. gyms stays RLS-locked
-- (service-role API only). gen_random_uuid() = 122 random bits.
-- ==========================================

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS board_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS gyms_board_token_key ON public.gyms (board_token);

-- The owner replaces the link; the old one stops working at once.
CREATE OR REPLACE FUNCTION public.gym_reset_board_token(p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_gym uuid := public.gym_owned_by(p_owner_id);
BEGIN
  UPDATE public.gyms SET board_token = replace(gen_random_uuid()::text, '-', '') WHERE id = v_gym;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gym_reset_board_token(uuid) FROM PUBLIC, anon, authenticated;
