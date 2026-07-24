-- Run once against the Mali D1 database after schema.sql, to seed the
-- random-assignment pool. Not run against Cameroon's database — this data
-- is Mali-specific.
--
-- Run: npx wrangler d1 execute camaroom-orders-mali --remote \
--   --file=./scripts/seed_mali_sales_reps.sql --config wrangler.mali.toml

INSERT INTO sales_reps (id, name, phone, active) VALUES
  ('rep-yamadou', 'Yamadou', '22370750537', 1),
  ('rep-mamadou-keita', 'Mamadou Keita', '22374065652', 1),
  ('rep-ousman-maiga', 'Ousman Maiga', '22375887769', 1),
  ('rep-ouattara-ousmane', 'Ouattara Ousmane', '22376532891', 1),
  ('rep-papa-job-diarra', 'Papa Job Diarra', '22390473504', 1);
