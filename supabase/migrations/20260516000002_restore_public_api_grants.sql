-- Restore Data API access on `public` when PostgREST returns
-- "permission denied for schema public" (revoked defaults, Prisma reset, or stricter project settings).
-- RLS still applies: grants only allow the request to reach the table/function; policies filter rows.

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticator';
  END IF;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Objects created later by the same migration role keep API visibility (typical Supabase template).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Username RPC: privileged owner so EXISTS over profiles is reliable.
CREATE OR REPLACE FUNCTION public.is_username_available(p_candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.username IS NOT NULL
      AND lower(trim(p.username)) = lower(trim(p_candidate))
  );
$$;

ALTER FUNCTION public.is_username_available(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
