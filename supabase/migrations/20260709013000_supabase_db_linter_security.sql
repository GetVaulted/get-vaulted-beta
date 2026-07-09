-- Supabase Database Linter fixes (security_definer_view + rls_disabled_in_public).
--
-- Prisma-managed PascalCase tables: enable RLS (deny-by-default for anon/authenticated)
-- and re-assert PostgREST grant revocation. Server/Prisma uses postgres/service_role and is unaffected.
--
-- live_shows_public: switch to security_invoker and add anon SELECT policy on base table.

-- ---------------------------------------------------------------------------
-- 1) Prisma tables — RLS on, no client policies, revoke API grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (
        c.relname ~ '^[A-Z]'
        OR c.relname = '_prisma_migrations'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Public live discovery — invoker view + anon read policy on live_shows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon reads public live shows" ON public.live_shows;

CREATE POLICY "Anon reads public live shows"
  ON public.live_shows FOR SELECT
  TO anon
  USING (status IN ('scheduled', 'live', 'ended'));

CREATE OR REPLACE VIEW public.live_shows_public
WITH (security_invoker = true) AS
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

COMMENT ON VIEW public.live_shows_public IS
  'IVS playback + show metadata for viewers (security invoker). Host-only ingest/stream key in live_show_stream_secrets.';
