-- Rollback for sql/gym_board_link.sql. Every shared board link stops working.
DROP FUNCTION IF EXISTS public.gym_reset_board_token(uuid);
DROP INDEX IF EXISTS public.gyms_board_token_key;
ALTER TABLE public.gyms DROP COLUMN IF EXISTS board_token;
