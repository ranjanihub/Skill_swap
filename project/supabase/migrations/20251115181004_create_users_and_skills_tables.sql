/*
  # Create Users and Skills Tables for SkillSwap

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `full_name` (text)
      - `bio` (text)
      - `swap_points` (integer, default 0)
      - `skills_count` (integer, default 0)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `skills`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to user_profiles)
      - `name` (text)
      - `description` (text)
      - `category` (text)
      - `skill_type` (text: 'teach' or 'learn')
      - `proficiency_level` (text: 'beginner', 'intermediate', 'advanced')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `skill_swap_sessions`
      - `id` (uuid, primary key)
      - `user_a_id` (uuid, foreign key)
      - `user_b_id` (uuid, foreign key)
      - `skill_a_id` (uuid, foreign key to skills)
      - `skill_b_id` (uuid, foreign key to skills)
      - `status` (text: 'scheduled', 'ongoing', 'completed', 'cancelled')
      - `scheduled_at` (timestamp)
      - `duration_minutes` (integer)
      - `notes` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Users can read their own profile and view other profiles
    - Users can manage only their own skills
    - Users can view sessions they're involved in

  3. Database Indexes
    - Index on user_id in skills table
    - Index on status in skill_swap_sessions table

  4. Important Notes
    - user_profiles table is linked to Supabase auth.users via id
    - swap_points tracks user's skill exchange currency
    - RLS policies prevent unauthorized data access
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  bio text,
  swap_points integer DEFAULT 0,
  skills_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create skills table
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  skill_type text NOT NULL CHECK (skill_type IN ('teach', 'learn')),
  proficiency_level text DEFAULT 'beginner' CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all skills"
  ON skills FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage own skills"
  ON skills FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills"
  ON skills FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own skills"
  ON skills FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_skills_user_id ON skills(user_id);

-- Create skill_swap_sessions table
CREATE TABLE IF NOT EXISTS skill_swap_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  skill_a_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  skill_b_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  duration_minutes integer DEFAULT 60,
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT different_users CHECK (user_a_id != user_b_id)
);

ALTER TABLE skill_swap_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON skill_swap_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Users can create sessions"
  ON skill_swap_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Users can update own sessions"
  ON skill_swap_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE INDEX idx_skill_swap_sessions_status ON skill_swap_sessions(status);
CREATE INDEX idx_skill_swap_sessions_user_a ON skill_swap_sessions(user_a_id);
CREATE INDEX idx_skill_swap_sessions_user_b ON skill_swap_sessions(user_b_id);
