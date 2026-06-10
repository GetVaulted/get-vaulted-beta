import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { serializeBuyerLayawayRow } from "@/lib/layaway/serialize-buyer-layaway";
import { prisma } from "@/lib/prisma";
import { processLayawayMaintenance } from "@/services/layaway";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await processLayawayMaintenance();
  } catch (e) {
    console.error("[layaways] maintenance", e);
  }

  const rows = await prisma.layaway.findMany({
    where: { buyerId: session.user.id },
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
