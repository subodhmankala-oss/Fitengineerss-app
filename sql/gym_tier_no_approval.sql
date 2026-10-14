-- ==========================================
-- GYM TIER — drop the approval steps (follows sql/gym_tier.sql)
--
-- STATUS: APPLIED to production 2026-10-14.
--
-- Product decision 2026-10-14: no pending/approval anywhere.
--   * A gym is active the moment it exists (owner sign-up or admin create).
--     The admin keeps only Suspend / Reactivate.
--   * A trainer who enters a gym code is in the gym immediately — no owner
--     approval — so users.gym_status is only ever 'active'.
--
-- The gym_status column is kept (always 'active' when gym_id is set) so the
-- join function and the both-or-neither CHECK need no change.
--
-- Idempotent. Fails loudly if any pending rows exist — activate or clear
-- them first.
-- ==========================================

ALTER TABLE public.gyms ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_status_check;
ALTER TABLE public.gyms
  ADD CONSTRAINT gyms_status_check CHECK (status IN ('active', 'suspended'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_gym_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_gym_status_check
  CHECK (
    (gym_id IS NULL AND gym_status IS NULL)
    OR (gym_id IS NOT NULL AND COALESCE(gym_status = 'active', false))
  );
