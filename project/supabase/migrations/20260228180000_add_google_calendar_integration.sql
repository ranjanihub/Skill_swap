/*
  Google Calendar integration for SkillSwap sessions

  - Stores Google OAuth tokens server-side (service role only)
  - Exposes connection status to the user (RLS)
  - Stores mapping between SkillSwap sessions and Google Calendar events
  - Stores short-lived OAuth state + PKCE verifier for secure callback exchange
*/

-- Connection status (safe for client SELECT)
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id text NOT NULL DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google calendar connection"
  ON google_calendar_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own google calendar connection"
  ON google_calendar_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own google calendar connection"
  ON google_calendar_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own google calendar connection"
  ON google_calendar_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- OAuth tokens (service role only; no client policies)
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose: authenticated users cannot SELECT/UPDATE tokens.

-- Mapping between SkillSwap sessions and Google events
CREATE TABLE IF NOT EXISTS google_calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_id),
  UNIQUE(user_id, event_id)
);

ALTER TABLE google_calendar_event_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google calendar links"
  ON google_calendar_event_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own google calendar links"
  ON google_calendar_event_links FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- PKCE OAuth state store (service role only)
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_oauth_states ENABLE ROW LEVEL SECURITY;

-- No policies: service role only.

-- Updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_calendar_connections_updated_at ON google_calendar_connections;
CREATE TRIGGER trg_google_calendar_connections_updated_at
BEFORE UPDATE ON google_calendar_connections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_google_calendar_tokens_updated_at ON google_calendar_tokens;
CREATE TRIGGER trg_google_calendar_tokens_updated_at
BEFORE UPDATE ON google_calendar_tokens
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_google_calendar_event_links_updated_at ON google_calendar_event_links;
CREATE TRIGGER trg_google_calendar_event_links_updated_at
BEFORE UPDATE ON google_calendar_event_links
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
