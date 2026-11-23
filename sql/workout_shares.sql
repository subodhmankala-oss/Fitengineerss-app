-- ==========================================
-- WORKOUT SHARES (read-only link to one saved workout)
--
-- One row = one live link, /w/<token>. Deleting the row ("Stop sharing")
-- kills the link. The workout itself is NOT copied here: the link reads the
-- saved rows live, limited to session_keys (the sessions saved when it was
-- shared), so an edit shows up, a deleted workout ends the link, and another
-- workout logged later the same day is never shown.
--
-- RLS is on with NO policies: the browser can't read or write this table.
-- Owners go through api/save-user-data.js (action=workout-share), which takes
-- the owner from the verified session; visitors go through
-- api/data-read.js (resource=shared-workout), which can only read. Safe to
-- re-run.
CREATE TABLE IF NOT EXISTS public.workout_shares (
  token TEXT PRIMARY KEY CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  session_keys TEXT[] NOT NULL,
  show_name BOOLEAN NOT NULL DEFAULT true,
  show_map BOOLEAN NOT NULL DEFAULT true,
  show_weights BOOLEAN NOT NULL DEFAULT true,
  show_calories BOOLEAN NOT NULL DEFAULT true,
  -- Which body figure the muscle map draws.
  body_sex TEXT CHECK (body_sex IN ('male', 'female')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_shares_one_per_day UNIQUE (user_id, log_date)
);

-- active: false while the Share sheet is open but nothing was sent yet (the
-- preview picture is uploaded then); visitors only ever see active links.
-- preview_image: base64 JPEG chat apps show on the message.
ALTER TABLE public.workout_shares
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preview_image TEXT
    CHECK (preview_image IS NULL OR char_length(preview_image) <= 400000);

ALTER TABLE public.workout_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_shares FROM anon, authenticated;
