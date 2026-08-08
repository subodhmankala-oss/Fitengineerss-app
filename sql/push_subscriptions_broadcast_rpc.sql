-- Scoped read access to push_subscriptions for trusted server code.
--
-- Since sql/lock_down_reads.sql, push_subscriptions SELECT requires
-- user_id = current_app_user_id() (i.e. auth.uid()-based). That's correct for
-- browser reads, but our Vercel serverless notification code
-- (api/notify-user.js, api/send-nudges.js) calls Supabase with the anon key
-- and NO user session — auth.uid() is NULL there, so those reads now
-- silently return zero rows. This does not reopen the table to the public;
-- it adds one narrow, secret-gated escape hatch for that specific
-- server-to-server use case.
--
-- Setup (run once, in the Supabase SQL editor):
--   insert into public.app_config (key, value)
--   values ('broadcast_secret', '<a long random string you generate>')
--   on conflict (key) do update set value = excluded.value;
-- Then set the same value as BROADCAST_SECRET in Vercel's env vars (and your
-- local .env if you need to run notification scripts locally). Never commit
-- the actual secret value to git.

create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;
-- Deliberately no policies for anon/authenticated: only a SECURITY DEFINER
-- function (which runs as the table owner and bypasses RLS) or the Supabase
-- SQL editor (as postgres) can read/write this table.

create or replace function public.get_push_subscriptions_for_broadcast(secret text)
returns setof public.push_subscriptions
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
  return query select * from public.push_subscriptions;
end;
$$;

revoke all on function public.get_push_subscriptions_for_broadcast(text) from public;
grant execute on function public.get_push_subscriptions_for_broadcast(text) to anon, authenticated;
