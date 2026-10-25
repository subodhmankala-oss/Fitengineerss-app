-- ==========================================
-- CLIENT TESTIMONIALS
-- Paste this script into the Supabase SQL Editor.
--
-- A client writes one testimonial for their coach (Coach Details -> Write a
-- testimonial). The coach can only Show or Hide it — never change the words
-- or add their own — so a shown testimonial really came from that client.
--
-- RLS is on with NO policies: the browser can't read or write this table at
-- all. Every read and write goes through api/save-user-data.js
-- (action=testimonials), which verifies the caller's session and sets
-- client_user_id / coach_id itself from the clients row — never from what
-- the browser sends. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.coach_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quote TEXT NOT NULL CHECK (char_length(quote) BETWEEN 1 AND 2000),
  result TEXT CHECK (result IS NULL OR char_length(result) <= 80),
  -- pending: written or edited, waiting for the coach. Editing sends a shown
  -- testimonial back to pending so the coach approves the new words too.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shown', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_testimonials_one_per_client UNIQUE (client_user_id, coach_id)
);

CREATE INDEX IF NOT EXISTS coach_testimonials_coach_idx
  ON public.coach_testimonials (coach_id, status);

ALTER TABLE public.coach_testimonials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_testimonials FROM anon, authenticated;
