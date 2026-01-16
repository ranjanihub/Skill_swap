-- Add company_website column to user_settings (if missing)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS company_website text;

-- After running this migration in your Supabase project, go to
-- Supabase Dashboard → API → Reload to refresh the schema cache.
