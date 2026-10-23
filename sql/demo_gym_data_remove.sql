-- ==========================================
-- REMOVE the sample members/workouts added by sql/demo_gym_data.sql.
--
-- Demo rows are identified by an email on the reserved, never-deliverable
-- domain @demo.fitengineers.test. Deleting the users cascades to their
-- workout_logs and coach_assignments; real accounts are never touched (no
-- real email can end in .test). Their plans, payments, check-ins, trainer
-- days and high-fives (sql/demo_gym_business.sql) cascade too; demo leads
-- are not linked to a user, so they go by their reserved phone range.
-- ==========================================
DELETE FROM public.gym_leads WHERE phone LIKE '+91900004%'
  AND gym_id = (SELECT id FROM public.gyms WHERE join_code = 'GYM-QFAP');
DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'client';
DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'coach';
