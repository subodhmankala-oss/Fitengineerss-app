-- Last logged workout date per user, for the inactivity sweep's Training
-- Level decay warning (api/push.js, src/utils/trainingLevelDecay.js). One
-- row per user instead of pulling per-set workout_logs history. Same
-- secret-gated pattern as get_recent_workout_logs_for_server.sql.
create or replace function public.get_last_workout_dates_for_server(secret text)
returns table (user_id uuid, last_date date)
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
  return query select l.user_id, max(l.log_date)::date from public.workout_logs l group by l.user_id;
end;
$$;

revoke all on function public.get_last_workout_dates_for_server(text) from public;
grant execute on function public.get_last_workout_dates_for_server(text) to anon, authenticated;
