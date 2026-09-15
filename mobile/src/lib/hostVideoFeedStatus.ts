import type { MobileHostBroadcastPhase } from '../hooks/useMobileStagePublish';

/** Host header pill — means buyer-facing video, not just “room status = live”. */
export type HostVideoFeedKind =
  | 'scheduled'
  | 'live'
  | 'elsewhere'
  | 'connecting'
  | 'paused'
  | 'offline';

export type HostVideoFeedStatus = {
  kind: HostVideoFeedKind;
  /** Short pill label. */
  label: string;
  /** True when buyers should see a live video feed (this device or companion). */
  videoOnAir: boolean;
};

/**
 * Resolve what the seller LIVE pill should show.
 * Separates “room is live” from “video is publishing to buyers.”
 */
export function resolveHostVideoFeedStatus(args: {
  roomStatus: 'scheduled' | 'live' | 'ended';
  broadcastPhase: MobileHostBroadcastPhase;
  streamPaused?: boolean | null;
  companionMode: boolean;
  roomBroadcastOnAir: boolean;
  streamHealth?: string | null;
}): HostVideoFeedStatus {
  if (args.roomStatus !== 'live') {
    return {
      kind: 'scheduled',
      label: args.roomStatus === 'ended' ? 'Ended' : 'Scheduled',
      videoOnAir: false,
    };
  }

  const health = (args.streamHealth ?? '').toLowerCase();
  const paused = args.streamPaused === true || args.broadcastPhase === 'paused';

  if (paused) {
    return { kind: 'paused', label: 'Paused', videoOnAir: false };
  }

  if (args.broadcastPhase === 'live') {
    return { kind: 'live', label: 'LIVE', videoOnAir: true };
  }

  if (args.companionMode && args.roomBroadcastOnAir) {
    return { kind: 'elsewhere', label: 'Live elsewhere', videoOnAir: true };
  }

  if (
    args.broadcastPhase === 'starting' ||
    args.broadcastPhase === 'stopping' ||
    health === 'connecting'
  ) {
    return { kind: 'connecting', label: 'Connecting…', videoOnAir: false };
  }

  return { kind: 'offline', label: 'No video', videoOnAir: false };
}
