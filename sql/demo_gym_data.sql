-- ==========================================
-- SAMPLE DATA for the gym owner's My Gym screens (2026-10-16, on request:
-- "add the demo gym with sample data").
--
-- STATUS: APPLIED to production 2026-10-16; regenerated the same day to
-- cover 12 weeks (the member profile chart shows 12). Remove with
-- sql/demo_gym_data_remove.sql.
--
-- Fills "Test Gym" (GYM-QFAP, owner testgymowner@fitengineers.com) with:
--   * 2 trainers and 12 members covering every member-health state
--     (thriving, steady, slipping, gone quiet, hasn't started, new), one
--     member who trains on their own, one waiting for a trainer
--   * 12 weeks of realistic workouts per member (never before they joined;
--     evening-heavy so the busiest-times grid has a clear shape), with
--     coaching history
-- Dates are relative to "today" in India time, so re-running refreshes them
-- (it removes the previous sample rows first).
--
-- Deliberately NOT created: auth accounts (nobody can log in as them), and
-- rows in `clients` / `coaches` — the scheduled nudge/reminder jobs and the
-- admin client lists key off those, so the sample members can never be
-- emailed, pushed, or counted in platform stats. Every sample row has an
-- email ending @demo.fitengineers.test; sql/demo_gym_data_remove.sql
-- deletes them all.
-- ==========================================

DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'client';
DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'coach';

DO $demo$
DECLARE
  v_gym UUID;
  v_owner UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_trainers JSONB := '[
    {"key":"asha","name":"Asha Reddy","phone":"+919000020001","joined":150,"login":0},
    {"key":"vikram","name":"Vikram Rao","phone":"+919000020002","joined":120,"login":4}
  ]';
  -- weeks: 12 entries, workouts per week, OLDEST -> NEWEST (the last entry is
  -- the current 7 days; the last 8 are what the gym trend chart shows).
  -- pref: preferred ISO weekdays (1=Mon). at: usual time (IST).
  v_members JSONB := '[
    {"key":"ravi","name":"Ravi Kumar","phone":"+919000030001","trainer":"asha","joined":95,"login":0,"at":"06:45","level":"i","pref":[1,3,5,6,2,4,7],"weeks":[1,2,2,2,2,3,3,4,4,4,4,4]},
    {"key":"kiran","name":"Kiran Shetty","phone":"+919000030002","trainer":"asha","joined":80,"login":1,"at":"18:15","level":"i","pref":[2,4,6,1,3,5,7],"weeks":[3,3,2,3,3,3,3,3,4,3,4,3]},
    {"key":"neha","name":"Neha Joshi","phone":"+919000030003","trainer":"vikram","joined":70,"login":0,"at":"18:40","level":"i","pref":[1,3,5,2,4,6,7],"weeks":[1,2,2,2,2,2,3,3,3,4,4,4]},
    {"key":"arjun","name":"Arjun Mehta","phone":"+919000030004","trainer":"asha","joined":62,"login":1,"at":"19:10","level":"i","pref":[2,4,5,6,1,3,7],"weeks":[0,0,1,1,1,2,3,3,3,3,4,4]},
    {"key":"meena","name":"Meena Rao","phone":"+919000030005","trainer":"asha","joined":88,"login":2,"at":"12:30","level":"b","pref":[1,3,5,2,4,6,7],"weeks":[2,1,2,1,2,1,2,1,2,1,2,1]},
    {"key":"pooja","name":"Pooja Nair","phone":"+919000030006","trainer":"vikram","joined":58,"login":3,"at":"17:30","level":"b","pref":[2,4,6,1,3,5,7],"weeks":[1,1,2,1,1,2,1,2,1,2,1,1]},
    {"key":"rahul","name":"Rahul Verma","phone":"+919000030007","trainer":"vikram","joined":49,"login":1,"at":"07:15","level":"b","pref":[1,4,6,2,3,5,7],"weeks":[1,2,1,1,2,1,1,2,1,2,1,2]},
    {"key":"divya","name":"Divya Prakash","phone":"+919000030008","trainer":"asha","joined":75,"login":6,"at":"18:30","level":"b","pref":[1,3,5,2,4,6,7],"weeks":[2,3,3,3,3,3,3,3,3,2,1,0],"moved":true},
    {"key":"anil","name":"Anil Thomas","phone":"+919000030009","trainer":"vikram","joined":66,"login":8,"at":"19:00","level":"b","pref":[2,4,6,1,3,5,7],"weeks":[2,2,2,2,2,2,2,2,1,1,1,0]},
    {"key":"sandeep","name":"Sandeep Menon","phone":"+919000030010","trainer":"vikram","joined":100,"login":20,"at":"17:45","level":"b","pref":[1,3,5,2,4,6,7],"weeks":[2,2,2,2,2,2,2,2,1,0,0,0]},
    {"key":"lakshmi","name":"Lakshmi Gowda","phone":"+919000030011","trainer":null,"self":true,"joined":40,"login":null,"at":"18:00","level":"b","pref":[1,3,5,2,4,6,7],"weeks":[0,0,0,0,0,0,0,0,0,0,0,0]},
    {"key":"faisal","name":"Faisal Khan","phone":"+919000030012","trainer":null,"self":false,"joined":3,"login":2,"at":"18:00","level":"b","pref":[1,3,5,2,4,6,7],"weeks":[0,0,0,0,0,0,0,0,0,0,0,0]}
  ]';
  -- plan -> exercises [name, base kg (0 = bodyweight), reps]
  v_plans JSONB := '{
    "b": {
      "names": ["Beginner Full Body A","Beginner Full Body B","Beginner Lower & Core"],
      "Beginner Full Body A": [["Goblet Squat",12,12],["Push-up",0,10],["Dumbbell Row",10,12],["Plank",0,1]],
      "Beginner Full Body B": [["Romanian Deadlift (Dumbbell)",12,10],["Overhead Press (Dumbbell)",6,10],["Lat Pulldown",25,12],["Glute Bridge",0,15]],
      "Beginner Lower & Core": [["Leg Press",40,12],["Walking Lunges",8,10],["Hamstring Curl",20,12],["Dead Bug",0,10]]
    },
    "i": {
      "names": ["Intermediate Push","Intermediate Pull","Intermediate Legs"],
      "Intermediate Push": [["Bench Press",50,8],["Overhead Press (Dumbbell)",14,10],["Incline Dumbbell Press",18,10],["Triceps Pushdown",25,12],["Lateral Raise",6,15]],
      "Intermediate Pull": [["Barbell Row",45,8],["Lat Pulldown",45,10],["Seated Cable Row",40,12],["Face Pull",20,15],["Dumbbell Curl",10,12]],
      "Intermediate Legs": [["Back Squat",60,8],["Romanian Deadlift",50,10],["Leg Press",90,12],["Leg Curl",30,12],["Calf Raise",40,15]]
    }
  }';
  m JSONB;
  v_id UUID;
  v_coach UUID;
  v_ids JSONB := '{}';
  w INT;
  n INT;
  dt DATE;
  k INT;
  s INT;
  e JSONB;
  v_plan TEXT;
  v_names JSONB;
  v_session INT;
  v_row INT;
  v_sets_ts TIMESTAMPTZ;
  v_dows INT[];
