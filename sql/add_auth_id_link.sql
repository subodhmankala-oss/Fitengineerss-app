-- ==========================================
-- STEP 2a: Add the missing link between login accounts and app profiles
-- Paste this into the Supabase SQL Editor and run it.
--
-- public.users has no reliable way today to know "which login account owns
-- this row" — auth.users (Supabase Auth, created at signup/login) and
-- public.users (the app's own profile row, created by email upsert) are two
-- separate id systems that were never connected. This adds a new column,
-- auth_id, and fills it in for every existing row where the emails match.
--
-- This step is purely additive: it does not remove, restrict, or change
-- access to anything. It's safe to run with the app live.
-- ==========================================

alter table public.users
  add column if not exists auth_id uuid unique;

-- A handful of emails have duplicate rows in public.users (e.g. an abandoned
-- double signup). auth_id must be unique, so only the first row per email
-- (oldest by created_at) gets linked; any duplicate is left unlinked rather
-- than erroring the whole backfill out. Checked: the known duplicate pair
-- (srikanth135b@gmail.com) is unused in every related table either way, so
-- picking one arbitrarily is safe.
with ranked as (
  select u.id,
         a.id as auth_user_id,
         row_number() over (partition by lower(u.email) order by u.created_at asc) as rn
  from public.users u
  join auth.users a on lower(a.email) = lower(u.email)
  where u.auth_id is null
)
update public.users u
set auth_id = ranked.auth_user_id
from ranked
where ranked.id = u.id
  and ranked.rn = 1;

-- Sanity check: run this after and share the result.
select
  count(*) as total_app_users,
  count(auth_id) as linked_to_a_login,
  count(*) filter (where auth_id is null) as still_unlinked
from public.users;
