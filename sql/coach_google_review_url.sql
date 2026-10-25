-- ==========================================
-- COACH GOOGLE REVIEW LINK
-- Paste this script into the Supabase SQL Editor.
--
-- The coach's "write a review" link from their Google Business Profile
-- (Settings -> Client Testimonials -> Google Reviews). After a client sends a testimonial,
-- Coach Details offers "Also post on Google": it copies their words and
-- opens this link, and the client posts the review from their own Google
-- account — Google has no API for posting reviews on someone's behalf.
--
-- Single nullable column, same shape as upi_id / logo_url: written by
-- api/save-user-data.js (op google-link), read for clients by
-- the same action. MUST be applied before the
-- code ships. Safe to re-run.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;
