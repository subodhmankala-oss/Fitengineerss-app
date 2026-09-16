-- In-app notifications (2026-09-16).
--
-- Why: coaches got zero feedback when a client redeemed their invite code.
-- The existing `client_connected` Web Push (api/push.js) only reaches
-- coaches who enabled the bell — 1 of 12 in production — and a push is
-- gone the moment it's dismissed. This table is the durable copy: the
-- link_coach_and_enter_transaction RPC inserts a row here in the same
-- transaction as the link itself, and the coach dashboard reads unread
-- rows on mount/focus and shows a card + "New" chip until the coach opens
-- that client or dismisses it.
--
-- Run this BEFORE re-running sql/link_coach_and_enter_transaction.sql
-- (the RPC references this table).
--
-- Shape is generic (type + payload) so later events can reuse it.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- public.users.id (NOT the auth UID) — same id space as
  -- current_app_user_id(), which the RLS below compares against.
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- The user the notification is about (for client_connected: the client).
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The dashboard's only query: unread rows for one recipient, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Same scoping helpers as sql/lock_down_reads.sql: a user sees/updates only
-- their own notifications; super-admin sees all. No INSERT/DELETE policy on
-- purpose — rows are only ever written by SECURITY DEFINER RPCs
-- (link_coach_and_enter_transaction) or the service role.
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (recipient_user_id = current_app_user_id() OR is_super_admin());

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE
  USING (recipient_user_id = current_app_user_id() OR is_super_admin())
  WITH CHECK (recipient_user_id = current_app_user_id() OR is_super_admin());
