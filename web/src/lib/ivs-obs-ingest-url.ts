/**
 * AWS IVS CreateChannel returns a bare ingest host (e.g. `abcd.global-contribute.live-video.net`).
 * OBS Custom service requires a full RTMPS server URL or it shows "Invalid Path or Connection URL".
 */
export function formatIvsObsIngestUrl(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;

  let host = trimmed;
  if (/^rtmps?:\/\//i.test(host)) {
    try {
      const asHttp = host.replace(/^rtmps:/i, "https:").replace(/^rtmp:/i, "http:");
      const u = new URL(asHttp);
      host = u.hostname;
    } catch {
      host = host.replace(/^rtmps?:\/\//i, "").split("/")[0]?.split(":")[0] ?? host;
    }
  } else {
    host = host.replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0] ?? host;
  }

  host = host.trim().replace(/\.$/, "");
  if (!host) return null;
  return `rtmps://${host}:443/app/`;
}
