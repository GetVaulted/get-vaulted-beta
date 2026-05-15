import { NextResponse } from "next/server";
import { EscrowStatus, OrderPaymentMethod } from "@/generated/prisma/enums";
import { isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import { logEscrowStatusTransition } from "@/lib/escrow-audit-log";
import { prisma } from "@/lib/prisma";
import { assertValidEscrowTransition, EscrowInvalidTransitionError } from "@/services/escrow/state-machine";
import { requireAdmin } from "@/lib/require-admin";
import { getEscrowProvider } from "@/services/escrow/factory";
import { releaseEscrowFundsFromApproved } from "@/services/escrow/release-when-approved";

export const runtime = "nodejs";

type Body = {
  action?: string;
  paused?: boolean;
};

/** Admin escrow operations: sync status, release funds from approved, pause release, mark disputed, cancel with provider. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (!isEscrowFeaturesEnabled()) {
    return NextResponse.json(
      {
        error:
          "Escrow admin tools are disabled for this deployment. Set ESCROW_ENABLED=true in the environment to enable.",
      },
      { status: 503 },
    );
  }

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  const action = (body.action ?? "").trim().toLowerCase();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      listingId: true,
      paymentMethod: true,
      escrowTransactionId: true,
      escrowProvider: true,
      escrowStatus: true,
      escrowCheckoutUrl: true,
      escrowFeeCents: true,
      escrowReleasePaused: true,
      fundsReleasedAt: true,
      trustapBuyerUserId: true,
    },
  });

  if (!order || order.paymentMethod !== OrderPaymentMethod.escrow) {
    return NextResponse.json({ error: "Not found or not an escrow order." }, { status: 404 });
  }

  try {
    if (action === "release_funds") {
      if (order.escrowReleasePaused) {
        return NextResponse.json({ error: "Release is paused for this order." }, { status: 403 });
      }
      if (order.escrowStatus === EscrowStatus.funds_released) {
        return NextResponse.json({ ok: true, escrowStatus: EscrowStatus.funds_released, alreadyReleased: true });
      }
      if (order.escrowStatus !== EscrowStatus.approved) {
        return NextResponse.json(
          { error: "Fund release is only available when escrow status is approved." },
          { status: 400 },
        );
      }
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction id on order." }, { status: 400 });
      }
      try {
        const { escrowStatus } = await releaseEscrowFundsFromApproved({
          order: {
            id: order.id,
            sellerId: order.sellerId,
            listingId: order.listingId,
            escrowTransactionId: order.escrowTransactionId,
            escrowProvider: order.escrowProvider,
          },
          auditSource: "admin",
        });
        return NextResponse.json({ ok: true, escrowStatus });
      } catch (e) {
        if (e instanceof EscrowInvalidTransitionError) {
          console.error("[admin/escrow release_funds] invalid post-provider transition", order.id, e);
          return NextResponse.json(
            { error: "Escrow provider response did not match the expected release state." },
            { status: 409 },
          );
        }
        console.error("[admin/escrow release_funds]", e);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Escrow provider could not release funds." },
          { status: 502 },
        );
      }
    }

    if (action === "sync") {
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction id on order." }, { status: 400 });
      }
      const prov = getEscrowProvider();
      const st = await prov.getEscrowTransactionStatus(order.escrowTransactionId);
      const prev = order.escrowStatus;
      try {
        assertValidEscrowTransition(prev, st.status);
      } catch (e) {
        console.error("[admin/escrow sync] invalid transition", order.id, e);
        return NextResponse.json({ error: "Invalid escrow state transition for provider sync." }, { status: 409 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: {
          escrowStatus: st.status,
          ...(st.status === EscrowStatus.funds_released ? { fundsReleasedAt: new Date() } : {}),
        },
      });
      if (prev !== st.status) {
        await logEscrowStatusTransition({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          provider: order.escrowProvider,
          escrowTransactionId: order.escrowTransactionId,
          previousStatus: prev,
          newStatus: st.status,
          source: "admin",
        });
      }
      return NextResponse.json({ ok: true, escrowStatus: st.status });
    }

    if (action === "pause_release") {
      const paused = Boolean(body.paused);
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowReleasePaused: paused },
      });
      return NextResponse.json({ ok: true, escrowReleasePaused: paused });
    }

    if (action === "mark_disputed") {
      const prev = order.escrowStatus;
      try {
        assertValidEscrowTransition(prev, EscrowStatus.disputed);
      } catch (e) {
        console.error("[admin/escrow mark_disputed] invalid transition", order.id, e);
        return NextResponse.json({ error: "Invalid escrow state transition." }, { status: 409 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowStatus: EscrowStatus.disputed },
      });
      if (prev !== EscrowStatus.disputed) {
        await logEscrowStatusTransition({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          provider: order.escrowProvider,
          escrowTransactionId: order.escrowTransactionId,
          previousStatus: prev,
          newStatus: EscrowStatus.disputed,
          source: "admin",
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "set_escrow_delivered") {
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction id on order." }, { status: 400 });
      }
      const prev = order.escrowStatus;
      try {
        assertValidEscrowTransition(prev, EscrowStatus.delivered);
      } catch (e) {
        console.error("[admin/escrow set_escrow_delivered] invalid transition", order.id, e);
        return NextResponse.json({ error: "Invalid escrow state transition." }, { status: 409 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowStatus: EscrowStatus.delivered },
      });
      if (prev !== EscrowStatus.delivered) {
        await logEscrowStatusTransition({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          provider: order.escrowProvider,
          escrowTransactionId: order.escrowTransactionId,
          previousStatus: prev,
          newStatus: EscrowStatus.delivered,
          source: "admin",
        });
      }
      return NextResponse.json({ ok: true, escrowStatus: EscrowStatus.delivered });
    }

    if (action === "set_escrow_inspection_period") {
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction id on order." }, { status: 400 });
      }
      const prev = order.escrowStatus;
      try {
        assertValidEscrowTransition(prev, EscrowStatus.inspection_period);
      } catch (e) {
        console.error("[admin/escrow set_escrow_inspection_period] invalid transition", order.id, e);
        return NextResponse.json({ error: "Invalid escrow state transition." }, { status: 409 });
      }
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowStatus: EscrowStatus.inspection_period },
      });
      if (prev !== EscrowStatus.inspection_period) {
        await logEscrowStatusTransition({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          provider: order.escrowProvider,
          escrowTransactionId: order.escrowTransactionId,
          previousStatus: prev,
          newStatus: EscrowStatus.inspection_period,
          source: "admin",
        });
      }
      return NextResponse.json({ ok: true, escrowStatus: EscrowStatus.inspection_period });
    }

    if (action === "cancel") {
      if (!order.escrowTransactionId) {
        return NextResponse.json({ error: "No escrow transaction id on order." }, { status: 400 });
      }
      const prev = order.escrowStatus;
      try {
        assertValidEscrowTransition(prev, EscrowStatus.cancelled);
      } catch (e) {
        console.error("[admin/escrow cancel] invalid transition", order.id, e);
        return NextResponse.json({ error: "Invalid escrow state transition." }, { status: 409 });
      }
      const prov = getEscrowProvider();
      await prov.cancelEscrowTransaction(order.escrowTransactionId);
      await prisma.order.update({
        where: { id: order.id },
        data: { escrowStatus: EscrowStatus.cancelled },
      });
      if (prev !== EscrowStatus.cancelled) {
        await logEscrowStatusTransition({
          sellerId: order.sellerId,
          listingId: order.listingId,
          orderId: order.id,
          provider: order.escrowProvider,
          escrowTransactionId: order.escrowTransactionId,
          previousStatus: prev,
          newStatus: EscrowStatus.cancelled,
          source: "admin",
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      {
        error:
          "Invalid action. Use sync, release_funds, pause_release, mark_disputed, set_escrow_delivered, set_escrow_inspection_period, or cancel.",
      },
      { status: 400 },
    );
  } catch (e) {
    console.error("[admin/orders escrow]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 502 });
  }
}
