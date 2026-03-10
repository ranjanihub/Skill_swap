-- user_learning_preferences: stores skills a user wants to learn, used for recommendation matching
-- when no global swap matches exist, these preferences are used to find compatible teachers.

CREATE TABLE IF NOT EXISTS user_learning_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_learning_pref_user_skill
  ON user_learning_preferences(user_id, lower(skill_name));

CREATE INDEX IF NOT EXISTS idx_user_learning_pref_user
  ON user_learning_preferences(user_id);

ALTER TABLE user_learning_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own learning preferences"
  ON user_learning_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own learning preferences"
  ON user_learning_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own learning preferences"
  ON user_learning_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
