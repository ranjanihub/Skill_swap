/*
  # Create required storage buckets

  Creates the storage buckets used by the application:
    - avatars        : user profile / avatar images (public)
    - ticket-evidence: evidence files attached to moderation tickets (public)

  These are inserted directly into storage.buckets.  Supabase Storage will
  pick them up automatically.  If the buckets already exist the INSERT is a
  no-op thanks to ON CONFLICT DO NOTHING.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    10485760,   -- 10 MB
    NULL        -- no MIME type restriction
  ),
  (
    'ticket-evidence',
    'ticket-evidence',
    true,
    10485760,   -- 10 MB
    NULL        -- no MIME type restriction
  )
ON CONFLICT (id) DO UPDATE
  SET allowed_mime_types = NULL,
      file_size_limit = EXCLUDED.file_size_limit,
      public = EXCLUDED.public;

-- RLS policies for avatars bucket
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for ticket-evidence bucket
CREATE POLICY "Anyone can read ticket evidence"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-evidence');

CREATE POLICY "Authenticated users can upload ticket evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own ticket evidence"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ticket-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
