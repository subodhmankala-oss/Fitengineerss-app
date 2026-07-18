-- ==========================================
-- COACH NOTES (one-off coach → client notes, with a missed-push fallback)
-- Paste this script into the Supabase SQL Editor.
--
-- When a coach-connected client finishes a workout, the coach gets a push
-- ("workout completed", with duration + calories) and can send back a short
-- note — either a suggested message or their own words. The note is delivered
-- to the client as a push immediately, AND stored here so the client can still
-- see it later (on their home screen) if they missed or dismissed that push.
--
-- This is deliberately NOT a chat thread: one row per note, one direction
-- (coach → client), with a read_at flag so a seen note stops resurfacing.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The recipient client's users.id.
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- The sending coach's users.id (nullable so a note is never lost if the
  -- coach id can't be resolved at send time).
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  -- Null until the client has seen the note; set once they dismiss the
  -- home-screen card, so it won't reappear on any device.
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Powers the client's "unread notes, newest first" fallback query.
CREATE INDEX IF NOT EXISTS idx_coach_notes_client_unread
  ON public.coach_notes(client_id, created_at DESC)
  WHERE read_at IS NULL;

-- Same permissive-RLS model as body_measurements/workout_logs in this project
-- — the app talks to PostgREST with the anon key only, so a default-deny
-- policy would block every read/write. Access is scoped in client code (a
-- client reads their own notes; a coach writes for a client they're viewing).
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_notes_allow_all" ON public.coach_notes;
CREATE POLICY "coach_notes_allow_all" ON public.coach_notes
  FOR ALL USING (true) WITH CHECK (true);
