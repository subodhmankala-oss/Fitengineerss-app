-- ==========================================
-- "CREATE WORKOUT" FLOW + SUPER-ADMIN MEDIA REVIEW QUEUE
-- Run once in the Supabase SQL editor (same manual-apply pattern as every
-- other sql/*.sql file in this repo — there is no migration runner).
--
-- Adds the columns the new Workout Library "Create Workout" flow needs
-- (category/workout_type classification, an explicit coach_id link, and the
-- media_status/media_scheduled_at pair the super-admin's Review Queue uses
-- to track "images/video not added yet"), and closes the wide-open
-- workout_plans_insert/_update policies left by sql/lock_down_reads.sql
-- (2026-08-08 — that pass only tightened SELECT on this table, "insert with
-- check (true)" / "update using (true) with check (true)" were never
-- revisited).
-- ==========================================

-- ─── 1. category / workout_type — CHECK-constrained lookup, same pattern as
--        clients.program (supabase_auth_roles_schema.sql) and
--        workout_templates.difficulty_level (supabase_generic_workout_levels.sql) ───
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.workout_plans DROP CONSTRAINT IF EXISTS workout_plans_category_check;
ALTER TABLE public.workout_plans ADD CONSTRAINT workout_plans_category_check
  CHECK (category IS NULL OR category IN ('Push', 'Pull', 'Legs', 'Full Body', 'Upper', 'Lower', 'Core'));

ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS workout_type TEXT;
ALTER TABLE public.workout_plans DROP CONSTRAINT IF EXISTS workout_plans_workout_type_check;
ALTER TABLE public.workout_plans ADD CONSTRAINT workout_plans_workout_type_check
  CHECK (workout_type IS NULL OR workout_type IN ('Strength', 'Cardio', 'HIIT', 'Mobility', 'Recovery'));

-- ─── 2. explicit coach_id — workout_plans already has user_id (the client)
--        and created_by ('coach'/'client'), but no direct FK to which coach
--        authored/owns a coach-created plan. Nullable: client-authored plans
--        leave this null. ───
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ─── 3. media_status / media_scheduled_at — super-admin's tracking pair for
--        "this plan has no images/video yet". ───
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS media_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.workout_plans DROP CONSTRAINT IF EXISTS workout_plans_media_status_check;
ALTER TABLE public.workout_plans ADD CONSTRAINT workout_plans_media_status_check
  CHECK (media_status IN ('pending', 'scheduled', 'completed'));

ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS media_scheduled_at TIMESTAMPTZ;

-- Plan-level media (the admin's "attach to whole plan" option) — separate
-- from the per-exercise `media` array embedded inside each entry of the
-- `exercises` jsonb column itself.
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS workout_plans_media_status_idx ON public.workout_plans (media_status);
CREATE INDEX IF NOT EXISTS workout_plans_coach_id_idx ON public.workout_plans (coach_id);

-- ─── 4. RLS gap fix — workout_plans_insert/_update were "true" (unrestricted)
--        since sql/lock_down_reads.sql. SELECT is already correct and is
--        left untouched:
--          user_id = current_app_user_id() OR is_my_client(user_id) OR is_super_admin()
--
--        INSERT/UPDATE: a row may only be written by the client it belongs
--        to, or by that client's assigned coach (is_my_client + coach_id
--        must match the inserting/updating coach — prevents a coach from
--        stamping coach_id = someone else's id on a client they don't own).
--        is_super_admin() is additionally allowed on UPDATE (not requested
--        in the original spec, but required for the admin review queue
--        below to be able to set media_status/media_scheduled_at on plans
--        it doesn't own — otherwise that screen cannot function). ───
DROP POLICY IF EXISTS "workout_plans_insert" ON public.workout_plans;
CREATE POLICY "workout_plans_insert" ON public.workout_plans FOR INSERT WITH CHECK (
  user_id = public.current_app_user_id()
  OR (public.is_my_client(user_id) AND coach_id = public.current_app_user_id())
);

DROP POLICY IF EXISTS "workout_plans_update" ON public.workout_plans;
CREATE POLICY "workout_plans_update" ON public.workout_plans FOR UPDATE USING (
  user_id = public.current_app_user_id()
  OR (public.is_my_client(user_id) AND coach_id = public.current_app_user_id())
  OR public.is_super_admin()
) WITH CHECK (
  user_id = public.current_app_user_id()
  OR (public.is_my_client(user_id) AND coach_id = public.current_app_user_id())
  OR public.is_super_admin()
);

-- ─── 5. Storage bucket for the super-admin's per-exercise/per-plan media
--        uploads. Public read (media is shown to clients once attached),
--        writes restricted to super-admin only — unlike the older
--        exercise-videos bucket (anon-key writes, pre-real-auth), uploads
--        here are sent with the uploading user's real session bearer token
--        (see databaseService.uploadWorkoutMedia), so is_super_admin()'s
--        auth.uid() check actually has something to check. ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-media', 'workout-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "workout_media_insert" ON storage.objects;
CREATE POLICY "workout_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'workout-media' AND public.is_super_admin());

DROP POLICY IF EXISTS "workout_media_read" ON storage.objects;
CREATE POLICY "workout_media_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'workout-media');

DROP POLICY IF EXISTS "workout_media_delete" ON storage.objects;
CREATE POLICY "workout_media_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'workout-media' AND public.is_super_admin());
