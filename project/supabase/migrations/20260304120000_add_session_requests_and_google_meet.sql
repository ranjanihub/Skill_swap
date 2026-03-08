/*
  Session request + scheduling support

  - Adds required scheduling fields to connection_requests
  - Adds normalized proposed slots table
  - Adds Meet/calendar metadata to skill_swap_sessions
*/

-- 1) Extend connection_requests with scheduling info
ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS session_note text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS selected_slot_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_session_id uuid;

-- Backfill: keep existing rows valid
UPDATE connection_requests
SET session_note = COALESCE(session_note, 'SkillSwap session')
WHERE session_note IS NULL;

ALTER TABLE connection_requests
  ALTER COLUMN session_note SET NOT NULL;

-- 2) Proposed slots per request
CREATE TABLE IF NOT EXISTS connection_request_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES connection_requests(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connection_request_slots_request_id ON connection_request_slots(request_id);
CREATE INDEX IF NOT EXISTS idx_connection_request_slots_start_at ON connection_request_slots(start_at);

ALTER TABLE connection_request_slots ENABLE ROW LEVEL SECURITY;

-- Requester/recipient can view slots for requests they participate in
CREATE POLICY IF NOT EXISTS "Participants can view request slots"
  ON connection_request_slots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM connection_requests r
      WHERE r.id = connection_request_slots.request_id
        AND (auth.uid() = r.requester_id OR auth.uid() = r.recipient_id)
    )
  );

-- Only requester can insert slots (creation stage)
CREATE POLICY IF NOT EXISTS "Requester can insert request slots"
  ON connection_request_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM connection_requests r
      WHERE r.id = connection_request_slots.request_id
        AND auth.uid() = r.requester_id
    )
  );

-- Only requester can delete slots while pending
CREATE POLICY IF NOT EXISTS "Requester can delete request slots"
  ON connection_request_slots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM connection_requests r
      WHERE r.id = connection_request_slots.request_id
        AND auth.uid() = r.requester_id
        AND r.status = 'pending'
    )
  );

-- 3) Extend skill_swap_sessions with meet/calendar fields
ALTER TABLE skill_swap_sessions
  ADD COLUMN IF NOT EXISTS meet_link text,
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_provider text;

-- Optional FK-like consistency: scheduled_session_id references sessions
-- (Cannot add FK safely if table might be missing on some deployments; keep as plain uuid)

