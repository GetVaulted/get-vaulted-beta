import { NextResponse } from "next/server";
import { ReferralCreditStatus } from "@/generated/prisma/enums";
import {
  getAdminReferralCreditSummary,
  listAdminReferralCredits,
  listAdminReferralWallets,
} from "@/lib/admin/admin-referral-credits";
import { requireAdmin } from "@/lib/require-admin";

const STATUSES = new Set<string>(Object.values(ReferralCreditStatus));

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const statusRaw = (url.searchParams.get("status") ?? "all").trim().toLowerCase();
  const status =
    statusRaw === "all"
      ? "all"
      : STATUSES.has(statusRaw)
        ? (statusRaw as ReferralCreditStatus)
        : null;
  if (status == null) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }

  const q = url.searchParams.get("q") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const walletLimitRaw = Number(url.searchParams.get("walletLimit") ?? "40");

  const [summary, credits, wallets] = await Promise.all([
    getAdminReferralCreditSummary(),
    listAdminReferralCredits({
      status,
      q,
      limit: Number.isFinite(limitRaw) ? limitRaw : 100,
    }),
    listAdminReferralWallets({
      q,
      limit: Number.isFinite(walletLimitRaw) ? walletLimitRaw : 40,
    }),
  ]);

  return NextResponse.json({ summary, credits, wallets });
}
