import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { getSellerPublishListingIssues } from "@/lib/seller-publish-readiness";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const issues = await getSellerPublishListingIssues(prisma, auth.userId, {
    shippingBaseWeightOz: 4,
    shippingIncrementalWeightOz: 1,
    shippingCategory: "raw_card",
  });

  return NextResponse.json({
    canPublish: issues.length === 0,
    issues,
  });
}
