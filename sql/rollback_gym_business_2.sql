-- Rollback for sql/gym_business_2.sql. Restores the stage-2 gym_save_settings
-- and gym_start_membership signatures' behaviour is NOT restored for is_pt —
-- re-run sql/gym_business.sql's function bodies if you need the exact originals.
DROP FUNCTION IF EXISTS public.gym_trainer_payout(uuid, uuid, date, integer, boolean);
DROP FUNCTION IF EXISTS public.gym_checkin(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.gym_lead_action(uuid, text, uuid, text, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.gym_save_settings(uuid, text, boolean, boolean, boolean, boolean, integer, integer, integer);
DROP TABLE IF EXISTS public.gym_trainer_payouts;
DROP TABLE IF EXISTS public.gym_checkins;
DROP TABLE IF EXISTS public.gym_leads;
ALTER TABLE public.gym_settings DROP COLUMN IF EXISTS join_goal, DROP COLUMN IF EXISTS capacity, DROP COLUMN IF EXISTS trainer_share_pct;
ALTER TABLE public.gym_memberships DROP COLUMN IF EXISTS is_pt;
-- Then re-create gym_save_settings(uuid,text,boolean,boolean,boolean,boolean) from sql/gym_business.sql.
