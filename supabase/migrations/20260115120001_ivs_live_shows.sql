-- AWS IVS: broadcast metadata on live_shows; ingest + stream key refs isolated for RLS

ALTER TABLE public.live_shows
  ADD COLUMN IF NOT EXISTS ivs_channel_arn TEXT,
  ADD COLUMN IF NOT EXISTS ivs_playback_url TEXT,
  ADD COLUMN IF NOT EXISTS ivs_stage_arn TEXT,
  ADD COLUMN IF NOT EXISTS stream_health_status TEXT DEFAULT 'unknown'
    CHECK (stream_health_status IN ('unknown', 'healthy', 'degraded', 'offline')),
  ADD COLUMN IF NOT EXISTS stream_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stream_ended_at TIMESTAMPTZ;

COMMENT ON COLUMN public.live_shows.ivs_playback_url IS 'Public HLS/DASH playback — safe for discovery UIs.';
COMMENT ON COLUMN public.live_shows.ivs_channel_arn IS 'IVS channel ARN — semi-public; host operations use this.';

-- Host-only: never expose ingest / stream key material through public live_shows SELECT for non-hosts.
CREATE TABLE public.live_show_stream_secrets (
  show_id UUID PRIMARY KEY REFERENCES public.live_shows (id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  ivs_ingest_endpoint TEXT,
  ivs_stream_key_arn TEXT,
  stream_key_secret_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (host_id IS NOT NULL)
);

COMMENT ON COLUMN public.live_show_stream_secrets.stream_key_secret_reference IS 'AWS Secrets Manager ARN, SSM parameter name, or other secret handle — never store raw stream keys in Postgres.';

CREATE TRIGGER live_show_stream_secrets_set_updated_at
BEFORE UPDATE ON public.live_show_stream_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.live_show_stream_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host reads own stream secrets"
  ON public.live_show_stream_secrets FOR SELECT
  TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "Host inserts own stream secrets"
  ON public.live_show_stream_secrets FOR INSERT
  TO authenticated
  WITH CHECK (host_id = auth.uid() AND EXISTS (SELECT 1 FROM public.live_shows s WHERE s.id = show_id AND s.host_id = auth.uid()));

CREATE POLICY "Host updates own stream secrets"
  ON public.live_show_stream_secrets FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Host deletes own stream secrets"
  ON public.live_show_stream_secrets FOR DELETE
  TO authenticated
  USING (host_id = auth.uid());

-- Public discovery: safe columns only (no ingest / no secrets). Definer view so anon can read without base-table RLS.
CREATE OR REPLACE VIEW public.live_shows_public WITH (security_invoker = false) AS
SELECT
  id,
  host_id,
  title,
  description,
  category,
  thumbnail_url,
  status,
  scheduled_start,
  actual_start,
  actual_end,
  viewer_count,
  stream_mode,
  ivs_playback_url,
  ivs_channel_arn,
  ivs_stage_arn,
  stream_health_status,
  stream_started_at,
  stream_ended_at,
  created_at,
  updated_at
FROM public.live_shows
WHERE status IN ('scheduled', 'live', 'ended');

GRANT SELECT ON public.live_shows_public TO anon, authenticated;

COMMENT ON VIEW public.live_shows_public IS 'IVS playback + show metadata for viewers; use for discovery. Host-only ingest/stream key in live_show_stream_secrets.';
