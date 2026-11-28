-- Rollback for sql/gym_plan_freeze.sql. Plan end dates already moved by a
-- freeze stay where they are (they are ordinary gym_memberships dates).
DROP FUNCTION IF EXISTS public.gym_end_freeze(uuid, uuid);
DROP FUNCTION IF EXISTS public.gym_freeze_membership(uuid, uuid, integer, text, date);
DROP TABLE IF EXISTS public.gym_plan_freezes;
