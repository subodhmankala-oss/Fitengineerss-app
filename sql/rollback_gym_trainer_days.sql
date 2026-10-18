-- Rollback for sql/gym_trainer_days.sql.
DROP FUNCTION IF EXISTS public.gym_high_five(uuid);
DROP FUNCTION IF EXISTS public.gym_owner_mark_day(uuid, uuid, date, text);
DROP FUNCTION IF EXISTS public.gym_trainer_set_today(uuid, boolean);
DROP FUNCTION IF EXISTS public.gym_trainer_touch(uuid);
DROP TABLE IF EXISTS public.gym_high_fives;
DROP TABLE IF EXISTS public.gym_trainer_days;
