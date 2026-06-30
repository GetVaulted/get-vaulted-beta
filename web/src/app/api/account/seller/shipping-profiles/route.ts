import { NextResponse } from "next/server";
import type { LiveShowCarrierPreference } from "@/generated/prisma/enums";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { prisma } from "@/lib/prisma";
import {
  archiveSellerShippingProfile,
  getActiveSellerShippingProfiles,
  seedSellerShippingProfiles,
} from "@/services/shipping/seller-shipping-profiles";

function parseCarrier(raw: unknown): LiveShowCarrierPreference | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "usps" || v === "ups" || v === "best_rate") return v;
  return null;
}

export async function GET(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const sellerId = resolved.userId;

  const profiles = await getActiveSellerShippingProfiles(sellerId);
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      id: p.id,
      sourceSlug: p.sourceSlug,
      name: p.name,
      defaultWeightOz: p.defaultWeightOz,
      defaultLengthIn: p.defaultLengthIn,
      defaultWidthIn: p.defaultWidthIn,
      defaultHeightIn: p.defaultHeightIn,
      packageType: p.packageType,
      bundleGroup: p.bundleGroup,
      incrementalWeightOz: p.incrementalWeightOz,
      maxUnitsPerParcel: p.maxUnitsPerParcel,
      requiresSeparatePackage: p.requiresSeparatePackage,
      canJoinBuyerShowShipment: p.canJoinBuyerShowShipment,
      carrierPreference: p.carrierPreference,
      defaultServicePreference: p.defaultServicePreference,
      isDefault: p.isDefault,
    })),
  });
}

type PostBody = {
  action?: "duplicate" | "archive" | "set_default";
  sourceProfileId?: string;
  profileId?: string;
  name?: string;
  defaultWeightOz?: number;
  defaultLengthIn?: number;
  defaultWidthIn?: number;
  defaultHeightIn?: number;
  packageType?: string;
  bundleGroup?: string;
  incrementalWeightOz?: number | null;
  maxUnitsPerParcel?: number | null;
  requiresSeparatePackage?: boolean;
  canJoinBuyerShowShipment?: boolean;
  carrierPreference?: string;
  defaultServicePreference?: string | null;
};

