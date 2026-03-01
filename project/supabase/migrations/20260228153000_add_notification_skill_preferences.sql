/*
  # Notification skill preferences + auto notifications

  Users can choose which skill names they want to receive notifications for.
  When any user creates a new swap post (a row in `skills`), matching users
  automatically receive a notification.

  Notes:
  - Preferences match on normalized skill name (lowercase + trimmed)
  - The post author does not get notified for their own posts
  - Basic dedupe prevents repeated notifications for the same user+skill_id
*/

-- Preferences table
CREATE TABLE IF NOT EXISTS notification_skill_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  skill_name_normalized text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_skill_pref_user_skill
  ON notification_skill_preferences(user_id, skill_name_normalized);

CREATE INDEX IF NOT EXISTS idx_notification_skill_pref_skill
  ON notification_skill_preferences(skill_name_normalized);

ALTER TABLE notification_skill_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification skill prefs"
  ON notification_skill_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification skill prefs"
  ON notification_skill_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification skill prefs"
  ON notification_skill_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Helper normalize function
CREATE OR REPLACE FUNCTION normalize_skill_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(input, '')));
$$;

-- Trigger function to create notifications on new posts
CREATE OR REPLACE FUNCTION notify_skill_post_to_interested_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  actor_name text;
BEGIN
  norm := normalize_skill_name(NEW.name);
  IF norm = '' THEN
    RETURN NEW;
  END IF;

  SELECT up.full_name INTO actor_name
  FROM user_profiles up
  WHERE up.id = NEW.user_id;
  actor_name := coalesce(actor_name, 'Someone');

  INSERT INTO notifications (user_id, type, payload, read)
  SELECT p.user_id,
         'skill_match',
         jsonb_build_object(
           'actor_id', NEW.user_id,
           'actor_name', actor_name,
           'skill_id', NEW.id,
           'skill_name', NEW.name,
           'skill_type', NEW.skill_type
         ),
         false
  FROM notification_skill_preferences p
  WHERE p.skill_name_normalized = norm
    AND p.user_id <> NEW.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = p.user_id
        AND n.type = 'skill_match'
        AND (n.payload->>'skill_id') = NEW.id::text
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_skill_post ON skills;

CREATE TRIGGER trg_notify_skill_post
AFTER INSERT ON skills
FOR EACH ROW
EXECUTE FUNCTION notify_skill_post_to_interested_users();
