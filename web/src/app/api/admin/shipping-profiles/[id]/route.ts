import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

type PatchBody = {
  name?: string;
  defaultWeightOz?: number;
  defaultLengthIn?: number;
  defaultWidthIn?: number;
  defaultHeightIn?: number;
  packageType?: string;
  bundleAllowed?: boolean;
  requiresSeparatePackage?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const profileId = decodeURIComponent(id);

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body.defaultWeightOz === "number" && body.defaultWeightOz > 0) data.defaultWeightOz = body.defaultWeightOz;
  if (typeof body.defaultLengthIn === "number" && body.defaultLengthIn > 0) data.defaultLengthIn = body.defaultLengthIn;
  if (typeof body.defaultWidthIn === "number" && body.defaultWidthIn > 0) data.defaultWidthIn = body.defaultWidthIn;
  if (typeof body.defaultHeightIn === "number" && body.defaultHeightIn > 0) data.defaultHeightIn = body.defaultHeightIn;
  if (typeof body.packageType === "string") data.packageType = body.packageType.slice(0, 64);
  if (typeof body.bundleAllowed === "boolean") data.bundleAllowed = body.bundleAllowed;
  if (typeof body.requiresSeparatePackage === "boolean") data.requiresSeparatePackage = body.requiresSeparatePackage;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.sortOrder === "number") data.sortOrder = Math.floor(body.sortOrder);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const profile = await prisma.platformShippingProfile.update({
    where: { id: profileId },
    data,
  });
  return NextResponse.json({ profile });
}
