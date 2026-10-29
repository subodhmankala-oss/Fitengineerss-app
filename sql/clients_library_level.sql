-- The Workout Library level + Gym/Home the client is on for the home-screen
-- suggestion (NextWorkoutBanner), and the day they started that level. Each
-- level lasts 12 weeks from library_level_since, then moves up one — see
-- determineWorkoutGuidance's `pref` in src/utils/beginnerGuidance.js.
-- Written by the client (clients_update RLS already allows their own row)
-- whenever they start a program from the level picker or the home banner.
-- NULL = never chosen: the older tenure-from-first-session logic applies.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS library_level TEXT
  CHECK (library_level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS library_category TEXT
  CHECK (library_category IN ('gym', 'home'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS library_level_since DATE;
