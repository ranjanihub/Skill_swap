/*
  Message read receipts

  Adds a normalized read-tracking table so the messaging UI can show read receipts
  without changing the existing `messages` table shape.
*/

CREATE TABLE IF NOT EXISTS message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON message_reads(user_id);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- Participants in the parent conversation can view read receipts
CREATE POLICY IF NOT EXISTS "Participants can select message reads"
  ON message_reads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND (auth.uid() = c.participant_a OR auth.uid() = c.participant_b)
    )
  );

-- A user can mark a message as read for themselves (only if they're a participant)
CREATE POLICY IF NOT EXISTS "Users can insert own message reads"
  ON message_reads FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND (auth.uid() = c.participant_a OR auth.uid() = c.participant_b)
    )
  );
