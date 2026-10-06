/**
 * Trust badges shown next to the other person in Messages: a seller-level label (only for people
 * who have actually sold on Get Vaulted, since every account has a default level) and "verified".
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { SellerLevel } from "@/generated/prisma/enums";
import { sellerLevelLabel } from "@/services/payout/seller-level";

export type ParticipantBadgeUser = {
  id: string;
  sellerLevel: SellerLevel;
  emailVerified: Date | null;
};

export type ParticipantBadges = {
  sellerLevelLabel: string | null;
  verified: boolean;
};

/** Pure shaping step (unit-tested). */
export function shapeParticipantBadges(
  users: ParticipantBadgeUser[],
  sellerIdsWithSales: ReadonlySet<string>,
): Map<string, ParticipantBadges> {
  return new Map(
    users.map((u) => [
      u.id,
      {
        sellerLevelLabel: sellerIdsWithSales.has(u.id) ? sellerLevelLabel(u.sellerLevel) : null,
        verified: u.emailVerified != null,
      },
    ]),
  );
}

export async function loadParticipantBadges(
  db: Pick<PrismaClient, "order">,
  users: ParticipantBadgeUser[],
): Promise<Map<string, ParticipantBadges>> {
  const ids = [...new Set(users.map((u) => u.id))];
  const sold =
    ids.length === 0
      ? []
      : await db.order.groupBy({
          by: ["sellerId"],
          where: { sellerId: { in: ids }, paymentStatus: "paid" },
        });
  return shapeParticipantBadges(users, new Set(sold.map((s) => s.sellerId)));
}
