-- Same secret-gated server-read pattern as sql/server_reads_rpc.sql, for the
-- new 15-day measurement reminder (api/push.js's runMeasurementReminderSweep).
-- Needs each client's most recent body_measurements row to know how long
-- it's been since they last logged. Unscoped (whole table, like
-- get_tracker_logs_for_server) rather than date-filtered — this table only
-- grows by ~1 row per client per 15 days at most (the app enforces that
-- cadence client-side, see sql/supabase_body_measurements.sql), so it never
-- gets workout_logs-sized.
--
-- Run this once in the Supabase SQL editor (same manual-apply pattern as the
-- other sql/*.sql files in this repo).

create or replace function public.get_body_measurements_for_server(secret text)
returns setof public.body_measurements
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
begin
  select value into expected from public.app_config where key = 'broadcast_secret';
  if expected is null or secret is null or secret <> expected then
    raise exception 'unauthorized';
  end if;
  return query select * from public.body_measurements;
end;
$$;

revoke all on function public.get_body_measurements_for_server(text) from public;
grant execute on function public.get_body_measurements_for_server(text) to anon, authenticated;
