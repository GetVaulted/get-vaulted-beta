-- PostgREST connects as `authenticator` then SET ROLE to `anon` / `authenticated`.
-- If `authenticator` lacks USAGE on `public`, every REST and RPC call can fail with
-- "permission denied for schema public" (see Supabase / Postgres grant defaults).

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

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
