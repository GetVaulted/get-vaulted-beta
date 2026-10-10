import { NextResponse } from "next/server";
import { logAdminAction, normalizeAdminReason } from "@/lib/admin/admin-audit";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { ADMIN_SETTINGS, clearAdminSettingCache, getBoolAdminSetting, type AdminSettingKey } from "@/lib/admin/admin-settings";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const gate = await requireAdminPermission("settings.manage", request);
  if (!gate.ok) return gate.response;
  clearAdminSettingCache();
  const settings = await Promise.all(
    ADMIN_SETTINGS.map(async (s) => ({
      key: s.key,
      label: s.label,
      help: s.help,
      enabled: await getBoolAdminSetting(s.key),
    })),
  );
  return NextResponse.json({ settings });
}

/** Body: { key, enabled: boolean, reason } */
export async function POST(request: Request) {
  const gate = await requireAdminPermission("settings.manage", request);
  if (!gate.ok) return gate.response;

  let body: { key?: string; enabled?: boolean; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const def = ADMIN_SETTINGS.find((s) => s.key === body.key);
  if (!def || typeof body.enabled !== "boolean") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });

  const key = def.key as AdminSettingKey;
  const before = await getBoolAdminSetting(key);
  await prisma.$transaction(async (tx) => {
    await tx.adminSetting.upsert({
      where: { key },
      create: { key, value: body.enabled ? "true" : "false", updatedById: gate.userId },
      update: { value: body.enabled ? "true" : "false", updatedById: gate.userId },
    });
    await logAdminAction(
      {
        adminUserId: gate.userId,
        action: "settings.change",
        targetType: "setting",
        targetId: key,
        reason,
        detail: { from: before, to: body.enabled },
      },
      tx,
    );
  });
  clearAdminSettingCache();
  return NextResponse.json({ ok: true });
}
