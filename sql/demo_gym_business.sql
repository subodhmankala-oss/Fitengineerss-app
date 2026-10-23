-- ==========================================
-- SAMPLE business data for the /gym owner site (2026-10-23, on request:
-- "refresh the Test Gym demo data so ... every tile shows real numbers").
--
-- Run AFTER sql/demo_gym_data.sql (that one recreates the demo members, so
-- their ids change and any older rows below cascade away with them).
-- Fills Test Gym (GYM-QFAP) with plans + payments, today's check-ins,
-- leads, trainer days in/off and member high-fives. Dates are relative to
-- "today" in India time, so re-running refreshes them.
--
-- Only demo rows are touched: members/trainers are found by their
-- @demo.fitengineers.test email; demo leads use the reserved phone range
-- +91900004xxxx. Remove with sql/demo_gym_data_remove.sql.
-- ==========================================

DO $demo$
DECLARE
  v_gym UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_month DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  -- member key, plan name, plan start (days ago), amount paid, paid (days ago), method
  v_plans JSONB := '[
    {"key":"ravi",    "plan":"PT · 12 sessions", "start":30,  "paid":9000,  "paidAgo":3,   "method":"upi"},
    {"key":"neha",    "plan":"PT · 12 sessions", "start":10,  "paid":5000,  "paidAgo":10,  "method":"upi"},
    {"key":"rahul",   "plan":"Quarterly",        "start":0,   "paid":8400,  "paidAgo":0,   "method":"card"},
    {"key":"faisal",  "plan":"Monthly",          "start":3,   "paid":1500,  "paidAgo":3,   "method":"cash"},
    {"key":"kiran",   "plan":"Quarterly",        "start":85,  "paid":8400,  "paidAgo":85,  "method":"upi"},
    {"key":"arjun",   "plan":"Monthly",          "start":29,  "paid":3000,  "paidAgo":29,  "method":"upi"},
    {"key":"meena",   "plan":"Half-yearly",      "start":60,  "paid":15000, "paidAgo":60,  "method":"card"},
    {"key":"pooja",   "plan":"Monthly",          "start":34,  "paid":3000,  "paidAgo":34,  "method":"cash"},
    {"key":"divya",   "plan":"Monthly",          "start":40,  "paid":3000,  "paidAgo":40,  "method":"upi"},
    {"key":"anil",    "plan":"Monthly",          "start":70,  "paid":3000,  "paidAgo":70,  "method":"upi"},
    {"key":"sandeep", "plan":"Monthly",          "start":100, "paid":3000,  "paidAgo":100, "method":"cash"}
  ]';
  -- member key, minutes ago they came in, minutes ago they left (null = still inside)
  v_checkins JSONB := '[
    {"key":"ravi","in":35,"out":null},{"key":"kiran","in":20,"out":null},{"key":"neha","in":50,"out":null},
    {"key":"arjun","in":300,"out":230},{"key":"meena","in":420,"out":360},{"key":"rahul","in":540,"out":480},
    {"key":"pooja","in":200,"out":140}
  ]';
  v_leads JSONB := '[
    {"n":1,"name":"Priya Sharma",  "source":"instagram","stage":"new",          "note":"Wants weight loss, evenings","ago":0},
    {"n":2,"name":"Rohan Das",     "source":"google",   "stage":"new",          "note":"Asked about PT prices","ago":1},
    {"n":3,"name":"Sneha Iyer",    "source":"walk-in",  "stage":"new",          "note":null,"ago":2},
    {"n":4,"name":"Karthik Rao",   "source":"referral", "stage":"trial_booked", "note":"Friend of Ravi","ago":3,"trial":1},
    {"n":5,"name":"Ayesha Khan",   "source":"instagram","stage":"trial_booked", "note":null,"ago":2,"trial":0},
    {"n":6,"name":"Vivek Pillai",  "source":"walk-in",  "stage":"trial_done",   "note":"Liked the morning batch","ago":6,"trial":-2},
    {"n":7,"name":"Ananya Gupta",  "source":"referral", "stage":"joined",       "note":null,"ago":12,"trial":-9,"joined":7},
    {"n":8,"name":"Manoj Kumar",   "source":"google",   "stage":"joined",       "note":null,"ago":18,"trial":-15,"joined":12}
  ]';
  m JSONB;
  v_member UUID;
  v_plan RECORD;
  v_ms UUID;
  v_start DATE;
  v_asha UUID;
  v_vikram UUID;
  d DATE;
