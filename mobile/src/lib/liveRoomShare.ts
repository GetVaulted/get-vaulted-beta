import type { LiveStream } from '../types';
import { canonicalLiveShareUrl } from './liveShareUrl';

export const LIVE_SHARE_DESCRIPTION = 'Join the live auction now';
export const UPCOMING_LIVE_SHARE_DESCRIPTION = 'Join when we go live';

function isScheduledStream(stream: Pick<LiveStream, 'roomStatus'>): boolean {
  return stream.roomStatus === 'scheduled';
}

export function buildLiveRoomShareOgTitle(stream: LiveStream): string {
  const hostUsername = stream.host.handle.replace(/^@+/, '') || stream.host.name || 'Host';
  if (isScheduledStream(stream)) {
    return `${hostUsername} on Get Vaulted`;
  }
  return `${hostUsername} is LIVE on Get Vaulted`;
}

export function buildLiveRoomShareOgDescription(stream: LiveStream): string {
  const showTitle = stream.title?.trim() || 'Live show';
  return buildSellerLiveShareOgDescription(showTitle, isScheduledStream(stream));
}

export function buildSellerLiveShareOgTitle(hostUsername: string, isLive = true): string {
  const host = hostUsername.replace(/^@+/, '').trim() || 'Host';
  if (!isLive) {
    return `${host} on Get Vaulted`;
  }
  return `${host} is LIVE on Get Vaulted`;
}

export function buildSellerLiveShareOgDescription(showTitle: string, isLive = true): string {
  const title = showTitle.trim() || 'Live show';
  const tagline = isLive ? LIVE_SHARE_DESCRIPTION : UPCOMING_LIVE_SHARE_DESCRIPTION;
  return `${title} • ${tagline}`;
}

/** @deprecated Use buildLiveRoomShareOgTitle for share surfaces. */
export function buildLiveRoomShareTitle(stream: LiveStream): string {
  return buildLiveRoomShareOgTitle(stream);
}

export function buildLiveRoomShareMessage(stream: LiveStream): {
  title: string;
  message: string;
  url: string | null;
} {
  const title = buildLiveRoomShareOgTitle(stream);
  const description = buildLiveRoomShareOgDescription(stream);
  const url = canonicalLiveShareUrl(stream.id);
  const message = url ? `${title}\n${description}\n${url}` : `${title}\n${description}`;
  return { title, message, url };
}
