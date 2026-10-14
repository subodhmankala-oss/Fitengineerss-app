-- ==========================================
-- ROLLBACK for sql/gym_tier.sql
--
-- Run in this order:
--   1. Re-run sql/link_coach_and_enter_transaction.sql FIRST — the gym-aware
--      version reads users.gym_id / gyms / coach_assignments, which this
--      script drops; leaving it in place would break every invite-code join.
--   2. Run this file.
--
-- Destroys all gym data (gyms, memberships, coaching history). The role
-- CHECK re-add fails while any user still has role 'gym_owner' — move them
-- back to another role first.
-- ==========================================

DROP TABLE IF EXISTS public.coach_assignments;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_gym_status_check;
DROP INDEX IF EXISTS public.idx_users_gym_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS gym_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS gym_id;

DROP TABLE IF EXISTS public.gyms;
DROP FUNCTION IF EXISTS public.generate_gym_join_code();

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'coach', 'super-admin'));
