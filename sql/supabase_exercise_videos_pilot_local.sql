-- ==========================================
-- EXERCISE LIBRARY VIDEOS — PILOT BATCH 1 (local files, zero content risk)
-- Paste into Supabase SQL Editor and run once.
--
-- These 16 exercises already have a real, existing video file sitting in
-- public/videos/ (verified by filename-to-exercise-name matching against
-- src/data/exerciseLibrary.js) — this just wires the exercises.video_url
-- column to point at each one. No new video content, no web search, no
-- judgment call about correctness: these files were already deliberately
-- placed in the repo for these specific exercises before this admin flow
-- existed (6 were already used by the original seedExerciseLibrary()
-- presets; this covers the other 10 that weren't wired up yet).
--
-- The admin Exercise Library screen shows a green "📹 MP4" badge for these
-- (distinct from the red "📺 YouTube" badge), confirmed via
-- src/components/AdminExerciseLibrary.jsx's hasVideo/isYouTube logic.
-- ==========================================

UPDATE public.exercises SET video_url = '/videos/barbell-squat.mp4' WHERE name = 'Barbell Squat';
UPDATE public.exercises SET video_url = '/videos/biceps-curls.mp4' WHERE name = 'Biceps Curls';
UPDATE public.exercises SET video_url = '/videos/cable-crossover.mp4' WHERE name = 'Cable Crossover';
UPDATE public.exercises SET video_url = '/videos/dumbbell-lateral-raises.mp4' WHERE name = 'Dumbbell Lateral Raises';
UPDATE public.exercises SET video_url = '/videos/flat-bench-press.mp4' WHERE name = 'Flat Bench Press';
UPDATE public.exercises SET video_url = '/videos/hammer-curls.mp4' WHERE name = 'Hammer Curls';
UPDATE public.exercises SET video_url = '/videos/hanging-leg-raises.mp4' WHERE name = 'Hanging Leg Raises';
UPDATE public.exercises SET video_url = '/videos/incline-dumbbell-press.mp4' WHERE name = 'Incline Dumbbell Press';
UPDATE public.exercises SET video_url = '/videos/lat-pull-down.mp4' WHERE name = 'Lat Pull Down';
UPDATE public.exercises SET video_url = '/videos/leg-extensions.mp4' WHERE name = 'Leg Extensions';
UPDATE public.exercises SET video_url = '/videos/one-arm-row.mp4' WHERE name = 'One Arm Row';
UPDATE public.exercises SET video_url = '/videos/overhead-triceps-extension.mp4' WHERE name = 'Overhead Triceps Extension';
UPDATE public.exercises SET video_url = '/videos/plank.mp4' WHERE name = 'Plank';
UPDATE public.exercises SET video_url = '/videos/pull-ups.mp4' WHERE name = 'Pull-ups';
UPDATE public.exercises SET video_url = '/videos/romanian-deadlift.mp4' WHERE name = 'Romanian Deadlift';
UPDATE public.exercises SET video_url = '/videos/shoulders-press.mp4' WHERE name = 'Shoulders Press';
