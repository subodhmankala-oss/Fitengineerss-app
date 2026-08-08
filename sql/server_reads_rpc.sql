-- More scoped RPCs for the same problem as sql/push_subscriptions_broadcast_rpc.sql:
-- api/notify-user.js and api/send-nudges.js read `users`, `clients`, `coaches`, and
-- `tracker_logs` with the anon key and no user session. Since sql/lock_down_reads.sql,
-- all four of those tables gate SELECT on auth.uid()-derived checks, so every one of
-- these server-side reads has been silently returning zero rows in production —
-- meaning workout-completed/measurements/coach-note pushes, the hourly wellness nudge,
-- and the daily inactivity sweep have likely been firing to nobody.
--
-- Same shared secret as push_subscriptions_broadcast_rpc.sql (app_config.broadcast_secret)
-- — no new setup needed if that file has already been run.
--
-- These tables are small for this app, so (matching the in-memory `.find()` style
-- already used in api/send-nudges.js's inactivity sweep) each RPC just returns the
-- full table and the caller filters/looks up in JS, rather than adding a separate
-- parameterized RPC per query shape.

create or replace function public.get_users_for_server(secret text)
returns setof public.users
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
  return query select * from public.users;
end;
$$;

create or replace function public.get_clients_for_server(secret text)
returns setof public.clients
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
  return query select * from public.clients;
end;
$$;

create or replace function public.get_coaches_for_server(secret text)
returns setof public.coaches
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
  return query select * from public.coaches;
end;
$$;

create or replace function public.get_tracker_logs_for_server(secret text)
returns setof public.tracker_logs
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
  return query select * from public.tracker_logs;
end;
$$;

revoke all on function public.get_users_for_server(text) from public;
revoke all on function public.get_clients_for_server(text) from public;
revoke all on function public.get_coaches_for_server(text) from public;
revoke all on function public.get_tracker_logs_for_server(text) from public;

grant execute on function public.get_users_for_server(text) to anon, authenticated;
grant execute on function public.get_clients_for_server(text) to anon, authenticated;
grant execute on function public.get_coaches_for_server(text) to anon, authenticated;
grant execute on function public.get_tracker_logs_for_server(text) to anon, authenticated;
