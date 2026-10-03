-- Founder → client messages (2026-10-03).
--
-- Fitengineers is self-guided, so the founder reaches out personally instead
-- of a coach: a message card with the founder's Google photo + name on the
-- client's home screen (and at the top of the sign-up wizard, for people who
-- quit sign-up midway), with one reply slot.
--
--   kind = 'welcome' — automatic, one per client, created lazily the first
--     time a NEW client (account ≤ 7 days old) opens the app. Text comes from
--     app_config 'founder_welcome_message' ({first_name} placeholder), with a
--     built-in fallback.
--   kind = 'message' — written by the founder from Super-Admin.
--
-- Every read/write goes through the SECURITY DEFINER functions below (no
-- INSERT/UPDATE policies at all), so a client can only ever read, dismiss and
-- reply to their own rows, and only the super-admin can send.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.founder_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Recipient: public.users.id (same id space as current_app_user_id()).
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'message')),
  message TEXT NOT NULL,
  -- Copied from the founder's users row at send time, so the client never
  -- needs read access to that row.
  sender_name TEXT,
  sender_avatar_url TEXT,
  -- Client dismissed the card.
  read_at TIMESTAMPTZ,
  -- One reply per message.
  client_reply TEXT,
  client_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS founder_messages_one_welcome
  ON public.founder_messages (client_id) WHERE kind = 'welcome';
CREATE INDEX IF NOT EXISTS founder_messages_client_unread
  ON public.founder_messages (client_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.founder_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS founder_messages_select ON public.founder_messages;
CREATE POLICY founder_messages_select ON public.founder_messages
  FOR SELECT USING (client_id = public.current_app_user_id() OR public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.founder_messages FROM anon, authenticated;

-- The founder's display name + photo for new rows.
CREATE OR REPLACE FUNCTION public.founder_sender()
RETURNS TABLE (name TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
  SELECT full_name, avatar_url FROM public.users
  WHERE lower(email) = 'subodhmankala@gmail.com' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.founder_sender() FROM public, anon, authenticated;

-- Caller's unread founder messages, newest first. Creates the automatic
-- welcome first if the caller is a new client who doesn't have one yet.
CREATE OR REPLACE FUNCTION public.get_my_founder_messages()
RETURNS SETOF public.founder_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
DECLARE
  me UUID := public.current_app_user_id();
  c RECORD;
  tmpl TEXT;
  first_name TEXT;
  s RECORD;
BEGIN
  IF me IS NULL THEN RETURN; END IF;

  SELECT cl.created_at, COALESCE(NULLIF(cl.full_name, ''), u.full_name) AS name
    INTO c
    FROM public.clients cl JOIN public.users u ON u.id = cl.user_id
   WHERE cl.user_id = me;

  IF FOUND
     AND c.created_at > now() - interval '7 days'
     AND NOT public.is_super_admin()
     AND NOT EXISTS (SELECT 1 FROM public.founder_messages WHERE client_id = me AND kind = 'welcome') THEN
    SELECT value INTO tmpl FROM public.app_config WHERE key = 'founder_welcome_message';
    tmpl := COALESCE(NULLIF(tmpl, ''),
      'Hi {first_name}! I''m Subodh, founder of Fitengineers. I built this app to guide you through every workout, step by step. If anything is confusing or you get stuck, just reply here — I read every message personally.');
    first_name := COALESCE(NULLIF(split_part(trim(COALESCE(c.name, '')), ' ', 1), ''), 'there');
    SELECT * INTO s FROM public.founder_sender();
    INSERT INTO public.founder_messages (client_id, kind, message, sender_name, sender_avatar_url)
    VALUES (me, 'welcome', replace(tmpl, '{first_name}', first_name), s.name, s.avatar_url)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT * FROM public.founder_messages
     WHERE client_id = me AND read_at IS NULL
     ORDER BY created_at DESC;
END;
$$;

-- Super-admin only: send a personal message to one client.
CREATE OR REPLACE FUNCTION public.send_founder_message(p_client_id UUID, p_message TEXT)
RETURNS public.founder_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
DECLARE
  s RECORD;
  v_row public.founder_messages;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN RAISE EXCEPTION 'message is required'; END IF;
  SELECT * INTO s FROM public.founder_sender();
  INSERT INTO public.founder_messages (client_id, kind, message, sender_name, sender_avatar_url)
  VALUES (p_client_id, 'message', left(trim(p_message), 1000), s.name, s.avatar_url)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Client: dismiss one of their own messages.
CREATE OR REPLACE FUNCTION public.dismiss_founder_message(p_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
  UPDATE public.founder_messages SET read_at = now()
   WHERE id = p_id AND client_id = public.current_app_user_id() AND read_at IS NULL;
$$;

-- Client: the one reply to one of their own messages. Returns false if they
-- already replied (or it isn't theirs).
CREATE OR REPLACE FUNCTION public.reply_founder_message(p_id UUID, p_reply TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
BEGIN
  IF p_reply IS NULL OR length(trim(p_reply)) = 0 THEN RETURN FALSE; END IF;
  UPDATE public.founder_messages
     SET client_reply = left(trim(p_reply), 1000), client_reply_at = now()
   WHERE id = p_id AND client_id = public.current_app_user_id() AND client_reply_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_founder_messages() FROM public, anon;
REVOKE ALL ON FUNCTION public.send_founder_message(UUID, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.dismiss_founder_message(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.reply_founder_message(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_founder_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_founder_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_founder_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_founder_message(UUID, TEXT) TO authenticated;
