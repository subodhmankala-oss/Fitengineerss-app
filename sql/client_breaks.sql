-- ==========================================
-- CLIENT BREAKS ("Taking a break")
-- Paste this script into the Supabase SQL Editor. Safe to re-run.
--
-- A client tells their coach they'll be away (holiday, illness / injury,
-- emergency, other) from Profile -> Taking a break. While a break covers a
-- day: their Training Level doesn't lose points for it, the inactivity
-- sweep sends no reminders, and the coach's client list shows "Back <date>"
-- instead of the red "days since last workout" line.
--
-- A break covers start_date .. back_date - 1 (back_date is the day they're
-- back). Ending early just moves back_date to today.
--
-- RLS is on with NO policies: the browser can't read or write this table.
-- Every read and write goes through api/save-user-data.js
-- (action=client-break), which verifies the caller's session and sets
-- client_user_id / coach_id from the clients row, never from the browser.
CREATE TABLE IF NOT EXISTS public.client_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('holiday', 'illness', 'emergency', 'other')),
  note TEXT NOT NULL CHECK (char_length(btrim(note)) BETWEEN 3 AND 500),
  start_date DATE NOT NULL,
  back_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_breaks_dates CHECK (back_date > start_date AND back_date <= start_date + 92)
);

CREATE INDEX IF NOT EXISTS client_breaks_client_idx
  ON public.client_breaks (client_user_id, back_date DESC);
CREATE INDEX IF NOT EXISTS client_breaks_coach_idx
  ON public.client_breaks (coach_id, back_date DESC);

ALTER TABLE public.client_breaks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_breaks FROM anon, authenticated;
