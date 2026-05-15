/**
 * Server-side IVS operational logs. Safe-by-contract: never pass stream keys, raw tokens, or full ARNs.
 *
 * Enable in production with `IVS_OPS_LOG=true`. In development, logging is on unless `IVS_OPS_LOG=false`.
 */
export function isIvsOpsLogEnabled(): boolean {
  const explicit = process.env.IVS_OPS_LOG?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") return true;
  if (explicit === "false" || explicit === "0" || explicit === "no") return false;
  return process.env.NODE_ENV !== "production";
}

export type IvsStreamHealthOpSource = "sync_get_stream" | "recorded_state" | "stale_reconcile";

export function logIvsOpsServer(event: string, fields: Record<string, unknown>): void {
  if (!isIvsOpsLogEnabled()) return;
  const payload = {
    channel: "IVS_OPS",
    event,
    ts: new Date().toISOString(),
    ...fields,
  };
  console.info("[IVS_OPS]", JSON.stringify(payload));
}
