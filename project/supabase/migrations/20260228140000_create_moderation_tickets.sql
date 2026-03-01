/*
  # Create moderation_tickets table

  Allows users to raise a ticket when a swapper cheats or violates an agreement.

  Tickets are tagged to a related swap post (represented by `skills.id` which is used as /post/[id]).
  Optional evidence can be attached as a list of public URLs.

  Security:
    - RLS enabled
    - Authenticated users can INSERT tickets where reporter_id = auth.uid()
    - Authenticated users can SELECT their own tickets
*/

CREATE TABLE IF NOT EXISTS moderation_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  accused_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  skill_id uuid REFERENCES skills(id) ON DELETE SET NULL,
  session_id uuid REFERENCES skill_swap_sessions(id) ON DELETE SET NULL,
  description text NOT NULL,
  evidence_urls text[],
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE moderation_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own tickets"
  ON moderation_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own tickets"
  ON moderation_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_moderation_tickets_reporter_id ON moderation_tickets(reporter_id);
CREATE INDEX IF NOT EXISTS idx_moderation_tickets_skill_id ON moderation_tickets(skill_id);
CREATE INDEX IF NOT EXISTS idx_moderation_tickets_status ON moderation_tickets(status);
