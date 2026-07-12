-- SQL Schema Migration: Exercises Table and Videos Storage

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

-- 2. Create RLS Policies for Exercises
-- Allow public select (anyone logged in can view the exercise list and guides)
CREATE POLICY "Allow public read access to exercises" 
ON public.exercises 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow admins full write access to exercises
CREATE POLICY "Allow admin write access to exercises" 
ON public.exercises 
FOR ALL 
TO authenticated 
USING (
    auth.jwt() ->> 'email' IN ('subodhmankala@gmail.com', 'manohar.mankala@gmail.com')
)
WITH CHECK (
    auth.jwt() ->> 'email' IN ('subodhmankala@gmail.com', 'manohar.mankala@gmail.com')
);

-- 3. Storage Bucket for Exercise Videos
-- Create a public storage bucket for exercise video uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('exercise-videos', 'exercise-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for the public bucket
-- Allow public read access to files inside 'exercise-videos'
CREATE POLICY "Allow public read access to videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'exercise-videos');

-- Allow admins to upload videos to the bucket
CREATE POLICY "Allow admins to upload videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'exercise-videos' AND
    (auth.jwt() ->> 'email') IN ('subodhmankala@gmail.com', 'manohar.mankala@gmail.com')
);

-- Allow admins to delete/update videos in the bucket
CREATE POLICY "Allow admins to delete/update videos"
ON storage.objects
FOR ALL
TO authenticated
USING (
    bucket_id = 'exercise-videos' AND
    (auth.jwt() ->> 'email') IN ('subodhmankala@gmail.com', 'manohar.mankala@gmail.com')
);
