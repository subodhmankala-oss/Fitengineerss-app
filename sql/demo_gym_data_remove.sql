-- ==========================================
-- REMOVE the sample members/workouts added by sql/demo_gym_data.sql.
--
-- Demo rows are identified by an email on the reserved, never-deliverable
-- domain @demo.fitengineers.test. Deleting the users cascades to their
-- workout_logs and coach_assignments; real accounts are never touched (no
-- real email can end in .test).
-- ==========================================
DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'client';
DELETE FROM public.users WHERE email LIKE '%@demo.fitengineers.test' AND role = 'coach';
