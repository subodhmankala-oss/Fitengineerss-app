-- Rollback for sql/gym_expenses.sql (drops every expense the owners entered).
DROP FUNCTION IF EXISTS public.gym_expense_action(uuid, text, uuid, text, integer, date, text, boolean);
DROP TABLE IF EXISTS public.gym_expenses;
