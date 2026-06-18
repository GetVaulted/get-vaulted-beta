import type { LiveStream } from '../types';
import { canonicalLiveShareUrl } from './liveShareUrl';

export const LIVE_SHARE_DESCRIPTION = 'Join the live auction now';

export function buildLiveRoomShareOgTitle(stream: LiveStream): string {
  const hostUsername = stream.host.handle.replace(/^@+/, '') || stream.host.name || 'Host';
  return `${hostUsername} is LIVE on Get Vaulted`;
}

export function buildLiveRoomShareOgDescription(stream: LiveStream): string {
  const showTitle = stream.title?.trim() || 'Live show';
  return buildSellerLiveShareOgDescription(showTitle);
}

export function buildSellerLiveShareOgTitle(hostUsername: string): string {
  const host = hostUsername.replace(/^@+/, '').trim() || 'Host';
  return `${host} is LIVE on Get Vaulted`;
}

export function buildSellerLiveShareOgDescription(showTitle: string): string {
  const title = showTitle.trim() || 'Live show';
  return `${title} • ${LIVE_SHARE_DESCRIPTION}`;
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
