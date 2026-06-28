-- ==========================================
-- COACH INVITATION CODES SCHEMA
-- Paste this script into the Supabase SQL Editor.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  coach_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Index code for high performance lookup
CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);

-- RLS Policies
DROP POLICY IF EXISTS "Allow public select on invitations" ON public.invitations;
CREATE POLICY "Allow public select on invitations" ON public.invitations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authed insert on invitations" ON public.invitations;
CREATE POLICY "Allow authed insert on invitations" ON public.invitations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow public update of invitations" ON public.invitations;
CREATE POLICY "Allow public update of invitations" ON public.invitations
  FOR UPDATE USING (true);
