-- Tombstones for exercises deleted from the Admin Exercise Library.
--
-- Why: exercises defined in code (src/data/exerciseLibrary.js) are merged back
-- into every library/picker screen whenever they have no row in
-- public.exercises. Deleting the DB row therefore made the exercise reappear
-- on the next load. A name listed here is excluded from that static merge.
--
-- Names are stored lowercased. Public read (the app reads with the anon key);
-- no write policy, so writes only happen through /api/admin-write with the
-- service role after verifying the caller is the admin.
CREATE TABLE IF NOT EXISTS public.hidden_exercises (
    name TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.hidden_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to hidden_exercises" ON public.hidden_exercises;
CREATE POLICY "Allow public read access to hidden_exercises"
ON public.hidden_exercises
FOR SELECT
TO public
USING (true);
