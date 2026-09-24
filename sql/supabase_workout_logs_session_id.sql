-- Makes workout saves idempotent: the same finished workout can no longer be
-- written to workout_logs twice.
--
-- saveWorkoutSession now stamps every row with the local session id
-- ('session-<ms>' / 'coach-live-<ms>', fixed once the workout is finished) and
-- the row's position in that session. A retry, an offline-queue replay or the
-- app-open resync of the SAME workout sends the same (session_id,
-- session_row) pairs, and this index rejects them (23505) — the app treats that
-- as "already saved". See src/utils/workoutLogDedupe.js for the history.
--
-- Safe to run before or after the app deploy: rows from older builds have
-- session_id NULL, and NULLs never conflict in a unique index; the app drops
-- these columns from its insert if they don't exist yet.

alter table public.workout_logs add column if not exists session_id text;
alter table public.workout_logs add column if not exists session_row integer;

create unique index if not exists workout_logs_session_row_key
  on public.workout_logs (user_id, session_id, session_row);
