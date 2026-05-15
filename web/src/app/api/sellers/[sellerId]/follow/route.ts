import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSellerFromApiParam } from "@/lib/resolve-seller-route-param";

export async function POST(_req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  if (seller.id === session.user.id) {
    return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
  }

  try {
    await prisma.sellerFollow.create({
      data: { followerId: session.user.id, sellerId: seller.id },
    });
  } catch {
    return NextResponse.json({ error: "Already following." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ sellerId: string }> }) {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sellerId: raw } = await ctx.params;
  const seller = await resolveSellerFromApiParam(raw);
  if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

  await prisma.sellerFollow.deleteMany({
    where: { followerId: session.user.id, sellerId: seller.id },
  });

  return NextResponse.json({ ok: true, following: false });
}
