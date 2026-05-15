-- Sign-up username check: anon hit "permission denied for schema public" on some projects.
-- 1) Ensure API roles can use schema public and read profiles (RLS still applies).
-- 2) Run is_username_available as SECURITY DEFINER so the lookup does not depend on invoker table grants.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
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

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
