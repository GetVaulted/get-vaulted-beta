-- PR #1 / Migration 1: Revoke PostgREST access to Prisma-managed tables.
-- Prisma connects as postgres (superuser) and is unaffected.
-- Legacy snake_case Supabase tables retain their existing grants + RLS.

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
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;
