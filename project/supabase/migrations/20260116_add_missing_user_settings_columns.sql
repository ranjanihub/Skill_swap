-- Add all missing columns to user_settings (safe to run multiple times)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS username text,
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS timezone text,
ADD COLUMN IF NOT EXISTS teaching_level text,
ADD COLUMN IF NOT EXISTS learning_level text,
ADD COLUMN IF NOT EXISTS categories text[],
ADD COLUMN IF NOT EXISTS max_active_exchanges integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS availability jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS session_duration_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS learning_modes text[] DEFAULT ARRAY['chat']::text[],
ADD COLUMN IF NOT EXISTS buffer_minutes integer DEFAULT 15,
ADD COLUMN IF NOT EXISTS notifications jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS privacy jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS headline text,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS current_title text,
ADD COLUMN IF NOT EXISTS current_company text,
ADD COLUMN IF NOT EXISTS company_website text,
ADD COLUMN IF NOT EXISTS websites text[],
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS birthday text,
ADD COLUMN IF NOT EXISTS languages text[],
ADD COLUMN IF NOT EXISTS experience jsonb,
ADD COLUMN IF NOT EXISTS education jsonb,
ADD COLUMN IF NOT EXISTS certifications text[],
ADD COLUMN IF NOT EXISTS licenses text[],
ADD COLUMN IF NOT EXISTS projects text[],
ADD COLUMN IF NOT EXISTS publications text[],
ADD COLUMN IF NOT EXISTS skills text[];

-- Refresh timestamps if missing
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Reminder: after running this migration, reload the Supabase schema cache:
-- Supabase Dashboard → API → Reload
