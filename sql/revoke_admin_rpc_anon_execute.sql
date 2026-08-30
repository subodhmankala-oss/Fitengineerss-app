-- ==========================================
-- CLOSE THE DIRECT-RPC BYPASS on the five admin/coach-privileged write RPCs
--
-- STATUS: applied to production 2026-08-30, alongside api/admin-write.js.
--
-- save_exercise / delete_exercise / admin_seed_exercises (exercises_table.sql)
-- and set_client_total_sessions / set_client_program_dates
-- (supabase_total_sessions.sql, supabase_program_dates.sql) are all
-- SECURITY DEFINER functions that were directly callable via
-- /rest/v1/rpc/<fn> using nothing but the public anon key. Each one decided
-- "is this call authorized" from a plain parameter the CALLER supplied
-- (p_admin_email, or p_coach_id with no check tying it to who was actually
-- calling) — trivially spoofable by anyone, logged in or not. Confirmed
-- exploitable 2026-08-30.
--
-- api/admin-write.js now verifies the caller's real Supabase Auth session
-- server-side and calls these functions with the service role key instead.
-- That endpoint alone doesn't close the hole, though — the RPCs were still
-- reachable directly, bypassing it entirely. This migration is what actually
-- closes it: only the service role (i.e. only this server, via that verified
-- endpoint) may call these functions from now on.
--
-- Safe to re-run.
--
-- NOTE on the first attempt (2026-08-30): revoking from `anon, authenticated`
-- alone did NOT close the hole — confirmed by re-testing immediately after
-- applying it, which still succeeded and inserted a real row. The actual
-- grant was on PUBLIC (Postgres's implicit "every role" grantee that new
-- functions get EXECUTE on by default), and anon/authenticated both inherit
-- PUBLIC's privileges regardless of what's revoked from them individually.
-- Revoking from PUBLIC directly (below) is what actually closes it —
-- verified by the same direct-RPC-call test failing with 42501 afterward.
-- ==========================================

revoke execute on function public.save_exercise(jsonb, text) from public;
revoke execute on function public.delete_exercise(uuid, text) from public;
revoke execute on function public.admin_seed_exercises(jsonb, text) from public;
revoke execute on function public.set_client_total_sessions(uuid, uuid, integer) from public;
revoke execute on function public.set_client_program_dates(uuid, uuid, date, date) from public;

-- Explicit, though service_role typically already has this — belt and
-- braces so this migration doesn't depend on that default.
grant execute on function public.save_exercise(jsonb, text) to service_role;
grant execute on function public.delete_exercise(uuid, text) to service_role;
grant execute on function public.admin_seed_exercises(jsonb, text) to service_role;
grant execute on function public.set_client_total_sessions(uuid, uuid, integer) to service_role;
grant execute on function public.set_client_program_dates(uuid, uuid, date, date) to service_role;
