/** Client-side IVS webcam broadcast diagnostics. Never pass stream keys or full ingest URLs with secrets. */

export function logIvsWeb(message: string, extra?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (extra && Object.keys(extra).length > 0) {
    console.info(`[ivs web] ${message}`, extra);
  } else {
    console.info(`[ivs web] ${message}`);
  }
}

export function redactIngestEndpoint(endpoint: string | undefined | null): string | undefined {
  if (!endpoint?.trim()) return undefined;
  try {
    const u = new URL(endpoint.replace(/^rtmps:/i, "https:").replace(/^rtmp:/i, "http:"));
    return u.hostname;
  } catch {
    return "invalid";
  }
}
