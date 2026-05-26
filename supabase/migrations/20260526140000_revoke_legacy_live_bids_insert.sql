-- Live auction bids are server-authoritative via Next.js API + Prisma (not client Supabase writes).
DROP POLICY IF EXISTS "Authenticated place bid as self in room" ON public.live_bids;
