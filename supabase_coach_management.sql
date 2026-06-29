-- Coach management: direct (no-approval) signup support, experience storage,
-- and super-admin block/unblock capability.
--
-- Safe to re-run: both column adds are idempotent. Does NOT touch RLS policies,
-- auth UID mapping, the invitations/invite-code flow, or any client data.

-- Years of experience, captured during coach signup ("fill the form" step).
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS experience_years INTEGER;

-- Super-admin block switch. false = active (default), true = blocked.
-- Login enforcement reads this to deny access to blocked coaches.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
