import { NextResponse } from "next/server";
import { listTaxNexusStates, setTaxNexusStateEnabled } from "@/lib/stripe-tax";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const states = await listTaxNexusStates();
  return NextResponse.json({
    states: states.map((s) => ({
      stateCode: s.stateCode,
      label: s.label,
      enabled: s.enabled,
      collectionBasis: s.collectionBasis,
      registeredAt: s.registeredAt?.toISOString() ?? null,
      notes: s.notes,
    })),
  });
}

type Body = {
  stateCode?: string;
  enabled?: boolean;
  notes?: string;
};

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stateCode = typeof body.stateCode === "string" ? body.stateCode.trim() : "";
  if (!stateCode) return NextResponse.json({ error: "stateCode required." }, { status: 400 });
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled boolean required." }, { status: 400 });
  }

  try {
    const updated = await setTaxNexusStateEnabled(
      stateCode,
      body.enabled,
      typeof body.notes === "string" ? body.notes.trim() : null,
    );
    return NextResponse.json({
      ok: true,
      state: {
        stateCode: updated.stateCode,
        label: updated.label,
        enabled: updated.enabled,
        registeredAt: updated.registeredAt?.toISOString() ?? null,
        notes: updated.notes,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid state." }, { status: 400 });
  }
}
