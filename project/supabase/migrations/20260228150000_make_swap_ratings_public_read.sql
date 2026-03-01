/*
  # Make swap ratings readable

  The app displays an aggregate rating under a user's name on swap posts/cards.
  For that, authenticated users must be able to SELECT swap_ratings.

  This migration replaces the restrictive SELECT policy with a public (authenticated) read.
*/

-- Replace restrictive SELECT policy with an authenticated-public read policy
DROP POLICY IF EXISTS "Users can view ratings involving themselves" ON swap_ratings;

CREATE POLICY "Users can view all ratings"
  ON swap_ratings FOR SELECT
  TO authenticated
  USING (true);
