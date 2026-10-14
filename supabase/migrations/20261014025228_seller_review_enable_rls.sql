-- Match the other public tables: RLS on, no direct PostgREST access.
-- The app reads/writes SellerReview only through server-side Prisma (bypasses RLS).
alter table public."SellerReview" enable row level security;
revoke all on table public."SellerReview" from anon, authenticated;
