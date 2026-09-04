-- ==========================================
-- Add the users.avatar_url column the app has always assumed existed
-- Paste this into the Supabase SQL Editor and run it.
--
-- databaseService.updateUserAvatarUrl() has, since it was written, read and
-- written public.users.avatar_url:
--
--     users?email=eq.<email>&select=id,avatar_url
--     restUpdate('users?id=eq.<id>', { avatar_url: ... })
--
-- but that column never existed. Every call failed and was swallowed by the
-- function's own .catch(() => console.warn(...)), so it never surfaced. The
-- knock-on effects:
--
--   * getUserProfileByEmail reads user.avatar_url for userAvatarUrl, so that
--     was permanently null.
--   * Avatar.jsx falls back to a Gravatar-by-email lookup when it's null, so
--     people DID see a picture — just never their actual Google one. That's
--     what made this invisible for so long.
--   * App.jsx's processSessionUser writes localStorage.userAvatarUrl straight
--     from the live Google session, but logout clears localStorage, so the
--     real photo never survived past a single session.
--   * api/data-read.js had to hardcode a connected coach's avatarUrl to null
--     and carried a comment warning not to select the column, because naming
--     a non-existent column 400s a PostgREST embedded query outright.
--
-- Purely additive: nullable, existing rows read back NULL, which is exactly
-- the "no photo saved" value every consumer above already handles. Safe to
-- run with the app live.
-- ==========================================

alter table public.users
  add column if not exists avatar_url text;

-- Backfill from what Google already gave us. Every account that has ever
-- signed in with Google has the photo sitting in auth.users.raw_user_meta_data
-- (avatar_url, with picture as the older key name) — it just never got copied
-- across, because the destination column didn't exist. Without this, everyone
-- keeps their Gravatar fallback until they happen to log in again.
--
-- Restricted to rows that already have auth_id set, on purpose. The
-- trg_link_new_user_auth_id trigger fires on UPDATE as well as INSERT and
-- backfills a null auth_id by email — and auth_id is unique, so touching the
-- second of a duplicate-email pair raises 23505 and rolls the whole statement
-- back. The one known duplicate (srikanth135b@gmail.com, two coach rows five
-- minutes apart) is documented in add_auth_id_link.sql as unused in every
-- related table, so leaving its unlinked row without a photo costs nothing.
update public.users u
set avatar_url = coalesce(
      au.raw_user_meta_data->>'avatar_url',
      au.raw_user_meta_data->>'picture'
    )
from auth.users au
where lower(au.email) = lower(u.email)
  and u.auth_id is not null
  and u.avatar_url is null
  and coalesce(
        au.raw_user_meta_data->>'avatar_url',
        au.raw_user_meta_data->>'picture'
      ) is not null;

-- Sanity check: run this after and share the result.
select
  count(*) as total_app_users,
  count(avatar_url) as have_a_real_photo,
  count(*) filter (where avatar_url is null) as still_on_gravatar_fallback
from public.users;
