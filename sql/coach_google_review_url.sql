-- ==========================================
-- COACH GOOGLE REVIEW LINK
-- Paste this script into the Supabase SQL Editor.
--
-- The coach's "write a review" link from their Google Business Profile
-- (Business Profile -> Google Reviews). After a client sends a testimonial,
-- Coach Details offers "Also post on Google": it copies their words and
-- opens this link, and the client posts the review from their own Google
-- account — Google has no API for posting reviews on someone's behalf.
--
-- Single nullable column, same shape as upi_id / logo_url: written by
-- saveCoachSelfProfile's plain PATCH, read for clients by
-- api/save-user-data.js (action=testimonials). MUST be applied before the
-- code ships — the profile save names the column. Safe to re-run.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;
