import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { seedPlatformShippingProfiles } from "@/services/shipping/platform-shipping-profiles";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const profiles = await prisma.platformShippingProfile.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ profiles });
}

type PostBody = {
  seedDefaults?: boolean;
  slug?: string;
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

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    /* empty ok for seed-only */
  }

  if (body.seedDefaults === true) {
    const result = await seedPlatformShippingProfiles();
    const profiles = await prisma.platformShippingProfile.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ seeded: result.count, profiles });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().replace(/\s+/g, "_") : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!slug || !name) {
    return NextResponse.json({ error: "slug and name are required." }, { status: 400 });
  }

  const profile = await prisma.platformShippingProfile.create({
    data: {
      slug,
      name: name.slice(0, 120),
      defaultWeightOz: typeof body.defaultWeightOz === "number" ? body.defaultWeightOz : 16,
      defaultLengthIn: typeof body.defaultLengthIn === "number" ? body.defaultLengthIn : 12,
      defaultWidthIn: typeof body.defaultWidthIn === "number" ? body.defaultWidthIn : 9,
      defaultHeightIn: typeof body.defaultHeightIn === "number" ? body.defaultHeightIn : 4,
      packageType: typeof body.packageType === "string" ? body.packageType.slice(0, 64) : "",
      bundleAllowed: body.bundleAllowed !== false,
      requiresSeparatePackage: body.requiresSeparatePackage === true,
      isActive: body.isActive !== false,
      sortOrder: typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0,
    },
  });
  return NextResponse.json({ profile });
}
