-- P3-02: profile photos live in Supabase Storage instead of auth user_metadata
-- (base64 avatars bloated every JWT / session by 15-60 KB).
-- Public-read bucket; each user may only write inside their own folder `<uid>/...`.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_owner_insert') THEN
    CREATE POLICY avatars_owner_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_owner_update') THEN
    CREATE POLICY avatars_owner_update ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_owner_delete') THEN
    CREATE POLICY avatars_owner_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_owner_select') THEN
    CREATE POLICY avatars_owner_select ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
