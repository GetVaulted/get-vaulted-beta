export type ObsConnectionState =
  | "not_setup"
  | "waiting_obs"
  | "connecting"
  | "live"
  | "offline"
  | "ended"
  | "error";

export type ObsReadyStatus = "needs_setup" | "waiting" | "connecting" | "ready" | "ended";

export function streamHealthLabel(health: string | null | undefined): string {
  switch ((health ?? "").toLowerCase()) {
    case "live":
      return "Live";
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting";
    case "ended":
      return "Ended";
    case "not_provisioned":
      return "Not set up";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

export function deriveObsConnectionState(
  streamHealth: string | null | undefined,
  hasIngest: boolean,
): ObsConnectionState {
  const h = (streamHealth ?? "not_provisioned").toLowerCase();
  if (!hasIngest || h === "not_provisioned") return "not_setup";
  if (h === "live") return "live";
  if (h === "connecting") return "connecting";
  if (h === "ended") return "ended";
  if (h === "error") return "error";
  if (h === "offline") return "waiting_obs";
  return "offline";
}

export function deriveObsReadyStatus(
  streamHealth: string | null | undefined,
  hasIngest: boolean,
  roomStatus: string,
): ObsReadyStatus {
  if (roomStatus === "ended") return "ended";
  const conn = deriveObsConnectionState(streamHealth, hasIngest);
  if (conn === "not_setup") return "needs_setup";
  if (conn === "live") return "ready";
  if (conn === "connecting") return "connecting";
  return "waiting";
}

export function obsConnectionLabel(state: ObsConnectionState): string {
  switch (state) {
    case "not_setup":
      return "Not connected — set up stream first";
    case "waiting_obs":
      return "Waiting for OBS — start streaming in OBS";
    case "connecting":
      return "OBS signal connecting";
    case "live":
      return "OBS connected";
    case "ended":
      return "Stream ended";
    case "error":
      return "Stream error — check OBS or rotate key";
    default:
      return "Offline";
  }
}

export function obsReadyLabel(status: ObsReadyStatus): string {
  switch (status) {
    case "needs_setup":
      return "Setup required";
    case "waiting":
      return "Waiting for OBS";
    case "connecting":
      return "Connecting…";
    case "ready":
      return "OBS live — show auto-started";
    case "ended":
      return "Show ended";
  }
}
