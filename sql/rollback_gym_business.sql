-- Rollback for sql/gym_business.sql (drops the stage-2 gym tables + functions).
DROP TRIGGER IF EXISTS gym_seed_plans ON public.gyms;
DROP FUNCTION IF EXISTS public.gym_seed_plans_trigger();
DROP FUNCTION IF EXISTS public.gym_save_settings(uuid, text, boolean, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.gym_save_plans(uuid, jsonb);
DROP FUNCTION IF EXISTS public.gym_pay_membership(uuid, uuid, integer, text, date);
DROP FUNCTION IF EXISTS public.gym_start_membership(uuid, uuid, uuid, integer, text, date);
DROP FUNCTION IF EXISTS public.gym_owned_by(uuid);
DROP FUNCTION IF EXISTS public.gym_seed_default_plans(uuid);
DROP TABLE IF EXISTS public.gym_payments;
DROP TABLE IF EXISTS public.gym_memberships;
DROP TABLE IF EXISTS public.gym_settings;
DROP TABLE IF EXISTS public.gym_plans;
