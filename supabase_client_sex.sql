-- Biological sex for the BMR target formula (Mifflin-St Jeor: +5 male,
-- -161 female; 'unspecified' and NULL use the average, -78).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sex text
  CHECK (sex IN ('male', 'female', 'unspecified'));
