-- Rollback for sql/gym_owner_finish.sql.
DROP FUNCTION IF EXISTS public.gym_message_sent(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.gym_save_upi(uuid, text);
DROP TABLE IF EXISTS public.gym_message_log;
ALTER TABLE public.gym_settings DROP COLUMN IF EXISTS upi_id;
