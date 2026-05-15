import { EscrowStatus } from "@/generated/prisma/enums";
import { assertTrustapStubForbiddenInProduction } from "@/lib/env-production";
import { prisma } from "@/lib/prisma";
import type {
  CreateEscrowTransactionResult,
  EscrowProvider,
  EscrowTransactionStatusResult,
  ReleaseFundsResult,
} from "@/services/escrow/types";
import {
  trustapConfirmDeliveryGuestBuyer,
  trustapCreateGuestUser,
  trustapCreateOnlineTransactionWithGuestUser,
  trustapGetCharge,
  trustapGetTransaction,
  trustapCancelWithGuestUser,
  trustapGuestPayUrl,
} from "@/services/escrow/trustap-client";
import { mapTrustapTransactionStatus } from "@/services/escrow/trustap-status-map";

function apiKey(): string {
  const k = process.env.TRUSTAP_API_KEY?.trim() ?? "";
  if (!k) throw new Error("TRUSTAP_API_KEY is not set");
  return k;
}

function splitName(full: string): { first: string; last: string } {
  const p = full.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return { first: "Buyer", last: "Guest" };
  if (p.length === 1) return { first: p[0]!.slice(0, 80), last: "Guest" };
  return { first: p[0]!.slice(0, 80), last: p.slice(1).join(" ").slice(0, 80) };
}

/**
 * Trustap online transaction integration (guest buyer pay flow).
 * @see https://docs.trustap.com/docs/guides/transactions/online/online-int-path-cc
 */
export class TrustapEscrowProvider implements EscrowProvider {
  readonly name = "trustap" as const;

