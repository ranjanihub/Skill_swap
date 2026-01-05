-- Create connection_requests, conversations, and messages tables for SkillSwap

CREATE TABLE IF NOT EXISTS connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert requests" ON connection_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Authenticated can view requests" ON connection_requests FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "Requester or recipient can update" ON connection_requests FOR UPDATE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id) WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can select conversations" ON conversations FOR SELECT TO authenticated USING (auth.uid() = participant_a OR auth.uid() = participant_b);
CREATE POLICY "Participants can insert conversations" ON conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can select messages" ON messages FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (auth.uid() = c.participant_a OR auth.uid() = c.participant_b))
);
CREATE POLICY "Participants can insert messages" ON messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (auth.uid() = c.participant_a OR auth.uid() = c.participant_b))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connection_requests_recipient ON connection_requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(participant_a, participant_b);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
