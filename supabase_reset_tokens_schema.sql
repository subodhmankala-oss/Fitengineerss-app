-- ==========================================
-- PASSWORD RESET TOKENS SCHEMA
-- Paste this script into the Supabase SQL Editor.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Index token for high performance lookup
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens(token);

-- RLS Policies
DROP POLICY IF EXISTS "Allow public select on matching token" ON public.password_reset_tokens;
CREATE POLICY "Allow public select on matching token" ON public.password_reset_tokens
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert of tokens" ON public.password_reset_tokens;
CREATE POLICY "Allow public insert of tokens" ON public.password_reset_tokens
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update of tokens" ON public.password_reset_tokens;
CREATE POLICY "Allow public update of tokens" ON public.password_reset_tokens
  FOR UPDATE USING (true);
