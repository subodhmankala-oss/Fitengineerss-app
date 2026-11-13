-- The logger's own live kcal, saved with each workout draft, so the gym Live
-- board shows the exact number the member's phone (or the trainer's Live Log)
-- shows, instead of re-working it out on the server.
--
-- Run BEFORE the app version that sends live_kcal goes live: until this
-- column exists, a draft save that includes it is rejected.
alter table public.workout_drafts add column if not exists live_kcal numeric;
