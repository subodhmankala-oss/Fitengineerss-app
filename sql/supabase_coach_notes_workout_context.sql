-- ==========================================
-- COACH NOTES: which workout session a note was about
-- Paste this script into the Supabase SQL Editor.
--
-- A coach note is (almost always) a response to one specific workout the
-- client logged. Until now the row only stored the note text, so when the
-- client replied ("No pains", "Thank you") the coach's pending-replies card
-- just said "Reply from X" — no way to tell WHICH session or date that
-- was about, especially with several clients replying in the same week.
--
-- Both columns are nullable: a note sent with no session in context (e.g.
-- an evergreen "keep it up!") simply leaves them empty and the card falls
-- back to showing the original note text + the note's date.
-- ==========================================

ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS workout_name TEXT,
  ADD COLUMN IF NOT EXISTS workout_date DATE;
