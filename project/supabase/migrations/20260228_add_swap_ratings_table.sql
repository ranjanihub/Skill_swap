/*
  Add swap_ratings table to store user ratings after a swap session.

  - `id` uuid primary key
  - `session_id` references skill_swap_sessions
  - `rater_id` uuid references user_profiles
  - `rated_id` uuid references user_profiles
  - `rating` integer 1-5
  - `created_at` timestamp

  RLS policies:
  * authenticated users can insert ratings where they are the rater
  * users can select ratings involving themselves (either as rater or rated)
  * no updates/deletes allowed (ratings are immutable)
*/

CREATE TABLE IF NOT EXISTS swap_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES skill_swap_sessions(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  rated_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE swap_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert ratings they give"
  ON swap_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = rater_id);

CREATE POLICY "Users can view ratings involving themselves"
  ON swap_ratings FOR SELECT
  TO authenticated
  USING (auth.uid() = rater_id OR auth.uid() = rated_id);

-- no update/delete policies (immutable records)
