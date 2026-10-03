-- Second goal (2026-10-03).
--
-- The sign-up wizard's "Select Your Program" step now lets a client pick up
-- to 2 goals. The FIRST pick stays in clients.program exactly as before (so
-- the calorie target, fitness_goal and every coach/admin view are
-- unchanged); the SECOND pick is stored here. Same allowed values as the
-- clients_program_check constraint, NULL when only one was chosen.
--
-- (The "Primary Concern" step was removed from the wizard the same day —
-- nothing in the app ever read clients.primary_concern. The column and its
-- existing answers are left in place.)
--
-- Additive only — no existing row or column is changed. Run once in the
-- Supabase SQL editor; safe to re-run.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS secondary_program text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_secondary_program_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_secondary_program_check
  CHECK (secondary_program IS NULL OR secondary_program = ANY (ARRAY['fat_loss'::text, 'muscle_building'::text, 'gut_repair'::text]));
