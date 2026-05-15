import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getSellerPublishListingIssues } from "@/lib/seller-publish-readiness";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const issues = await getSellerPublishListingIssues(prisma, session.user.id, {
    shippingBaseWeightOz: 4,
    shippingIncrementalWeightOz: 1,
    shippingCategory: "raw_card",
  });

  return NextResponse.json({
    canPublish: issues.length === 0,
    issues,
  });
}
