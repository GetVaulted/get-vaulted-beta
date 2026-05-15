-- Reliable username availability for sign-up (case-insensitive, no ILIKE wildcards).
CREATE OR REPLACE FUNCTION public.is_username_available(p_candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
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
