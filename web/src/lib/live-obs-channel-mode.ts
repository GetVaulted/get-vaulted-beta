/** True when this room is on the OBS / RTMP path (not phone Stage WebRTC). */
export function isObsChannelHlsMode(streamMode: string | null | undefined): boolean {
  return (streamMode ?? "").trim().toLowerCase() === "channel_hls";
}
