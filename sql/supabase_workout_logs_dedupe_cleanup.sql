-- One-time cleanup: removes workouts that were saved more than once.
--
-- One saved workout = the set rows sharing a created_at (one bulk INSERT).
-- A batch is a duplicate when an EARLIER batch has the same user, date, plan,
-- session calories/duration and the same set of distinct set rows (distinct,
-- and ignoring set_number, so a copy rebuilt with every set doubled still
-- matches). The earliest copy is kept. Same rule as the app's read-side
-- filter in src/utils/workoutLogDedupe.js.
--
-- Deleted rows are first copied into workout_logs_duplicates_backup, so this
-- is reversible:
--   insert into public.workout_logs select * from public.workout_logs_duplicates_backup;
--
-- Step 1 (preview, read-only): run the SELECT at the bottom first.
-- Step 2: run the whole transaction.

begin;

create table if not exists public.workout_logs_duplicates_backup
  (like public.workout_logs including all);

create temp table dup_batches on commit drop as
with batches as (
  select
    user_id,
    created_at,
    concat_ws('#',
      log_date::text,
      trim(coalesce(plan_name, '')),
      coalesce(max(calories_burned)::text, ''),
      coalesce(max(duration_seconds)::text, ''),
      string_agg(distinct concat_ws('~',
        coalesce(exercise_name, ''), coalesce(reps::text, ''), coalesce(weight_kg::text, ''),
        coalesce(distance_km::text, ''), coalesce(cardio_duration_seconds::text, ''),
        coalesce(set_type, '')), '|')
    ) as sig
  from public.workout_logs
  where created_at is not null
  group by user_id, created_at, log_date, plan_name
),
ranked as (
  select user_id, created_at,
         row_number() over (partition by user_id, sig order by created_at) as rn
  from batches
)
select user_id, created_at from ranked where rn > 1;

insert into public.workout_logs_duplicates_backup
select l.* from public.workout_logs l
join dup_batches d on d.user_id = l.user_id and d.created_at = l.created_at;

delete from public.workout_logs l
using dup_batches d
where d.user_id = l.user_id and d.created_at = l.created_at;

commit;

-- Preview (read-only) — how much the transaction above would remove:
-- with batches as ( ...same CTE as above... ), ranked as ( ... )
-- select count(*) filter (where rn > 1) as duplicate_saves from ranked;
