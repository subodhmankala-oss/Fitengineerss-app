-- Second goal / second concern (2026-10-03).
--
-- The sign-up wizard now lets a client pick up to 2 on "Select Your Program"
-- and on "Primary Concern". The FIRST pick stays in clients.program /
-- clients.primary_concern exactly as before (so the calorie target, the
-- coach and admin views and fitness_goal are unchanged); the SECOND pick is
-- stored here. Same allowed values as the existing columns' CHECK
-- constraints, NULL when only one was chosen.
--
-- Additive only — no existing row or column is changed. Run once in the
-- Supabase SQL editor; safe to re-run.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS secondary_program text,
  ADD COLUMN IF NOT EXISTS secondary_concern text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_secondary_program_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_secondary_program_check
  CHECK (secondary_program IS NULL OR secondary_program = ANY (ARRAY['fat_loss'::text, 'muscle_building'::text, 'gut_repair'::text]));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_secondary_concern_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_secondary_concern_check
  CHECK (secondary_concern IS NULL OR secondary_concern = ANY (ARRAY['bloating_constipation'::text, 'digestion_issues'::text, 'just_stay_fit'::text]));
