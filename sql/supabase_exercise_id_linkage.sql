-- Links every logged set and every plan/template/draft exercise to its
-- library record by id, so PREV and the Form Guide video no longer depend on
-- the name being spelled exactly like the library's ("Face Pulls" vs "Face
-- Pull", "Pull‑Ups" with a non-breaking hyphen, or a library record renamed
-- after the client logged it).
--
-- One id for both library tables: public.exercises (shared catalog) and
-- public.custom_exercises (a coach's/client's own) both use random uuid
-- primary keys, so a bare uuid says which record it is without a "source"
-- column. There is no foreign key (one column can't reference two tables);
-- an id whose record was deleted simply stops matching and the app falls
-- back to the name key, the same as a row that was never linked.
--
--   workout_logs.exercise_id                  uuid, NULL = not linked
--   workout_plans/templates/drafts.exercises  each element may carry
--                                             "exerciseId": "<uuid>"
--
-- Backfill matches by exercise_name_key() below — the SQL twin of
-- exerciseNameKey in src/utils/exerciseName.js (keep the two in step): the
-- shared catalog first, then the owner's custom exercises (the client's own,
-- or their coach's). Rows that match neither stay NULL and keep resolving by
-- name; the report at the bottom lists them.
--
-- Safe to run before or after the app deploy: the app drops exercise_id from
-- its workout_logs insert while the column doesn't exist (the same
-- missing-column retry every optional column uses), and the JSON field is
-- ignored by builds that don't know it. Re-runnable: everything is
-- "if not exists" / only touches rows that aren't linked yet.

-- 1. Name key ---------------------------------------------------------------
-- Lower-case, split on anything that isn't a-z/0-9 (that also takes care of
-- unicode dashes), drop a plural "s" from each word of 3+ letters unless it
-- ends "ss"/"us"/"is" (Press, Bus, Pelvis), join with nothing.
create or replace function public.exercise_name_key(name text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(
           case when length(w) >= 3 and w ~ '[^sui]s$' then left(w, -1) else w end,
           '' order by ord), '')
  from regexp_split_to_table(lower(coalesce(name, '')), '[^a-z0-9]+') with ordinality as t(w, ord)
  where w <> ''
$$;

-- 2. No near-duplicates in the shared catalog --------------------------------
-- "Face Pulls" can't be added next to "Face Pull" (the admin save then fails
-- with 23505 on this index). Checked 2026-10-23: no existing pair collides.
create unique index if not exists exercises_name_key_uniq
  on public.exercises (public.exercise_name_key(name));

-- 3. workout_logs.exercise_id ------------------------------------------------
alter table public.workout_logs add column if not exists exercise_id uuid;

create index if not exists workout_logs_user_exercise_id_idx
  on public.workout_logs (user_id, exercise_id);

-- 4. Backfill ------------------------------------------------------------------
-- Session-only helpers (pg_temp, so nothing is left behind as a callable
-- RPC). Parameters are p_-prefixed: inside a SQL function a bare `name`
-- would bind to the table's column, not the argument.
--
-- The library record for p_name as seen by this client and their coach.
create or replace function pg_temp.resolve_exercise_id(p_name text, p_client uuid, p_coach uuid)
returns uuid
language sql
stable
as $$
  select coalesce(
    (select e.id from public.exercises e
      where public.exercise_name_key(e.name) = public.exercise_name_key(p_name)),
    (select c.id from public.custom_exercises c
      where public.exercise_name_key(c.name) = public.exercise_name_key(p_name)
        and ((p_client is not null and c.client_user_id = p_client)
          or (p_coach is not null and c.coach_id = p_coach))
      order by (c.client_user_id = p_client) desc nulls last, c.created_at
      limit 1)
  )
$$;

-- Adds "exerciseId" to each element that doesn't have one and resolves;
-- unmatched elements and element order are left exactly as they were.
create or replace function pg_temp.link_exercise_json(p_arr jsonb, p_client uuid, p_coach uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(
           case when x.id is null then t.el
                else t.el || jsonb_build_object('exerciseId', x.id) end
           order by t.ord), '[]'::jsonb)
  from jsonb_array_elements(p_arr) with ordinality as t(el, ord)
  left join lateral (
    select case when jsonb_typeof(t.el) = 'object' and not (t.el ? 'exerciseId')
                then pg_temp.resolve_exercise_id(t.el->>'name', p_client, p_coach) end as id
  ) x on true
$$;

-- 4a. Logs: resolved once per (name, client), then applied to their rows.
with pairs as (
  select distinct l.exercise_name, l.user_id
  from public.workout_logs l
  where l.exercise_id is null
),
resolved as (
  select p.exercise_name, p.user_id,
         pg_temp.resolve_exercise_id(
           p.exercise_name, p.user_id,
           (select cl.coach_id from public.clients cl where cl.user_id = p.user_id limit 1)
         ) as exercise_id
  from pairs p
)
update public.workout_logs l
   set exercise_id = r.exercise_id
  from resolved r
 where l.exercise_id is null
   and r.exercise_id is not null
   and l.exercise_name = r.exercise_name
   and l.user_id is not distinct from r.user_id;

-- 4b. Plans (user_id = the client).
update public.workout_plans p
   set exercises = linked.exercises
  from (
    select p2.id,
           pg_temp.link_exercise_json(
             p2.exercises, p2.user_id,
             (select cl.coach_id from public.clients cl where cl.user_id = p2.user_id limit 1)
           ) as exercises
    from public.workout_plans p2
    where jsonb_typeof(p2.exercises) = 'array'
  ) linked
 where p.id = linked.id
   and p.exercises is distinct from linked.exercises;

-- 4c. Templates (shared library programs — catalog only).
update public.workout_templates t
   set exercises = pg_temp.link_exercise_json(t.exercises, null, null)
 where jsonb_typeof(t.exercises) = 'array'
   and t.exercises is distinct from pg_temp.link_exercise_json(t.exercises, null, null);

-- 4d. Drafts (in-progress sessions; they carry their own coach_id).
update public.workout_drafts d
   set exercises = pg_temp.link_exercise_json(d.exercises, d.user_id, d.coach_id)
 where jsonb_typeof(d.exercises) = 'array'
   and d.exercises is distinct from pg_temp.link_exercise_json(d.exercises, d.user_id, d.coach_id);

-- 5. Report: what still resolves by name only ----------------------------------
-- Mostly exercises that live only in the app's code library
-- (src/data/exerciseLibrary.js — Calf Raise, Leg Curl, Shoulders Press …),
-- which have no table row to point at, plus free-typed names.
select 'workout_logs' as source, l.exercise_name as name, count(*) as rows
  from public.workout_logs l
 where l.exercise_id is null
 group by l.exercise_name
union all
select 'workout_plans', el->>'name', count(*)
  from public.workout_plans p, jsonb_array_elements(p.exercises) el
 where jsonb_typeof(p.exercises) = 'array' and not (el ? 'exerciseId')
 group by el->>'name'
union all
select 'workout_templates', el->>'name', count(*)
  from public.workout_templates t, jsonb_array_elements(t.exercises) el
 where jsonb_typeof(t.exercises) = 'array' and not (el ? 'exerciseId')
 group by el->>'name'
union all
select 'workout_drafts', el->>'name', count(*)
  from public.workout_drafts d, jsonb_array_elements(d.exercises) el
 where jsonb_typeof(d.exercises) = 'array' and not (el ? 'exerciseId')
 group by el->>'name'
order by 1, 3 desc;
