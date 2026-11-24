-- The weekdays a self-guided client chose to train on (0 = Monday … 6 =
-- Sunday) and the day they chose them — see src/utils/weekPlan.js. Written by
-- the client (clients_update RLS already allows their own row) from Home's
-- "Make my plan" / "Change days". NULL = never chosen: Mon, Wed, Sat.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS library_days SMALLINT[]
  CHECK (library_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS library_days_since DATE;
