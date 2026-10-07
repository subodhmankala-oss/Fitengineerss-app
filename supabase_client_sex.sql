-- Biological sex for the BMR target formula (Mifflin-St Jeor: +5 male,
-- -161 female; 'unspecified' and NULL use the average, -78) and the
-- heart-rate calorie formula (Keytel 2005 has separate male/female forms).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sex text
  CHECK (sex IN ('male', 'female', 'unspecified'));
