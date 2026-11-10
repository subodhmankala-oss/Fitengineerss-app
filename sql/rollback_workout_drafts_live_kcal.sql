-- Undo sql/workout_drafts_live_kcal.sql (only after the app stops sending live_kcal).
alter table public.workout_drafts drop column if exists live_kcal;
