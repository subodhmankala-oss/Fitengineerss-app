-- ==========================================
-- RECOMPUTE CALORIE/PROTEIN/CARB/FAT TARGETS (existing clients)
-- Paste this script into the Supabase SQL Editor and run once.
--
-- Superseded an earlier version of this same fix: the original bug was
-- protein scaling off raw bodyweight (a 93.5kg/170cm/39yo "Fat Loss" client
-- was getting 205g/day). The fix now calibrates the whole formula to match
-- calculator.net's "Balanced" macro calculator output (verified to the exact
-- gram against two independent real test cases), which also revised the
-- calorie formula itself.
--
-- CORRECTED TABLE (previous version of this script targeted public.users,
-- which was wrong): the coach dashboard's client list reads calorie_target/
-- protein_target off public.clients rows (confirmed — every client-fetch
-- path in databaseService.js reads c.calorie_target / client?.calorie_target
-- from `clients?select=*...`, never from users), and api/complete-onboarding.js
-- writes these same fields onto clients too. Running the old users-targeted
-- version wouldn't error on calorie_target/protein_target (those columns
-- happen to also exist on users) but would have zero visible effect, since
-- the dashboard never reads them from there.
--
-- Only updates calorie_target and protein_target — carbs_target/fats_target
-- are dropped from this backfill entirely (a 42703 "column does not exist"
-- error surfaced when the previous, users-targeted version tried to write
-- them). The app's own UI only ever displays calories and protein, never
-- carbs/fats, so this doesn't affect anything visible.
--
-- Two intentional differences from a bit-for-bit match to calculator.net,
-- both explicit product choices made with the user:
-- - Gender isn't a field this app collects, so this uses the AVERAGE of
--   Mifflin-St Jeor's male (+5) and female (-161) constants (-78), rather
--   than adding a new field.
-- - No "nice number" rounding (nearest-50 calories, nearest-5 grams) —
--   left at raw precision, matching src/utils/targets.js exactly.
--
-- Only rows with weight_kg, height_cm, and age already populated are
-- touched. Nothing else on the client row is read or modified.
-- ==========================================

DO $$
DECLARE
  r RECORD;
  mult NUMERIC;
  bmr NUMERIC;
  tdee NUMERIC;
  cal INTEGER;
BEGIN
  FOR r IN
    SELECT id, weight_kg, height_cm, age, activity_level, fitness_goal
    FROM public.clients
    WHERE weight_kg IS NOT NULL
      AND height_cm IS NOT NULL
      AND age IS NOT NULL
  LOOP
    -- Matches calculator.net's activity multipliers exactly (see
    -- src/utils/targets.js for the full mapping rationale).
    mult := 1.2;
    IF r.activity_level = 'Lightly Active' THEN
      mult := 1.375;
    ELSIF r.activity_level = 'Moderately Active' THEN
      mult := 1.465;
    ELSIF r.activity_level = 'Very Active' THEN
      mult := 1.725;
    END IF;

    bmr := 10 * r.weight_kg + 6.25 * r.height_cm - 5 * r.age - 78;
    tdee := bmr * mult;

    IF r.fitness_goal ILIKE '%Fat Loss%' THEN
      cal := ROUND(GREATEST(1200, tdee - 500));
    ELSIF r.fitness_goal ILIKE '%Muscle Building%' THEN
      cal := ROUND(tdee + 300);
    ELSE
      cal := ROUND(tdee);
    END IF;

    UPDATE public.clients
    SET calorie_target = cal,
        protein_target = ROUND((cal * 0.244) / 4.0)
    WHERE id = r.id;
  END LOOP;
END $$;
