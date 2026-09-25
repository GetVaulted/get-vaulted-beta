-- Avatar / listing media Storage RLS: authenticated SELECT on own objects.
-- Needed after 20260709020000 dropped broad "Public read *" SELECT policies.
-- Without own-object SELECT, Storage upsert (and some INSERT paths) fail with:
--   "new row violates row-level security policy"

-- Avatars: path `{auth.uid()}/...`
DROP POLICY IF EXISTS "Users read own avatars" ON storage.objects;
CREATE POLICY "Users read own avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Listing media: path `{seller_id}/...`
DROP POLICY IF EXISTS "Sellers read own listing media" ON storage.objects;
CREATE POLICY "Sellers read own listing media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'listing-media'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Live thumbnails: path `{host_id}/...`
DROP POLICY IF EXISTS "Hosts read own live thumbnails" ON storage.objects;
CREATE POLICY "Hosts read own live thumbnails"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'live-show-thumbnails'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Ensure INSERT/UPDATE/DELETE own-avatar policies still exist (idempotent recreate).
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);