export async function POST(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const sellerId = resolved.userId;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await seedSellerShippingProfiles(sellerId);

  if (body.action === "archive" && body.profileId?.trim()) {
    const result = await archiveSellerShippingProfile({
      sellerId,
      profileId: body.profileId.trim(),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    const profiles = await getActiveSellerShippingProfiles(sellerId);
    return NextResponse.json({ ok: true, profiles });
  }

  if (body.action === "set_default" && body.profileId?.trim()) {
    const profile = await prisma.sellerShippingProfile.findFirst({
      where: { id: body.profileId.trim(), sellerId, archivedAt: null },
    });
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    await prisma.$transaction([
      prisma.sellerShippingProfile.updateMany({
        where: { sellerId, archivedAt: null },
        data: { isDefault: false },
      }),
      prisma.sellerShippingProfile.update({
        where: { id: profile.id },
        data: { isDefault: true },
      }),
    ]);
    const profiles = await getActiveSellerShippingProfiles(sellerId);
    return NextResponse.json({ ok: true, profiles });
  }

  if (body.action === "duplicate" && body.sourceProfileId?.trim()) {
    const source = await prisma.sellerShippingProfile.findFirst({
      where: { id: body.sourceProfileId.trim(), sellerId, archivedAt: null },
    });
    if (!source) return NextResponse.json({ error: "Source profile not found." }, { status: 404 });
    const slug = `${source.sourceSlug}_copy_${Date.now()}`;
    const created = await prisma.sellerShippingProfile.create({
      data: {
        sellerId,
        sourceSlug: slug.slice(0, 64),
        name: `${source.name} (copy)`,
        defaultWeightOz: source.defaultWeightOz,
        defaultLengthIn: source.defaultLengthIn,
        defaultWidthIn: source.defaultWidthIn,
        defaultHeightIn: source.defaultHeightIn,
        packageType: source.packageType,
        bundleGroup: source.bundleGroup,
        incrementalWeightOz: source.incrementalWeightOz,
        maxUnitsPerParcel: source.maxUnitsPerParcel,
        requiresSeparatePackage: source.requiresSeparatePackage,
        canJoinBuyerShowShipment: source.canJoinBuyerShowShipment,
        carrierPreference: source.carrierPreference,
        defaultServicePreference: source.defaultServicePreference,
        isDefault: false,
      },
    });
    return NextResponse.json({ ok: true, profile: created });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Profile name is required." }, { status: 400 });

  const carrier = parseCarrier(body.carrierPreference) ?? "best_rate";
  const slug = `custom_${Date.now()}`;
  const created = await prisma.sellerShippingProfile.create({
    data: {
      sellerId,
      sourceSlug: slug.slice(0, 64),
      name: name.slice(0, 120),
      defaultWeightOz: Number(body.defaultWeightOz) > 0 ? Number(body.defaultWeightOz) : 16,
      defaultLengthIn: Number(body.defaultLengthIn) > 0 ? Number(body.defaultLengthIn) : 12,
      defaultWidthIn: Number(body.defaultWidthIn) > 0 ? Number(body.defaultWidthIn) : 9,
      defaultHeightIn: Number(body.defaultHeightIn) > 0 ? Number(body.defaultHeightIn) : 4,
      packageType: typeof body.packageType === "string" ? body.packageType.slice(0, 64) : "",
      bundleGroup: typeof body.bundleGroup === "string" ? body.bundleGroup.slice(0, 64) : "general",
      incrementalWeightOz:
        body.incrementalWeightOz != null && Number.isFinite(Number(body.incrementalWeightOz))
          ? Number(body.incrementalWeightOz)
          : null,
      maxUnitsPerParcel:
        body.maxUnitsPerParcel != null && Number.isFinite(Number(body.maxUnitsPerParcel))
          ? Math.max(1, Math.floor(Number(body.maxUnitsPerParcel)))
          : null,
      requiresSeparatePackage: body.requiresSeparatePackage === true,
      canJoinBuyerShowShipment: body.canJoinBuyerShowShipment !== false,
      carrierPreference: carrier,
      defaultServicePreference:
        typeof body.defaultServicePreference === "string" ? body.defaultServicePreference.slice(0, 64) : null,
      isDefault: false,
    },
  });
  return NextResponse.json({ ok: true, profile: created }, { status: 201 });
}

export async function PATCH(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const sellerId = resolved.userId;

  let body: PostBody & { id?: string };
  try {
    body = (await req.json()) as PostBody & { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim() ?? body.profileId?.trim();
  if (!id) return NextResponse.json({ error: "Profile id required." }, { status: 400 });

  const existing = await prisma.sellerShippingProfile.findFirst({
    where: { id, sellerId, archivedAt: null },
  });
  if (!existing) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  const carrier = parseCarrier(body.carrierPreference);
  const updated = await prisma.sellerShippingProfile.update({
    where: { id: existing.id },
    data: {
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}),
      ...(Number(body.defaultWeightOz) > 0 ? { defaultWeightOz: Number(body.defaultWeightOz) } : {}),
      ...(Number(body.defaultLengthIn) > 0 ? { defaultLengthIn: Number(body.defaultLengthIn) } : {}),
      ...(Number(body.defaultWidthIn) > 0 ? { defaultWidthIn: Number(body.defaultWidthIn) } : {}),
      ...(Number(body.defaultHeightIn) > 0 ? { defaultHeightIn: Number(body.defaultHeightIn) } : {}),
      ...(typeof body.packageType === "string" ? { packageType: body.packageType.slice(0, 64) } : {}),
      ...(typeof body.bundleGroup === "string" ? { bundleGroup: body.bundleGroup.slice(0, 64) } : {}),
      ...(body.incrementalWeightOz !== undefined
        ? {
            incrementalWeightOz:
              body.incrementalWeightOz != null && Number.isFinite(Number(body.incrementalWeightOz))
                ? Number(body.incrementalWeightOz)
                : null,
          }
        : {}),
      ...(body.maxUnitsPerParcel !== undefined
        ? {
            maxUnitsPerParcel:
              body.maxUnitsPerParcel != null && Number.isFinite(Number(body.maxUnitsPerParcel))
                ? Math.max(1, Math.floor(Number(body.maxUnitsPerParcel)))
                : null,
          }
        : {}),
      ...(typeof body.requiresSeparatePackage === "boolean"
        ? { requiresSeparatePackage: body.requiresSeparatePackage }
        : {}),
      ...(typeof body.canJoinBuyerShowShipment === "boolean"
        ? { canJoinBuyerShowShipment: body.canJoinBuyerShowShipment }
        : {}),
      ...(carrier ? { carrierPreference: carrier } : {}),
      ...(body.defaultServicePreference !== undefined
        ? {
            defaultServicePreference:
              typeof body.defaultServicePreference === "string"
                ? body.defaultServicePreference.slice(0, 64)
                : null,
          }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, profile: updated });
}
