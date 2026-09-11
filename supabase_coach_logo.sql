-- ==========================================
-- COACH BUSINESS LOGO
-- Paste this script into the Supabase SQL Editor.
--
-- Lets a coach upload their business logo once (Business Profile -> Business
-- Logo) so it can be attached alongside the renewal reminders sent from
-- Client Payments (2026-09-11 follow-up to supabase_coach_payment_qr.sql:
-- "I need a logo to attached logo also should be there").
--
-- Same shape as payment_qr_url — single nullable column, no RPC needed
-- (saveCoachSelfProfile's existing plain PATCH to `coaches` already covers
-- any column on that row under the coach's own session token). Stored as a
-- data: URL (base64), same reasoning as payment_qr_url: no image-upload/
-- Storage-bucket flow exists in this project, and a compressed logo is only
-- a few KB. Safe to re-run.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
