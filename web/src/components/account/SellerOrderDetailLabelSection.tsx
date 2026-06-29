"use client";

import { useState } from "react";
import { SellerShippingLabelPanel } from "@/components/account/SellerShippingLabelPanel";
import { sellerMayShowFulfillmentControls } from "@/lib/order-shipping-guards";
import { orderHasPurchasedLabel } from "@/lib/seller-shipping-label-state";

export type SellerOrderDetailLabelSectionProps = {
  orderId: string;
  paymentStatus: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  labelCreatedAt: string | null;
  fulfillmentStatus: string;
  shippingStatus: string | null;
};

export function SellerOrderDetailLabelSection(props: SellerOrderDetailLabelSectionProps) {
  const [labelBusy, setLabelBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  const fulfillmentAllowed = sellerMayShowFulfillmentControls({ paymentStatus: props.paymentStatus });
  const hasLabel = orderHasPurchasedLabel(props);
  const canCreateLabel = fulfillmentAllowed && !hasLabel;

  const createLabel = async () => {
    setLabelError(null);
    setLabelBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(props.orderId)}/create-label`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not create label.");
        return;
      }
      window.location.reload();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setLabelBusy(false);
    }
  };

  const repairLabel = async () => {
    setLabelError(null);
    setRepairBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(props.orderId)}/repair-label`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not retrieve label.");
        return;
      }
      window.location.reload();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setRepairBusy(false);
    }
  };

  const regenerateLabel = async () => {
    if (
      !window.confirm(
        "Purchase a new shipping label? Shippo may charge again if the original label cannot be recovered.",
      )
    ) {
      return;
    }
    setLabelError(null);
    setRegenerateBusy(true);
    try {
      const res = await fetch(`/api/account/sales/${encodeURIComponent(props.orderId)}/regenerate-label`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLabelError(data.error ?? "Could not regenerate label.");
        return;
      }
      window.location.reload();
    } catch {
      setLabelError("Something went wrong.");
    } finally {
      setRegenerateBusy(false);
    }
  };

  return (
    <div className="mt-8">
      <SellerShippingLabelPanel
        {...props}
        canCreateLabel={canCreateLabel}
        onCreateLabel={createLabel}
        createLabelBusy={labelBusy}
        onRepairLabel={repairLabel}
        repairLabelBusy={repairBusy}
        onRegenerateLabel={regenerateLabel}
        regenerateLabelBusy={regenerateBusy}
        labelError={labelError}
      />
    </div>
  );
}
