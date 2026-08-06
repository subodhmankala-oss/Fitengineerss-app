-- Run this once in the Supabase SQL Editor.
--
-- Adds last-login tracking so the Super Admin Dashboard can show "last
-- seen" per coach/client and flag 1/2/3+ day inactivity, and so the daily
-- inactivity-nudge cron (api/send-inactivity-nudges.js) has something to
-- query against.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- SECURITY DEFINER so the anon-key REST call made right after sign-in
-- (see databaseService.signIn) can stamp last_login without needing RLS
-- policies that key off auth.uid() — same pattern as the existing
-- link_coach_and_enter_transaction() invite-code RPC.
CREATE OR REPLACE FUNCTION touch_last_login(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users SET last_login = now() WHERE email = lower(trim(p_email));
END;
$$;

GRANT EXECUTE ON FUNCTION touch_last_login(TEXT) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
