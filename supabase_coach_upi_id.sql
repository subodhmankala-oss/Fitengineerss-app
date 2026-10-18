-- ==========================================
-- COACH UPI ID
-- Paste this script into the Supabase SQL Editor.
--
-- Lets a coach save their UPI ID once (Business Profile -> Payment QR Code)
-- so it can be written into the WhatsApp payment messages as copyable text,
-- next to the QR. WhatsApp Pay caps payments at Rs 2,000, so a client who
-- would pay more needs another way in: copy the ID into GPay / PhonePe / Paytm.
--
-- Same shape as payment_qr_url / logo_url — single nullable column, no RPC
-- (saveCoachSelfProfile's plain PATCH to `coaches` already covers it under
-- the coach's own session token). Safe to re-run.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS upi_id TEXT;