BEGIN
  SELECT id INTO v_gym FROM public.gyms WHERE join_code = 'GYM-QFAP';
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'Test Gym (GYM-QFAP) not found — nothing to fill.';
  END IF;
  SELECT id INTO v_asha FROM public.users WHERE email = 'demo.asha@demo.fitengineers.test';
  SELECT id INTO v_vikram FROM public.users WHERE email = 'demo.vikram@demo.fitengineers.test';
  IF v_asha IS NULL OR v_vikram IS NULL THEN
    RAISE EXCEPTION 'Demo trainers missing — run sql/demo_gym_data.sql first.';
  END IF;

  -- Clear earlier sample rows (members' rows also cascade when demo_gym_data.sql reruns)
  DELETE FROM public.gym_leads WHERE gym_id = v_gym AND phone LIKE '+91900004%';
  DELETE FROM public.gym_payments WHERE member_id IN (SELECT id FROM public.users WHERE email LIKE '%@demo.fitengineers.test');
  DELETE FROM public.gym_memberships WHERE member_id IN (SELECT id FROM public.users WHERE email LIKE '%@demo.fitengineers.test');
  DELETE FROM public.gym_checkins WHERE member_id IN (SELECT id FROM public.users WHERE email LIKE '%@demo.fitengineers.test');
  DELETE FROM public.gym_high_fives WHERE member_id IN (SELECT id FROM public.users WHERE email LIKE '%@demo.fitengineers.test');
  DELETE FROM public.gym_trainer_days WHERE trainer_id IN (v_asha, v_vikram);

  -- Plans + payments
  FOR m IN SELECT * FROM jsonb_array_elements(v_plans) LOOP
    SELECT id INTO v_member FROM public.users WHERE email = 'demo.' || (m->>'key') || '@demo.fitengineers.test';
    SELECT id, name, months, sessions, price_inr INTO v_plan FROM public.gym_plans WHERE gym_id = v_gym AND name = m->>'plan' LIMIT 1;
    IF v_member IS NULL OR v_plan.id IS NULL THEN CONTINUE; END IF;
    v_start := v_today - (m->>'start')::int;
    INSERT INTO public.gym_memberships (gym_id, member_id, plan_id, plan_name, starts_on, ends_on, price_inr, is_pt)
    VALUES (v_gym, v_member, v_plan.id, v_plan.name, v_start,
            (v_start + (v_plan.months || ' months')::interval - interval '1 day')::date,
            v_plan.price_inr, v_plan.sessions IS NOT NULL)
    RETURNING id INTO v_ms;
    INSERT INTO public.gym_payments (gym_id, member_id, membership_id, amount_inr, method, paid_on)
    VALUES (v_gym, v_member, v_ms, (m->>'paid')::int, m->>'method', v_today - (m->>'paidAgo')::int);
  END LOOP;

  -- Today's check-ins (3 still inside)
  FOR m IN SELECT * FROM jsonb_array_elements(v_checkins) LOOP
    SELECT id INTO v_member FROM public.users WHERE email = 'demo.' || (m->>'key') || '@demo.fitengineers.test';
    IF v_member IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.gym_checkins (gym_id, member_id, in_at, out_at)
    VALUES (v_gym, v_member, now() - ((m->>'in')::int || ' minutes')::interval,
            CASE WHEN m->>'out' IS NULL THEN NULL ELSE now() - ((m->>'out')::int || ' minutes')::interval END);
  END LOOP;

  -- Leads across every stage
  FOR m IN SELECT * FROM jsonb_array_elements(v_leads) LOOP
    INSERT INTO public.gym_leads (gym_id, name, phone, source, note, stage, trial_at, joined_at, created_at)
    VALUES (
      v_gym, m->>'name', '+91900004' || lpad(m->>'n', 4, '0'), m->>'source', m->>'note', m->>'stage',
      CASE WHEN m->>'trial' IS NULL THEN NULL
           ELSE ((v_today + (m->>'trial')::int)::text || ' 18:30')::timestamp AT TIME ZONE 'Asia/Kolkata' END,
      CASE WHEN m->>'joined' IS NULL THEN NULL ELSE now() - ((m->>'joined')::int || ' days')::interval END,
      now() - ((m->>'ago')::int || ' days')::interval
    );
  END LOOP;

  -- Trainer days this month: Asha in Mon–Sat, Vikram misses most Wednesdays and is off today
  FOR d IN SELECT generate_series(v_month, v_today, interval '1 day')::date LOOP
    IF EXTRACT(ISODOW FROM d) < 7 THEN
      INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source)
      VALUES (v_gym, v_asha, d, 'in', 'auto');
    END IF;
    IF d = v_today THEN
      INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source)
      VALUES (v_gym, v_vikram, d, 'off', 'trainer');
    ELSIF EXTRACT(ISODOW FROM d) NOT IN (3, 7) THEN
      INSERT INTO public.gym_trainer_days (gym_id, trainer_id, day, status, source)
      VALUES (v_gym, v_vikram, d, 'in', 'auto');
    END IF;
  END LOOP;

  -- High-fives from members to their trainer on days they trained this month
  INSERT INTO public.gym_high_fives (gym_id, member_id, trainer_id, day)
  SELECT DISTINCT v_gym, u.id, u.coach_id, w.log_date
  FROM public.users u
  JOIN public.workout_logs w ON w.user_id = u.id
  WHERE u.email IN ('demo.ravi@demo.fitengineers.test', 'demo.neha@demo.fitengineers.test',
                    'demo.arjun@demo.fitengineers.test', 'demo.kiran@demo.fitengineers.test')
    AND u.coach_id IS NOT NULL
    AND w.log_date >= v_month
    AND abs(hashtext(u.email || w.log_date::text)) % 2 = 0
  ON CONFLICT DO NOTHING;
END
$demo$;
