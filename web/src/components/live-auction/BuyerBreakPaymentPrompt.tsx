"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BreakSpotPayButton } from "@/components/live-auction/BreakSpotPayButton";
import type { LiveRoomBreakPublicDTO } from "@/lib/live-room-serialize";

function walkBuyerSpots<T>(
  b: LiveRoomBreakPublicDTO,
  buyerId: string | null | undefined,
  fn: (args: { claimId: string; label: string; breakPaymentStatus: string | null }) => T | null,
): T | null {
  if (!buyerId) return null;
  for (const row of b.queueSpots) {
    for (const c of row.spotClaims) {
      if (c.buyerUserId !== buyerId) continue;
      const hit = fn({
        claimId: c.claimId,
        label: row.label,
        breakPaymentStatus: c.breakPaymentStatus,
      });
      if (hit != null) return hit;
    }
  }
  for (const o of b.orphanSpots) {
    if (o.buyerUserId !== buyerId) continue;
    const hit = fn({
      claimId: o.id,
      label: o.spotLabel,
      breakPaymentStatus: o.breakPaymentStatus,
    });
    if (hit != null) return hit;
  }
  return null;
}

function findFailedSpot(b: LiveRoomBreakPublicDTO, buyerId: string | null | undefined) {
  return walkBuyerSpots(b, buyerId, ({ claimId, label, breakPaymentStatus }) =>
    breakPaymentStatus === "failed" ? { claimId, label, reason: "failed" as const } : null,
  );
}

/** Claim still owes payment (including right after a canceled checkout session). */
function findIncompleteSpot(b: LiveRoomBreakPublicDTO, buyerId: string | null | undefined) {
  return walkBuyerSpots(b, buyerId, ({ claimId, label, breakPaymentStatus }) => {
    const unpaid =
      breakPaymentStatus === "unpaid" ||
      breakPaymentStatus === "pending_payment" ||
      breakPaymentStatus === "failed";
    return unpaid ? { claimId, label, reason: "incomplete" as const } : null;
  });
}

function Inner({
  liveRoomId,
  breakSnapshot,
  currentUserId,
  isLive,
}: {
  liveRoomId: string;
  breakSnapshot: LiveRoomBreakPublicDTO;
  currentUserId: string | null | undefined;
  isLive: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  const failedSpot = useMemo(() => findFailedSpot(breakSnapshot, currentUserId), [breakSnapshot, currentUserId]);
  const incompleteSpot = useMemo(() => findIncompleteSpot(breakSnapshot, currentUserId), [breakSnapshot, currentUserId]);

  const [open, setOpen] = useState(false);

  const attention = failedSpot ?? (checkoutCanceled ? incompleteSpot : null);

  useEffect(() => {
    if (!currentUserId) return;
    if (failedSpot) {
      setOpen(true);
      return;
    }
    if (checkoutCanceled && incompleteSpot) {
      setOpen(true);
    }
  }, [checkoutCanceled, currentUserId, failedSpot, incompleteSpot]);

  const clearQuery = useCallback(() => {
    try {
      router.replace(pathname, { scroll: false });
    } catch {
      router.refresh();
    }
  }, [pathname, router]);

  const onDismiss = useCallback(() => {
    setOpen(false);
    clearQuery();
  }, [clearQuery]);

  if (!open || !attention) return null;

  const title =
    attention.reason === "failed"
      ? "Payment did not go through"
      : checkoutCanceled
        ? "Checkout canceled"
        : "Complete your payment";

  const body =
    attention.reason === "failed"
      ? "Your card or bank declined this charge, or the session expired. Retry below or use a different payment method in Stripe checkout."
      : checkoutCanceled
        ? "You left checkout before paying. Retry with the same card or choose another payment method."
        : "Finish paying for your spot below.";

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="break-pay-prompt-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="break-pay-prompt-title" className="text-base font-bold text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
        <p className="mt-3 text-xs font-semibold text-zinc-500">
          Spot · <span className="text-zinc-300">{attention.label}</span>
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/5"
          >
            Not now
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <BreakSpotPayButton liveRoomId={liveRoomId} breakSpotId={attention.claimId} disabled={!isLive} />
          </div>
        </div>
        <p className="mt-3 text-[10px] text-zinc-600">
          Retry opens secure Stripe checkout — you can switch cards or wallet there.
        </p>
      </div>
    </div>
  );
}

/** Popup when break spot payment fails or buyer returns from a canceled Stripe checkout. */
export function BuyerBreakPaymentPrompt(props: {
  liveRoomId: string;
  breakSnapshot: LiveRoomBreakPublicDTO | null | undefined;
  currentUserId: string | null | undefined;
  isLive: boolean;
}) {
  if (!props.breakSnapshot) return null;
  return (
    <Suspense fallback={null}>
      <Inner {...props} breakSnapshot={props.breakSnapshot} />
    </Suspense>
  );
}
