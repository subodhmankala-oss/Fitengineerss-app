-- ==========================================
-- BLOCK PUBLIC PRIVILEGE ESCALATION TO super-admin
-- Paste this into the Supabase SQL Editor and run it.
--
-- Right now every row in public.users can be read/written by anyone with
-- the public anon key (RLS policy "Allow public read and write access" is
-- USING (true) WITH CHECK (true) — i.e. no real restriction). That includes
-- the `role` column, so anyone can currently send:
--   PATCH /rest/v1/users?id=eq.<any-uuid>   { "role": "super-admin" }
-- and grant themselves full admin access. The app's own client-side code
-- (CoachLogin.jsx, Onboarding.jsx, databaseService.js, App.jsx) already sets
-- role='super-admin' gated only by an email check that runs in the
-- visitor's browser — that's not a real security boundary, just JS anyone
-- can read past.
--
-- This trigger closes that one specific hole at the database level: no
-- INSERT or UPDATE may ever set role='super-admin' unless the row already
-- was super-admin. It does not touch client/coach signups, logins, or any
-- other role transition the app performs today.
--
-- Confirmed safe to run: subodhmankala@gmail.com already has role =
-- 'super-admin' saved in the users table, so this does not lock out the
-- existing admin account.
-- ==========================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'super-admin' THEN
    -- Allow no-op updates on a row that was already super-admin (e.g. the
    -- app re-saving other fields on your own account).
    IF TG_OP = 'UPDATE' AND OLD.role = 'super-admin' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'role cannot be set to super-admin through this API';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();
