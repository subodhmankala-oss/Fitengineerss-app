-- ==========================================
-- WORKOUT DRAFTS (resume an in-progress logging session)
-- Paste this script into the Supabase SQL Editor.
--
-- Both the client's Log Sets screen and the coach's Live Log screen used to
-- keep an in-progress session (ticked sets, timer, plan name) only in
-- component state / localStorage. Backgrounding the app/tab for ~15-20 min
-- (mobile browsers reclaim memory, or the user just switches apps) unmounted
-- the screen and the half-finished workout was gone, forcing a restart.
--
-- One row per client per source (UNIQUE on user_id, source — see
-- supabase_workout_drafts_per_source.sql) holds each session currently in
-- progress FOR that client: the client's own (source='self', coach_id NULL)
-- and/or their coach logging live on their behalf (source='coach', coach_id =
-- the logging coach). Deleted the moment that session is finished or
-- explicitly discarded — this table only ever holds "currently open"
-- sessions, never history (workout_logs is history).
-- ==========================================

CREATE TABLE IF NOT EXISTS public.workout_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'coach')),
  plan_name TEXT,
  log_date DATE,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  timer_status TEXT NOT NULL DEFAULT 'idle' CHECK (timer_status IN ('idle', 'running', 'paused')),
  -- Epoch-ms numbers (matches Date.now() used throughout the app's timer
  -- code), not TIMESTAMPTZ — avoids a conversion step on every read/write.
  timer_started_at BIGINT,
  pause_intervals JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_drafts_user_id_source_key UNIQUE (user_id, source)
);

CREATE INDEX IF NOT EXISTS idx_workout_drafts_coach_id ON public.workout_drafts(coach_id);

-- Same permissive-RLS model as workout_logs/workout_plans in this project —
-- the app talks to PostgREST with the anon key only (no per-user JWT), so a
-- default-deny RLS policy would block every read/write. Client-side code is
-- what already scopes access (own user_id, or a client the coach can see).
ALTER TABLE public.workout_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workout_drafts_allow_all" ON public.workout_drafts;
CREATE POLICY "workout_drafts_allow_all" ON public.workout_drafts
  FOR ALL USING (true) WITH CHECK (true);
