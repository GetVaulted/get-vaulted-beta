-- Financial-integrity fix (2026-07): random-reveal pool draw race.
--
-- `executeRandomVariantRevealOnPurchase` reads already-assigned labels, filters the fixed
-- team/division pool, picks one, then writes — as separate non-transactional steps. Two purchases
-- finalizing concurrently could both compute the same "remaining" pool and both get assigned the
-- same label, double-selling one team. This unique index is the hard DB-level backstop: a second
-- concurrent writer attempting to assign the same label for the same item now fails with a unique
-- constraint violation (Prisma P2002) instead of silently succeeding, and the app-level retry loop
-- in `executeRandomVariantRevealOnPurchase` re-draws against the updated "taken" set.
--
-- Postgres treats each NULL as distinct for unique indexes, so purchases that have not (yet) been
-- assigned a `revealedLabel` (NULL) — including all non-random-mode purchases — are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "LiveItemVariantPurchase_liveRoomItemId_revealedLabel_key"
ON "LiveItemVariantPurchase"("liveRoomItemId", "revealedLabel");
