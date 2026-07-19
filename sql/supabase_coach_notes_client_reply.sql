-- ==========================================
-- COACH NOTES: client reply columns
-- Paste this script into the Supabase SQL Editor.
--
-- Lets a client send ONE reply message (free text, emoji included — no
-- special picker needed, just a normal text input) back on the exact coach
-- note card they received. The reply lives on that same coach_notes row:
-- once client_reply_at is set for a note, the reply box for THAT note locks
-- (one active reply at a time) — a fresh reply opportunity only appears when
-- the coach sends a new note.
--
-- coach_seen_reply_at is the coach-side unread marker: it powers the pending
-- replies card on the coach's client-directory (home) screen, and is
-- cleared (set) when the coach dismisses/sees that reply there — same
-- pattern as coach_notes.read_at works for the client's side.
-- ==========================================

ALTER TABLE public.coach_notes
  ADD COLUMN IF NOT EXISTS client_reply TEXT,
  ADD COLUMN IF NOT EXISTS client_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coach_seen_reply_at TIMESTAMPTZ;

-- Fast lookup of a coach's unseen client replies across all their clients.
CREATE INDEX IF NOT EXISTS idx_coach_notes_pending_replies
  ON public.coach_notes (coach_id, client_reply_at)
  WHERE client_reply_at IS NOT NULL AND coach_seen_reply_at IS NULL;
