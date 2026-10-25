-- ==========================================
-- CLIENT TESTIMONIALS: LONGER QUOTES (400 -> 2000 characters)
-- Paste this script into the Supabase SQL Editor.
--
-- 400 characters was too tight for a real story (client feedback,
-- 2026-10-25). Matches MAX_QUOTE_LENGTH in src/utils/testimonials.js; Google
-- reviews take up to 4096, so "Also post on Google" still fits. Until this
-- runs, a quote over 400 characters fails to save with "Could not save your
-- testimonial." Safe to re-run.
ALTER TABLE public.coach_testimonials
  DROP CONSTRAINT IF EXISTS coach_testimonials_quote_check;
ALTER TABLE public.coach_testimonials
  ADD CONSTRAINT coach_testimonials_quote_check CHECK (char_length(quote) BETWEEN 1 AND 2000);
