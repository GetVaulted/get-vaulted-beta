import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { serializeBuyerLayawayRow } from "@/lib/layaway/serialize-buyer-layaway";
import { prisma } from "@/lib/prisma";
import { processLayawayMaintenance, repairListingCommerceConflicts } from "@/services/layaway";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  try {
    await processLayawayMaintenance();
    await repairListingCommerceConflicts();
  } catch (e) {
    console.error("[layaways] maintenance", e);
  }

  const rows = await prisma.layaway.findMany({
    where: { buyerId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
      order: { select: { paymentStatus: true } },
    },
  });

  return NextResponse.json({
    layaways: rows.map((r) => serializeBuyerLayawayRow(r)),
  });
}
