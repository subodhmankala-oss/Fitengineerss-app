-- ==========================================
-- Link subodhmankala@gmail.com's own coaching clients to their gym
-- "Fitengineers" (GYM-7X6P), so the /gym site shows real data.
-- On request, 2026-10-23. APPLIED to production 2026-10-23 (25 clients).
--
-- Same two updates as gym_coach_join(..., p_bring_clients => true): the
-- client's gym_id/gym_status, and the gym_id on their open coach history
-- row. Coach, plans, workouts and logins are untouched. No triggers send
-- anything.
-- ==========================================

WITH g AS (SELECT id FROM public.gyms WHERE join_code = 'GYM-7X6P'),
me AS (SELECT id FROM public.users WHERE email = 'subodhmankala@gmail.com'),
moved AS (
  UPDATE public.users u SET gym_id = (SELECT id FROM g), gym_status = 'active'
  WHERE u.role = 'client' AND u.gym_id IS NULL AND u.coach_id = (SELECT id FROM me)
  RETURNING u.id
)
UPDATE public.coach_assignments a SET gym_id = (SELECT id FROM g)
FROM moved WHERE a.client_id = moved.id AND a.ended_at IS NULL AND a.gym_id IS NULL;

-- ── UNDO (only the 25 clients linked by this script) ──
-- UPDATE public.coach_assignments SET gym_id = NULL
--   WHERE ended_at IS NULL AND client_id = ANY (:ids);
-- UPDATE public.users SET gym_id = NULL, gym_status = NULL
--   WHERE id = ANY (:ids);
-- where :ids = ARRAY[
--   'd719d377-db16-4eb6-a7fb-abd5deafc1ca','8be2c755-2b28-41fd-9c6b-bba3de98121c','1ee69964-9df4-4124-9585-09a716fe4aad',
--   'c4539bae-8234-4d53-aa41-bcd7d62e5f16','b8de60d1-def1-4cda-ac90-57db0d2b32e5','c9ec0ab8-3090-46eb-b0e3-908d2d430e14',
--   'c0fb86eb-a0be-495b-9230-71a7c9d21716','26294b77-334e-4626-9c4c-004ba5def35e','4c63ccd4-0133-4df1-b1dc-2c81c430311a',
--   '16f557ec-e729-4b7c-a604-8f54074b9c1f','f3f4f5a0-8f04-482c-9168-01a48593b8e0','0b1d3b3d-a0e3-4e2a-8ee0-a458fd0e7b95',
--   'd633ea8f-89d2-4a0a-b3cc-17f6d4a9ad7e','f595362e-00bb-49f7-a139-be65370766b5','134d5a7a-8feb-4ff5-94a1-99187b6a9f0e',
--   '544ce3ec-f284-42ba-b876-8d10ed8da2a4','bd7951c8-2ccd-4d47-b4e6-22360fdc80f6','1c3dc8d1-dd38-449f-9740-02a2256af639',
--   '3056840a-3c4d-4bd5-83c5-e0a7248c7120','9756120c-d919-4baa-ac53-b523d8cb4cae','166a6142-503a-4b48-9d9c-7447638795db',
--   '0ef80d2e-d144-4c10-86cb-b82efc26c6f7','a4cdd361-0046-4ba2-88c1-1d392fbd2dca','fb916c94-a99d-4926-badf-a8b5568da3f5',
--   '7228c5f0-c1d5-45e6-b961-cc4c2a98556e']::uuid[]
