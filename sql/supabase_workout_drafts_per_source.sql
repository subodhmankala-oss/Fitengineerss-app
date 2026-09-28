-- One workout draft per client PER SOURCE, instead of one per client.
--
-- workout_drafts used to be UNIQUE on user_id, so a client's own in-progress
-- Log Sets session (source='self') and their coach's Live Log for them
-- (source='coach') shared a single row: whichever side saved last silently
-- replaced the other's ticked sets, and finishing or discarding either one
-- deleted both. The app now reads, writes (upsert on_conflict=user_id,source)
-- and deletes each source's row separately.
--
-- Run in TWO steps, because the app's upsert names its conflict columns and
-- PostgREST needs a unique constraint on exactly those columns:
--
-- STEP 1 — before the new app version goes live (safe any time; the old
-- version keeps working, since UNIQUE(user_id) is still there).
alter table public.workout_drafts
  add constraint workout_drafts_user_id_source_key unique (user_id, source);

-- STEP 2 — right after the new app version is live. This is what actually
-- lets both rows exist at once. Until it runs, a coach save for a client who
-- has their own draft open is rejected by UNIQUE(user_id) instead of
-- overwriting it. Old cached app versions still save drafts after this (their
-- direct upsert fails and falls back to /api/save-workout-draft, which is
-- the new server code).
--
-- alter table public.workout_drafts drop constraint workout_drafts_user_id_key;
