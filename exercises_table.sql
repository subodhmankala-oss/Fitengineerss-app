-- SQL Schema Migration: Exercises Table, Admin Write Functions, Videos Storage
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR
-- REPLACE throughout, since this table may already exist in the live project.
--
-- WRITE MODEL (important):
-- This app's coach/admin login is localStorage-based and does NOT create a
-- Supabase Auth session, so there is no auth.jwt() for an RLS policy to
-- check. Every privileged write in this app therefore goes through a
-- SECURITY DEFINER function called with the anon key (see
-- sql/link_coach_and_enter_transaction.sql for the established pattern).
-- Exercise writes follow the same model: the table denies ALL direct writes,
-- and only the save_exercise / admin_seed_exercises functions below can
-- modify it. Those functions carry a lightweight admin-email guard. This
-- guard is asserted by the client, not cryptographically verified (the app
-- has no verifiable session) — it matches the app's existing anon-key trust
-- model and blocks casual misuse of a low-sensitivity content table.

-- 1. Create Exercises Table
CREATE TABLE IF NOT EXISTS public.exercises (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    primary_muscle TEXT NOT NULL,
    secondary_muscle TEXT,
    video_url TEXT,
    setup TEXT,
    execution TEXT,
    tip TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS) on Exercises
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies for Exercises
-- Read access is public (not gated on `authenticated`): the app reads this
-- table via a raw PostgREST fetch using only the anon key (see restSelect()
-- in databaseService.js — the app-wide workaround for a Supabase JS SDK
-- hang bug), which authenticates as the `anon` role. Exercise catalog data
-- (names/instructions/video links) isn't sensitive, so public read is fine.
DROP POLICY IF EXISTS "Allow public read access to exercises" ON public.exercises;
CREATE POLICY "Allow public read access to exercises"
ON public.exercises
FOR SELECT
TO public
USING (true);

-- No write policy is defined on purpose: with RLS enabled and no permissive
-- INSERT/UPDATE/DELETE policy, all DIRECT writes are denied for every role.
-- Writes happen only through the SECURITY DEFINER functions below, which run
-- as the function owner and bypass RLS. (Drop the old direct-write policy in
-- case a previous version of this migration created it.)
DROP POLICY IF EXISTS "Allow admin write access to exercises" ON public.exercises;

-- 3. Admin write functions (SECURITY DEFINER)

-- Upsert a single exercise. Insert when p_exercise->>'id' is null/empty,
-- update by id otherwise. Returns the resulting row.
CREATE OR REPLACE FUNCTION public.save_exercise(p_exercise jsonb, p_admin_email text DEFAULT NULL)
RETURNS public.exercises
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id  uuid;
  v_row public.exercises;
BEGIN
  IF p_admin_email IS NULL
     OR lower(trim(p_admin_email)) <> 'subodhmankala@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to modify the exercise library.';
  END IF;

  v_id := NULLIF(p_exercise->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.exercises
      (name, category, primary_muscle, secondary_muscle, video_url, setup, execution, tip)
    VALUES (
      p_exercise->>'name',
      p_exercise->>'category',
      p_exercise->>'primary_muscle',
      COALESCE(p_exercise->>'secondary_muscle', ''),
      COALESCE(p_exercise->>'video_url', ''),
      COALESCE(p_exercise->>'setup', ''),
      COALESCE(p_exercise->>'execution', ''),
      COALESCE(p_exercise->>'tip', '')
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.exercises SET
      name             = p_exercise->>'name',
      category         = p_exercise->>'category',
      primary_muscle   = p_exercise->>'primary_muscle',
      secondary_muscle = COALESCE(p_exercise->>'secondary_muscle', ''),
      video_url        = COALESCE(p_exercise->>'video_url', ''),
      setup            = COALESCE(p_exercise->>'setup', ''),
      execution        = COALESCE(p_exercise->>'execution', ''),
      tip              = COALESCE(p_exercise->>'tip', '')
    WHERE id = v_id
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Exercise not found for id %', v_id;
    END IF;
  END IF;

  RETURN v_row;
END;
$function$;

-- Bulk cold-start seed: insert each exercise in the array that doesn't
-- already exist (by name). Used by databaseService.seedExerciseLibrary()
-- only when the table is empty. Returns the number of rows inserted.
CREATE OR REPLACE FUNCTION public.admin_seed_exercises(p_exercises jsonb, p_admin_email text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item    jsonb;
  v_inserted integer := 0;
BEGIN
  IF p_admin_email IS NULL
     OR lower(trim(p_admin_email)) <> 'subodhmankala@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to seed the exercise library.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.exercises
      (name, category, primary_muscle, secondary_muscle, video_url, setup, execution, tip)
    VALUES (
      v_item->>'name',
      v_item->>'category',
      v_item->>'primary_muscle',
      COALESCE(v_item->>'secondary_muscle', ''),
      COALESCE(v_item->>'video_url', ''),
      COALESCE(v_item->>'setup', ''),
      COALESCE(v_item->>'execution', ''),
      COALESCE(v_item->>'tip', '')
    )
    ON CONFLICT (name) DO NOTHING;
    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- The app calls these with the anon key (via restRpc), so anon must be
-- allowed to EXECUTE them. Authorization is enforced inside the functions.
GRANT EXECUTE ON FUNCTION public.save_exercise(jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_seed_exercises(jsonb, text) TO anon, authenticated;

-- 4. Storage Bucket for Exercise Videos
-- Create a public storage bucket for exercise video uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-videos', 'exercise-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for the public bucket
-- Public read access to files inside 'exercise-videos'
DROP POLICY IF EXISTS "Allow public read access to videos" ON storage.objects;
CREATE POLICY "Allow public read access to videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'exercise-videos');

-- Uploads to this bucket use the anon key (the admin video upload in
-- databaseService.uploadExerciseVideo posts with the anon key, since the
-- app has no auth session to attach). Scope the write to this one bucket.
DROP POLICY IF EXISTS "Allow admins to upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to exercise-videos" ON storage.objects;
CREATE POLICY "Allow uploads to exercise-videos"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'exercise-videos');

DROP POLICY IF EXISTS "Allow admins to delete/update videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to exercise-videos" ON storage.objects;
CREATE POLICY "Allow updates to exercise-videos"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'exercise-videos')
WITH CHECK (bucket_id = 'exercise-videos');
