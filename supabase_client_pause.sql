-- ==========================================
-- CLIENT SUBSCRIPTION PAUSE
-- Paste this script into the Supabase SQL Editor.
--
-- Lets a coach mark a client as paused (they've stopped renewing/aren't
-- continuing right now) directly from the Client Payments renewal-reminder
-- row, instead of that client aging forever in the overdue list with no way
-- to acknowledge it (2026-09-06: "what if after a month clients dont want
-- to continue").
--
-- Same shape as supabase_total_sessions.sql: a single nullable column plus a
-- SECURITY DEFINER, coach-scoped setter — does NOT touch RLS policies, the
-- auth.uid() mapping, the invitations flow, or any other table. Safe to
-- re-run.
-- ==========================================

-- 1. paused_at IS NULL  = active (the default; every existing client stays
--    active on this migration).
--    paused_at NOT NULL = paused since that timestamp. A timestamp rather
--    than a plain boolean so "since when" is available for free if a coach
--    ever wants to see how long a client has been paused, with no extra
--    column.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- 2. Coach-scoped setter. SECURITY DEFINER so the write works regardless of
--    which clients RLS policy set is deployed (today's clients_update policy
--    only allows a client to update their OWN row — coaches have no direct
--    write access to clients at all, same as total_sessions/program_dates
--    before this). The WHERE clause enforces the coach<->client
--    relationship: a coach can only ever update rows where clients.coach_id
--    is their own users.id.
CREATE OR REPLACE FUNCTION public.set_client_paused(
  p_coach_id UUID,     -- coach's users.id
  p_client_id UUID,    -- client's users.id
  p_paused BOOLEAN
) RETURNS JSONB AS $$
DECLARE
  v_updated INTEGER;
  v_paused_at TIMESTAMPTZ;
BEGIN
  v_paused_at := CASE WHEN p_paused THEN now() ELSE NULL END;

  UPDATE public.clients
  SET paused_at = v_paused_at
  WHERE user_id = p_client_id
    AND coach_id = p_coach_id;   -- multi-tenant scope check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching coach-client relationship.');
  END IF;

  RETURN jsonb_build_object('success', true, 'paused_at', v_paused_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Close the direct-RPC bypass from the start (see
--    sql/revoke_admin_rpc_anon_execute.sql for why this matters: a
--    SECURITY DEFINER function is otherwise directly callable via
--    /rest/v1/rpc/<fn> with just the anon key, and the p_coach_id it takes
--    would then be whatever the caller claims — nothing server-side ties it
--    to who's really calling). Only api/admin-write.js (service role,
--    caller identity verified server-side) may call this function.
revoke execute on function public.set_client_paused(uuid, uuid, boolean) from public;
grant execute on function public.set_client_paused(uuid, uuid, boolean) to service_role;
