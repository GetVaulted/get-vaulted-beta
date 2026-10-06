/** True when this room is on the legacy OBS / RTMP → HLS path. */
export function isObsChannelHlsMode(streamMode: string | null | undefined): boolean {
  return (streamMode ?? '').trim().toLowerCase() === 'channel_hls';
}

/**
 * True when video is expected from desktop OBS (legacy RTMPS HLS **or** WHIP → Stage),
 * so the phone stays command-center and must not auto-open the camera.
 */
export function isObsDesktopBroadcastMode(args: {
  streamMode?: string | null;
  ingestEndpoint?: string | null;
}): boolean {
  if (isObsChannelHlsMode(args.streamMode)) return true;
  const mode = (args.streamMode ?? '').trim().toLowerCase();
  if (mode !== 'stage_webrtc') return false;
  const ingest = (args.ingestEndpoint ?? '').trim().toLowerCase();
  return ingest.includes('whip.live-video.net');
}
