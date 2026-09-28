-- ==========================================
-- REMOVE COACH APPROVAL (schema follow-up to PR #273)
-- Paste this script into the Supabase SQL Editor.
--
-- Coaches get instant access: /api/register-coach and
-- /api/register-coach-google create them with status 'approved', and the
-- app no longer has any approval flow (removed in #273). The schema still
-- allowed the old manual-review states, so a stray write could put a coach
-- into a state no screen can get them out of. This removes them:
--
--   1. users.role        : drop 'coach_pending'   -> client | coach | super-admin
--   2. coaches.status    : drop 'pending'/'rejected' -> approved only
--                          (column kept: sign-up writes it and
--                          api/data-read.js filters on status=approved)
--   3. coach_applications: dropped (empty; nothing reads or writes it).
--                          Its 3 RLS policies, index, status check and
--                          users FK go with it.
--
-- Checked against production on 2026-09-28 before writing this:
--   - 0 coach_applications rows, 0 users with role 'coach_pending',
--     0 coaches with a status other than 'approved'
--   - no views, functions or other tables' policies reference
--     coach_applications or 'coach_pending'
--   - trg_prevent_role_escalation on users only guards 'super-admin', so
--     it is unaffected
--
-- APPLIED to production 2026-09-28 (verified: both checks tightened,
-- table gone, 72 client / 11 coach / 1 super-admin unchanged). Note: run
-- as one script in the Supabase SQL Editor, only step 0 executed. The
-- editor stopped silently after the DO block, with no error, so nothing
-- changed. It was applied instead as two separate runs: steps 1-2 without
-- BEGIN/COMMIT, then step 3. Adding a CHECK constraint validates every
-- existing row, so steps 1-2 are still safe without the guard.
--
-- Safe to re-run: step 0 re-checks the data and aborts the whole script if
-- anything would be lost, and every statement below is IF EXISTS.
-- Everything runs in one transaction, so it applies fully or not at all.
-- ==========================================

BEGIN;

-- 0. Guard: refuse to run if any row still uses a value being removed.
DO $$
DECLARE
  apps int := 0;
  pending_users int;
  non_approved_coaches int;
BEGIN
  IF to_regclass('public.coach_applications') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.coach_applications' INTO apps;
  END IF;
  SELECT count(*) INTO pending_users FROM public.users WHERE role = 'coach_pending';
  SELECT count(*) INTO non_approved_coaches FROM public.coaches WHERE status IS DISTINCT FROM 'approved';

  IF apps > 0 OR pending_users > 0 OR non_approved_coaches > 0 THEN
    RAISE EXCEPTION
      'Aborting, nothing changed: % coach_applications row(s), % coach_pending user(s), % non-approved coach(es). Resolve these first.',
      apps, pending_users, non_approved_coaches;
  END IF;
END $$;

-- 1. users.role: no more 'coach_pending'.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('client', 'coach', 'super-admin'));

-- 2. coaches.status: approved is the only state a coach can be in.
--    (Blocking a coach is a separate column, is_blocked, and is unaffected.)
ALTER TABLE public.coaches DROP CONSTRAINT IF EXISTS coaches_status_check;
ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_status_check CHECK (status = 'approved');

-- 3. coach_applications: no CASCADE on purpose. If something unexpected
--    still depends on it, this fails and the transaction rolls back instead
--    of silently dropping the dependent object too.
DROP TABLE IF EXISTS public.coach_applications;

COMMIT;

-- ==========================================
-- VERIFY (run after; expect the three new definitions and table_gone = true)
-- ==========================================
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conname IN ('users_role_check', 'coaches_status_check');
-- SELECT to_regclass('public.coach_applications') IS NULL AS table_gone;

-- ==========================================
-- ROLLBACK (only if ever needed; restores the pre-migration schema, empty)
-- ==========================================
-- BEGIN;
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE public.users ADD CONSTRAINT users_role_check
--   CHECK (role IN ('client', 'coach', 'coach_pending', 'super-admin'));
-- ALTER TABLE public.coaches DROP CONSTRAINT IF EXISTS coaches_status_check;
-- ALTER TABLE public.coaches ADD CONSTRAINT coaches_status_check
--   CHECK (status IN ('pending', 'approved', 'rejected'));
-- CREATE TABLE public.coach_applications (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
--   full_name text NOT NULL,
--   phone_number text NOT NULL,
--   experience_notes text,
--   status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
--   submitted_at timestamptz DEFAULT now(),
--   reviewed_at timestamptz
-- );
-- ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Admins can manage all applications" ON public.coach_applications
--   FOR ALL USING (EXISTS (SELECT 1 FROM public.users
--     WHERE users.id = auth.uid() AND users.email = 'subodhmankala@gmail.com'));
-- CREATE POLICY "Users can insert their own application" ON public.coach_applications
--   FOR INSERT WITH CHECK (user_id = auth.uid());
-- CREATE POLICY "Users can view their own application" ON public.coach_applications
--   FOR SELECT USING (user_id = auth.uid());
-- COMMIT;
