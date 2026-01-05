-- Create user_settings table

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  display_name text,
  avatar_url text,
  location text,
  timezone text,
  teaching_level text CHECK (teaching_level IN ('beginner','intermediate','advanced')),
  learning_level text CHECK (learning_level IN ('beginner','intermediate','advanced')),
  categories text[],
  max_active_exchanges integer DEFAULT 5,
  availability jsonb DEFAULT '{}',
  session_duration_minutes integer DEFAULT 60,
  learning_modes text[] DEFAULT ARRAY['chat']::text[],
  buffer_minutes integer DEFAULT 15,
  notifications jsonb DEFAULT '{}',
  privacy jsonb DEFAULT '{}',
  two_factor_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can select own settings" ON user_settings FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "User can insert/update own settings" ON user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "User can update own settings" ON user_settings FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_user_settings_timezone ON user_settings(timezone);
