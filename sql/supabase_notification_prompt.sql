-- One-time "Turn on notifications?" prompt shown to a brand-new client right
-- after their first login (NotificationPrompt.jsx), same reasoning as the
-- welcome banner (see supabase_welcome_message.sql): tracked server-side, not
-- localStorage, so answering it on one device (Enable or "Not now") keeps it
-- from resurfacing on another device or a later login. Defaults to false so
-- every EXISTING client is backfilled to "already seen" below — only clients
-- created from here on should ever be asked.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notification_prompt_seen BOOLEAN NOT NULL DEFAULT false;

-- Don't prompt clients who already existed before this feature shipped —
-- only a client created from here on should ever see it.
UPDATE public.clients SET notification_prompt_seen = true WHERE notification_prompt_seen = false;
