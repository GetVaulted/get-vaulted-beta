-- Storage buckets + object policies (Shippo/EasyPost labels can use private bucket later)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('listing-media', 'listing-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]),
  ('live-show-thumbnails', 'live-show-thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('verification-docs', 'verification-docs', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;

-- Avatars: public read; authenticated users write only under their user id folder prefix
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND split_part(name, '/', 1) = auth.uid()::text);

-- Listing media: path `{seller_id}/{listing_id}/...`
CREATE POLICY "Public read listing media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-media');

CREATE POLICY "Sellers upload listing media under own prefix"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-media'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Sellers update own listing media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'listing-media' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'listing-media' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Sellers delete own listing media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'listing-media' AND split_part(name, '/', 1) = auth.uid()::text);

-- Live thumbnails: `{host_id}/...`
CREATE POLICY "Public read live thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'live-show-thumbnails');

CREATE POLICY "Hosts upload own live thumbnails"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'live-show-thumbnails'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Hosts update own live thumbnails"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'live-show-thumbnails' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'live-show-thumbnails' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Hosts delete own live thumbnails"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'live-show-thumbnails' AND split_part(name, '/', 1) = auth.uid()::text);

-- Verification docs: private
CREATE POLICY "Users read own verification docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'verification-docs' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Users upload own verification docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Users update own verification docs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'verification-docs' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'verification-docs' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY "Users delete own verification docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'verification-docs' AND split_part(name, '/', 1) = auth.uid()::text);
