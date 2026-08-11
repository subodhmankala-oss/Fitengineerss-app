-- Same secret-gated server-read pattern as sql/server_reads_rpc.sql, for the
-- new weekly muscle-balance nudge (api/push.js's runMuscleBalanceSweep). It
-- needs workout_logs across ALL clients, scoped to the current week, to
-- compute each client's per-muscle set counts (reusing the exact same
-- getWeeklyMuscleStats logic the in-app Muscle Analytics screen uses — see
-- src/utils/muscleAnalytics.js).
--
-- Scoped by since_date (not the whole table, unlike the other *_for_server
-- RPCs) because workout_logs is a per-SET table that only grows — pulling
-- all-time history into a cron function on every run would get slower and
-- more expensive forever for no benefit; the sweep only ever needs the
-- current week.
--
-- Run this once in the Supabase SQL editor (same manual-apply pattern as the
-- other sql/*.sql files in this repo).

create or replace function public.get_recent_workout_logs_for_server(secret text, since_date date)
returns setof public.workout_logs
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
  return query select * from public.workout_logs where log_date >= since_date;
end;
$$;

revoke all on function public.get_recent_workout_logs_for_server(text, date) from public;
grant execute on function public.get_recent_workout_logs_for_server(text, date) to anon, authenticated;
