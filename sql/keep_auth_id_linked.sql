-- ==========================================
-- STEP 3: Keep auth_id linked automatically for every future account
-- Paste this into the Supabase SQL Editor and run it.
--
-- add_auth_id_link.sql linked auth_id for existing users (one-time backfill).
-- This keeps it linked going forward, for every new signup, without any
-- app code changes. There are 4+ different places in the app that create a
-- public.users row (client signup, coach signup, coach-google signup,
-- coach-added-a-client-manually, admin onboarding) — each has its own
-- history of subtle bugs around user-id handling (see the extensive
-- comments in databaseService.js / api/register-coach.js). Patching all of
-- them individually to also set auth_id risks reintroducing one of those
-- bugs. Doing it here instead, as two small triggers, covers every existing
-- and future signup path uniformly with zero app code risk.
--
-- Trigger A: a new/updated public.users row with no auth_id yet tries to
-- find a matching login account by email and link it immediately.
-- Trigger B: a new login account (auth.users row) checks for an
-- already-existing public.users row waiting for it (e.g. a coach manually
-- added a client who hasn't signed up yet) and links that.
-- ==========================================

create or replace function public.link_new_user_auth_id()
returns trigger as $$
begin
  if new.auth_id is null then
    select id into new.auth_id
    from auth.users
    where lower(email) = lower(new.email)
    limit 1;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_link_new_user_auth_id on public.users;
create trigger trg_link_new_user_auth_id
  before insert or update on public.users
  for each row
  execute function public.link_new_user_auth_id();

create or replace function public.link_existing_profile_on_auth_signup()
returns trigger as $$
begin
  update public.users
  set auth_id = new.id
  where lower(email) = lower(new.email)
    and auth_id is null;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_link_existing_profile_on_auth_signup on auth.users;
create trigger trg_link_existing_profile_on_auth_signup
  after insert on auth.users
  for each row
  execute function public.link_existing_profile_on_auth_signup();
