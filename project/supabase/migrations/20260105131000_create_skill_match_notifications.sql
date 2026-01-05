-- Skill match notifications
--
-- Creates a fuzzy (trigram) matching trigger so when a user posts a skill
-- (teach or learn), users with the complementary need (learn or teach)
-- get a notification.

-- Enable trigram similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalize skill names for similarity comparisons
CREATE OR REPLACE FUNCTION public.normalize_skill_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      lower(coalesce(input, '')),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

-- Trigger function: inserts notifications for matched skills
CREATE OR REPLACE FUNCTION public.create_skill_match_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opposite_type text;
  actor_name text;
BEGIN
  opposite_type := CASE NEW.skill_type WHEN 'teach' THEN 'learn' ELSE 'teach' END;

  SELECT up.full_name
    INTO actor_name
    FROM public.user_profiles up
   WHERE up.id = NEW.user_id;

  actor_name := coalesce(nullif(actor_name, ''), 'Someone');

  INSERT INTO public.notifications (user_id, type, payload)
  SELECT
    s.user_id,
    'skill_match',
    jsonb_build_object(
      'actor_id', NEW.user_id,
      'actor_name', actor_name,
      'skill_id', NEW.id,
      'skill_name', NEW.name,
      'skill_type', NEW.skill_type,
      'matched_skill_id', s.id,
      'matched_skill_name', s.name,
      'matched_skill_type', s.skill_type,
      'match_score', similarity(
        public.normalize_skill_name(NEW.name),
        public.normalize_skill_name(s.name)
      )
    )
  FROM public.skills s
  WHERE s.skill_type = opposite_type
    AND s.user_id <> NEW.user_id
    AND similarity(public.normalize_skill_name(NEW.name), public.normalize_skill_name(s.name)) >= 0.4
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = s.user_id
        AND n.type = 'skill_match'
        AND (n.payload->>'skill_id') = NEW.id::text
        AND (n.payload->>'matched_skill_id') = s.id::text
    )
  ORDER BY similarity(public.normalize_skill_name(NEW.name), public.normalize_skill_name(s.name)) DESC
  LIMIT 25;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_match_notifications ON public.skills;

CREATE TRIGGER trg_skill_match_notifications
AFTER INSERT ON public.skills
FOR EACH ROW
EXECUTE FUNCTION public.create_skill_match_notifications();
