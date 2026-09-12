-- PlatformAppBanner was created via Prisma after the July 2026 bulk RLS lockdown.
-- Without RLS + grant revoke, PostgREST exposes it to anon/authenticated (Advisor CRITICAL).
-- App reads/writes this table only through Next.js/Prisma (service/postgres), never PostgREST.

ALTER TABLE public."PlatformAppBanner" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PlatformAppBanner" FROM anon, authenticated;

-- Re-assert for any other PascalCase Prisma tables created since the last lockdown.
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
