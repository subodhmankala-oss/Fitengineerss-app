-- Client ↔ Fitengineers team chat (2026-11-28).
--
-- Builds on sql/founder_messages.sql. The home screen no longer stacks a
-- founder card: a small Fitengineers badge in the Home header opens a chat
-- sheet. A client can now start a message themselves, not only reply once.
--
--   kind = 'client' — a message the client wrote from the chat sheet. Stored
--     in client_reply / client_reply_at (message = '') so the Super-Admin
--     Inbox (getFounderReplies: latest client_reply per client) and the
--     founder_reply push pick it up with no admin-side change. read_at is set
--     on insert: the client's own message is never "unread" for them.
--
-- Additive: widens the kind check and adds three functions. Safe to re-run.

ALTER TABLE public.founder_messages DROP CONSTRAINT IF EXISTS founder_messages_kind_check;
ALTER TABLE public.founder_messages
  ADD CONSTRAINT founder_messages_kind_check CHECK (kind IN ('welcome', 'message', 'client'));

-- The caller's whole chat (read and unread), the latest 60 rows, oldest first.
CREATE OR REPLACE FUNCTION public.get_my_team_chat()
RETURNS SETOF public.founder_messages
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
  SELECT * FROM (
    SELECT * FROM public.founder_messages
     WHERE client_id = public.current_app_user_id()
     ORDER BY created_at DESC
     LIMIT 60
  ) t ORDER BY created_at ASC;
$$;

-- Client: send a new message to the team. At most 30 a day.
CREATE OR REPLACE FUNCTION public.send_team_message(p_message TEXT)
RETURNS public.founder_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
DECLARE
  me UUID := public.current_app_user_id();
  v_row public.founder_messages;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN RAISE EXCEPTION 'message is required'; END IF;
  IF (SELECT count(*) FROM public.founder_messages
       WHERE client_id = me AND kind = 'client' AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'too many messages today';
  END IF;
  INSERT INTO public.founder_messages (client_id, kind, message, client_reply, client_reply_at, read_at)
  VALUES (me, 'client', '', left(trim(p_message), 1000), now(), now())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Client: opening the chat marks every team message read (clears the dot).
CREATE OR REPLACE FUNCTION public.mark_team_chat_read()
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
  UPDATE public.founder_messages SET read_at = now()
   WHERE client_id = public.current_app_user_id() AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_team_chat() FROM public, anon;
REVOKE ALL ON FUNCTION public.send_team_message(TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.mark_team_chat_read() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_chat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_team_message(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_team_chat_read() TO authenticated;
