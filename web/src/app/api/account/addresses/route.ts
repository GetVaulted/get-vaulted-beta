import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { validateAddressCreateInput, type AddressInput } from "@/lib/address-book";
import { verifyAddressCreateData } from "@/lib/apply-address-verification";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const addresses = await prisma.address.findMany({
    where: { userId: auth.userId },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  let body: AddressInput;
  try {
    body = (await req.json()) as AddressInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = validateAddressCreateInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const verified = await verifyAddressCreateData(parsed.data);
  if (!verified.ok) {
    return NextResponse.json(verified.body, { status: verified.status });
  }
  const data = verified.data;
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({
        where: { userId: auth.userId, type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        userId: auth.userId,
        ...data,
      },
    });
  });
  return NextResponse.json(
    {
      address,
      verified: data.isVerified,
      corrected: verified.corrected,
    },
    { status: 201 },
  );
}
