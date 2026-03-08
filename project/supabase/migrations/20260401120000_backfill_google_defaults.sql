-- Backfill any existing user_profiles and user_settings rows with
-- Google OAuth information that may have been stored in the auth.users
-- table's user_metadata field.
--
-- This migration can be run after deploying the code changes above. It
-- will not overwrite records that already have a value, it only fills
-- in NULLs so existing custom names/photos are left alone.

-- full_name from metadata into user_profiles
UPDATE user_profiles up
SET full_name = (u.user_metadata->>'full_name')
FROM auth.users u
WHERE up.id = u.id
  AND up.full_name IS NULL
  AND (u.user_metadata->>'full_name') IS NOT NULL;

-- avatar_url and display_name in settings
UPDATE user_settings us
SET avatar_url = (u.user_metadata->>'avatar_url')
FROM auth.users u
WHERE us.id = u.id
  AND us.avatar_url IS NULL
  AND (u.user_metadata->>'avatar_url') IS NOT NULL;

UPDATE user_settings us
SET display_name = (u.user_metadata->>'full_name')
FROM auth.users u
WHERE us.id = u.id
  AND us.display_name IS NULL
  AND (u.user_metadata->>'full_name') IS NOT NULL;

-- ensure a row exists for any user that doesn't yet have one but has
-- metadata; we'll insert rows with defaults so the application logic
-- can rely on their existence.

INSERT INTO user_profiles (id, full_name)
SELECT u.id, (u.user_metadata->>'full_name')
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE up.id IS NULL
  AND (u.user_metadata->>'full_name') IS NOT NULL;

INSERT INTO user_settings (id, avatar_url, display_name)
SELECT u.id, (u.user_metadata->>'avatar_url'), (u.user_metadata->>'full_name')
FROM auth.users u
LEFT JOIN user_settings us ON us.id = u.id
WHERE us.id IS NULL
  AND ((u.user_metadata->>'avatar_url') IS NOT NULL OR (u.user_metadata->>'full_name') IS NOT NULL);
