-- ==========================================
-- MONTHLY PROGRESS REPORTS (coach → client, one per calendar month)
-- Paste this script into the Supabase SQL Editor.
--
-- A coach reviews a client's month (sessions, volume, sets, training time,
-- PRs, top lifts) compared against the two months before it, adds a short
-- message, and sends it. The client gets a push immediately AND the report
-- is stored here so it surfaces on their home screen (missed-push fallback,
-- same pattern as coach_notes) and stays in their "Monthly reports" history
-- forever.
--
-- `stats` is a SNAPSHOT computed at send time (see
-- src/utils/monthlyProgress.js buildMonthlyReport) — deliberately not
-- recomputed on read, so what the client sees is exactly what the coach
-- reviewed, even if workout_logs for that month are edited later.
--
-- One row per client + month: re-sending the same month replaces the
-- previous report (upsert on the unique key) instead of stacking duplicates.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.monthly_progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The recipient client's users.id.
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- The sending coach's users.id (nullable so a report is never lost if the
  -- coach id can't be resolved at send time — same as coach_notes).
  coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- First day of the reported month, e.g. 2026-08-01.
  report_month DATE NOT NULL,
  -- { current, previous, prevPrevious, deltas } — see buildMonthlyReport.
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  coach_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Null until the client taps "Got it" on the home-screen card.
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, report_month)
);

-- Client's "unread reports" home-screen card + "all reports, newest first"
-- history list both read by client_id.
CREATE INDEX IF NOT EXISTS idx_monthly_reports_client_month
  ON public.monthly_progress_reports (client_id, report_month DESC);

-- Same permissive-RLS model as coach_notes/workout_logs — the app talks to
-- PostgREST with the anon key, so a default-deny policy would block every
-- read/write. Scope is enforced in client code (a client reads their own
-- rows; a coach writes for a client they're viewing).
ALTER TABLE public.monthly_progress_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_progress_reports_allow_all" ON public.monthly_progress_reports;
CREATE POLICY "monthly_progress_reports_allow_all" ON public.monthly_progress_reports
  FOR ALL USING (true) WITH CHECK (true);
