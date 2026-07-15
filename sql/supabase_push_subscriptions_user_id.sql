-- ==========================================
-- PUSH SUBSCRIPTIONS — add user_id for targeted (cross-user) notifications
-- Paste this script into the Supabase SQL Editor.
--
-- push_subscriptions was created (by api/subscribe.js) keyed only by
-- user_name + endpoint, which is ambiguous when several accounts share a
-- display name. To deliver a targeted notification to a SPECIFIC person
-- (e.g. "notify this client's coach that a workout just started"), we key
-- subscriptions to the real users.id. Existing rows keep working; new
-- subscribe calls populate user_id.
-- ==========================================

-- Ensure the table exists (matches api/subscribe.js's expected shape).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);
