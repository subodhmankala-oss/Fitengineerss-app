-- One-time "Welcome to Fitengineers" banner on the client home screen (see
-- WelcomeBanner.jsx). Defaults to false so every EXISTING client is treated
-- as already having "seen" it once this migration runs (backfilled below) —
-- only brand-new signups going forward should ever see it. Tracked
-- server-side (not localStorage) so dismissing it on one device keeps it
-- dismissed everywhere else the client logs in, same reasoning as
-- coach_notes.read_at (see supabase_coach_notes.sql).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS welcome_seen BOOLEAN NOT NULL DEFAULT false;

-- Don't show the banner to clients who already existed before this feature
-- shipped — only a client created from here on should ever see it.
UPDATE public.clients SET welcome_seen = true WHERE welcome_seen = false;