  async createEscrowTransaction(orderId: string): Promise<CreateEscrowTransactionResult> {
    if (process.env.TRUSTAP_USE_STUB_RESPONSE === "1") {
      assertTrustapStubForbiddenInProduction("Trustap createEscrowTransaction:");
      const base = process.env.TRUSTAP_API_BASE_URL?.trim().replace(/\/$/, "") || "https://stub.trustap";
      const checkoutUrl = `${base}/stub-checkout?orderId=${encodeURIComponent(orderId)}`;
      return {
        transactionId: `trustap_stub_${orderId}`,
        checkoutUrl,
        raw: { stub: true },
        trustapBuyerUserId: `1-stub-buyer-${orderId}`,
      };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: {
          select: {
            title: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        buyer: { select: { email: true } },
        seller: { select: { trustapUserId: true } },
      },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const sellerTrustap = order.seller.trustapUserId?.trim();
    if (!sellerTrustap) {
      throw new Error("TRUSTAP_SELLER_NOT_LINKED");
    }

    const priceMinor = Math.round(order.totalUsd * 100);
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
      throw new Error("INVALID_ORDER_TOTAL");
    }

    const currency = (process.env.TRUSTAP_DEFAULT_CURRENCY ?? "usd").trim().toLowerCase();
    const chargeInfo = await trustapGetCharge({
      apiKey: apiKey(),
      priceMinorUnits: priceMinor,
      currency,
    });

    let buyerTrustapId = order.trustapBuyerUserId?.trim() ?? "";
    if (!buyerTrustapId) {
      const { first, last } = splitName(order.shipRecipientName);
      const guest = await trustapCreateGuestUser({
        apiKey: apiKey(),
        email: order.buyer.email,
        firstName: first,
        lastName: last,
        countryCode: (order.shipCountry || "US").slice(0, 2).toUpperCase(),
        tosIp: process.env.TRUSTAP_GUEST_TOS_IP?.trim() || "127.0.0.1",
        tosUnix: Math.floor(Date.now() / 1000),
      });
      buyerTrustapId = guest.id;
      await prisma.order.update({
        where: { id: orderId },
        data: { trustapBuyerUserId: buyerTrustapId },
      });
    }

    const description = order.listing.title.slice(0, 240);
    const imageUrl = order.listing.images[0]?.url ?? undefined;

    const txBody: Record<string, unknown> = {
      seller_id: sellerTrustap,
      buyer_id: buyerTrustapId,
      creator_role: "seller",
      currency,
      description,
      price: priceMinor,
      charge: chargeInfo.charge,
      charge_calculator_version: chargeInfo.charge_calculator_version,
      charge_seller: chargeInfo.charge_seller,
    };
    if (imageUrl) txBody.image_url = imageUrl;

    const created = await trustapCreateOnlineTransactionWithGuestUser({
      apiKey: apiKey(),
      trustapUserHeader: sellerTrustap,
      body: txBody,
    });

    const numericId = created.id;
    const transactionId = typeof numericId === "number" ? String(numericId) : String(numericId ?? "");
    if (!transactionId) {
      throw new Error("Trustap create response missing transaction id");
    }

    const redirectBase = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ?? "http://localhost:3000";
    const redirectUri = `${redirectBase}/orders/${encodeURIComponent(orderId)}`;
    const checkoutUrl = trustapGuestPayUrl(transactionId, redirectUri);

    return { transactionId, checkoutUrl, raw: created, trustapBuyerUserId: buyerTrustapId };
  }

  async getEscrowTransactionStatus(transactionId: string): Promise<EscrowTransactionStatusResult> {
    if (process.env.TRUSTAP_USE_STUB_RESPONSE === "1") {
      assertTrustapStubForbiddenInProduction("Trustap getEscrowTransactionStatus:");
      return { status: EscrowStatus.pending, raw: { stub: true } };
    }
    const row = await trustapGetTransaction({ apiKey: apiKey(), transactionId });
    const st = String(row.status ?? "");
    const mapped = mapTrustapTransactionStatus(st) ?? EscrowStatus.pending;
    return { status: mapped, raw: row };
  }

  async releaseFunds(transactionId: string): Promise<ReleaseFundsResult> {
    if (process.env.TRUSTAP_USE_STUB_RESPONSE === "1") {
      assertTrustapStubForbiddenInProduction("Trustap releaseFunds:");
      return { escrowStatus: EscrowStatus.funds_released, raw: { stub: true } };
    }

    const order = await prisma.order.findFirst({
      where: { escrowTransactionId: transactionId },
      select: { trustapBuyerUserId: true },
    });
    const buyerHeader = order?.trustapBuyerUserId?.trim();
    if (!buyerHeader) {
      throw new Error("TRUSTAP_BUYER_NOT_LINKED");
    }

    const afterConfirm = await trustapConfirmDeliveryGuestBuyer({
      apiKey: apiKey(),
      trustapBuyerUserHeader: buyerHeader,
      transactionId,
    });

    const row = await trustapGetTransaction({ apiKey: apiKey(), transactionId });
    const st = String(row.status ?? afterConfirm.status ?? "");
    const mapped = mapTrustapTransactionStatus(st) ?? EscrowStatus.approved;

    if (mapped === EscrowStatus.funds_released) {
      return { escrowStatus: EscrowStatus.funds_released, raw: row };
    }
    // Buyer confirmed delivery; payout may follow after complaint window — treat as approved until webhook `funds_released`.
    if (mapped === EscrowStatus.delivered || mapped === EscrowStatus.inspection_period) {
      return { escrowStatus: EscrowStatus.approved, raw: row };
    }

    return { escrowStatus: mapped, raw: row };
  }

  async cancelEscrowTransaction(transactionId: string): Promise<void> {
    if (process.env.TRUSTAP_USE_STUB_RESPONSE === "1") {
      assertTrustapStubForbiddenInProduction("Trustap cancelEscrowTransaction:");
      return;
    }
    const order = await prisma.order.findFirst({
      where: { escrowTransactionId: transactionId },
      select: { seller: { select: { trustapUserId: true } } },
    });
    const sellerTrustap = order?.seller.trustapUserId?.trim();
    if (!sellerTrustap) {
      throw new Error("TRUSTAP_SELLER_NOT_LINKED");
    }
    await trustapCancelWithGuestUser({
      apiKey: apiKey(),
      trustapUserHeader: sellerTrustap,
      transactionId,
    });
  }
}

/** @deprecated Use mapTrustapTransactionStatus / mapTrustapWebhookEventCode from trustap-status-map */
export function mapTrustapRemoteStatusToEscrowStatus(remote: string): EscrowStatus | null {
  return mapTrustapTransactionStatus(remote);
}