BEGIN
  SELECT id, owner_id INTO v_gym, v_owner FROM public.gyms WHERE join_code = 'GYM-QFAP';
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'Test Gym (GYM-QFAP) not found — nothing to fill.';
  END IF;

  -- Trainers
  FOR m IN SELECT * FROM jsonb_array_elements(v_trainers) LOOP
    INSERT INTO public.users (email, full_name, role, phone, verified, gym_id, gym_status, created_at, last_login)
    VALUES (
      'demo.' || (m->>'key') || '@demo.fitengineers.test', m->>'name', 'coach', m->>'phone', true,
      v_gym, 'active', now() - ((m->>'joined')::int || ' days')::interval,
      CASE WHEN m->>'login' IS NULL THEN NULL ELSE now() - ((m->>'login')::int || ' days')::interval END
    ) RETURNING id INTO v_id;
    v_ids := v_ids || jsonb_build_object(m->>'key', v_id);
  END LOOP;

  -- Members, coaching history, workouts
  FOR m IN SELECT * FROM jsonb_array_elements(v_members) LOOP
    v_coach := CASE WHEN m->>'trainer' IS NULL THEN NULL ELSE (v_ids->>(m->>'trainer'))::uuid END;
    INSERT INTO public.users (email, full_name, role, phone, verified, payment_status, coach_id, gym_id, gym_status, gym_self_guided, created_at, last_login)
    VALUES (
      'demo.' || (m->>'key') || '@demo.fitengineers.test', m->>'name', 'client', m->>'phone', true, 'active',
      v_coach, v_gym, 'active', COALESCE((m->>'self')::boolean, false),
      now() - ((m->>'joined')::int || ' days')::interval,
      CASE WHEN m->>'login' IS NULL THEN NULL ELSE now() - ((m->>'login')::int || ' days')::interval END
    ) RETURNING id INTO v_id;

    IF v_coach IS NOT NULL THEN
      IF COALESCE((m->>'moved')::boolean, false) THEN
        -- previously with the other trainer, moved by the gym owner 3 weeks ago
        INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at, ended_at)
        VALUES (v_id, (v_ids->>'vikram')::uuid, v_gym, NULL, 'invite_code', now() - ((m->>'joined')::int || ' days')::interval, now() - interval '21 days');
        INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at)
        VALUES (v_id, v_coach, v_gym, v_owner, 'owner_assign', now() - interval '21 days');
      ELSE
        INSERT INTO public.coach_assignments (client_id, coach_id, gym_id, assigned_by, source, started_at)
        VALUES (v_id, v_coach, v_gym, NULL, 'invite_code', now() - ((m->>'joined')::int || ' days')::interval);
      END IF;
    END IF;

    v_names := v_plans->(m->>'level')->'names';
    v_dows := ARRAY(SELECT jsonb_array_elements_text(m->'pref')::int);
    v_session := 0;

    FOR w IN 0..11 LOOP
      -- weeks array is oldest -> newest; w = 0 is the current 7 days
      n := (m->'weeks'->>(11 - w))::int;
      EXIT WHEN n IS NULL;
      -- the n preferred weekdays that fall inside this 7-day block
      FOR dt IN
        SELECT d FROM (
          SELECT (v_today - (w * 7 + o))::date AS d FROM generate_series(0, 6) o
          -- never a workout before the member joined
          WHERE (v_today - (w * 7 + o)) >= (v_today - (m->>'joined')::int)
        ) days
        ORDER BY COALESCE(array_position(v_dows, EXTRACT(ISODOW FROM d)::int), 99), d
        LIMIT n
      LOOP
        v_plan := v_names->>(v_session % 3);
        v_session := v_session + 1;
        v_row := 0;
        v_sets_ts := ((dt::text || ' ' || (m->>'at'))::timestamp
                      + ((abs(hashtext((m->>'key') || dt::text)) % 25) || ' minutes')::interval) AT TIME ZONE 'Asia/Kolkata';
        FOR e IN SELECT * FROM jsonb_array_elements(v_plans->(m->>'level')->v_plan) LOOP
          FOR s IN 1..3 LOOP
            v_row := v_row + 1;
            INSERT INTO public.workout_logs (user_id, log_date, exercise_name, set_number, reps, weight_kg, plan_name, session_id, session_row, created_at, calories_burned)
            VALUES (
              v_id, dt, e->>0, s, (e->>2)::int,
              CASE WHEN (e->>1)::numeric = 0 THEN 0
                   ELSE (e->>1)::numeric + (CASE WHEN m->>'level' = 'i' THEN 2.5 ELSE 1 END) * floor((11 - w) / 4.0) END,
              v_plan, 'demo-' || (m->>'key') || '-' || dt::text, v_row,
              v_sets_ts + (v_row * interval '90 seconds'),
              -- session total on every row, like the app saves it (Live board)
              CASE WHEN m->>'level' = 'i' THEN 200 + abs(hashtext((m->>'key') || dt::text)) % 130
                   ELSE 120 + abs(hashtext((m->>'key') || dt::text)) % 90 END
            );
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END
$demo$;
