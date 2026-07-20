import { shippoGetTransaction, type ShippoTransaction } from "@/lib/shippo";

export type ResolvedShippoLabel = {
  transactionId: string;
  labelUrl: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingStatus: string | null;
};

export function formatShippoTransactionMessages(
  messages?: ShippoTransaction["messages"] | null,
): string | null {
  if (!messages?.length) return null;
  const parts = messages
    .map((m) => (typeof m === "object" && m && "text" in m ? String(m.text ?? "").trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPendingShippoStatus(status: string | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "QUEUED" || s === "WAITING";
}

function isErrorShippoStatus(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "ERROR";
}

function isSuccessShippoStatus(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "SUCCESS";
}

function resolvedFromTransaction(tx: ShippoTransaction, transactionId: string): ResolvedShippoLabel | null {
  const labelUrl = tx.label_url?.trim();
  if (!labelUrl) return null;
  return {
    transactionId,
    labelUrl,
    trackingNumber: tx.tracking_number?.trim() || null,
    trackingUrl: tx.tracking_url_provider?.trim() || null,
    shippingStatus: tx.status?.trim() || null,
  };
}

function shippoFailureMessage(tx: ShippoTransaction, fallback: string): string {
  return formatShippoTransactionMessages(tx.messages) ?? fallback;
}

/** Poll Shippo until a transaction yields a printable label or fails. */
export async function resolveShippoTransactionLabel(
  transactionId: string,
  options?: { maxAttempts?: number; pollMs?: number },
): Promise<ResolvedShippoLabel> {
  const maxAttempts = options?.maxAttempts ?? 8;
  const pollMs = options?.pollMs ?? 750;
  const txId = transactionId.trim();
  if (!txId) throw new Error("Shippo transaction id is missing.");

  let lastTx: ShippoTransaction | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tx = await shippoGetTransaction(txId);
    lastTx = tx;

    if (isErrorShippoStatus(tx.status)) {
      throw new Error(
        shippoFailureMessage(tx, "Shippo could not create this label. Check addresses and parcel weight."),
      );
    }

    const objectState = String((tx as { object_state?: unknown }).object_state ?? "").toUpperCase();
    if (objectState === "INVALID") {
      throw new Error(
        shippoFailureMessage(tx, "Shippo returned an INVALID transaction. Label was not purchased."),
      );
    }

    const resolved = resolvedFromTransaction(tx, txId);
    if (resolved && isSuccessShippoStatus(tx.status)) return resolved;
    if (resolved && !isPendingShippoStatus(tx.status)) return resolved;

    if (isPendingShippoStatus(tx.status) || (isSuccessShippoStatus(tx.status) && !resolved)) {
      if (attempt < maxAttempts - 1) await sleep(pollMs);
      continue;
    }

    break;
  }

  if (lastTx && isErrorShippoStatus(lastTx.status)) {
    throw new Error(
      shippoFailureMessage(lastTx, "Shippo could not create this label. Check addresses and parcel weight."),
    );
  }

  throw new Error(
    lastTx
      ? shippoFailureMessage(
          lastTx,
          "Shippo accepted the label request but the PDF is not available yet. Try again in a moment.",
        )
      : "Shippo label is not available.",
  );
}

/** Resolve label metadata immediately after POST /transactions/. */
export async function resolveShippoPurchaseLabel(
  purchase: ShippoTransaction,
): Promise<ResolvedShippoLabel> {
  const txId = purchase.object_id?.trim();
  if (!txId) {
    throw new Error("Shippo did not return a transaction id for this label purchase.");
  }

  if (isErrorShippoStatus(purchase.status)) {
    throw new Error(
      shippoFailureMessage(
        purchase,
        "Shippo rejected the label purchase. Confirm ship-from, buyer address, and parcel size.",
      ),
    );
  }

  const purchaseObjectState = String(
    (purchase as { object_state?: unknown }).object_state ?? "",
  ).toUpperCase();
  if (purchaseObjectState === "INVALID") {
    throw new Error(
      shippoFailureMessage(
        purchase,
        "Shippo returned an INVALID transaction. Label was not purchased.",
      ),
    );
  }

  const immediate = resolvedFromTransaction(purchase, txId);
  if (immediate && isSuccessShippoStatus(purchase.status)) return immediate;

  return resolveShippoTransactionLabel(txId);
}
