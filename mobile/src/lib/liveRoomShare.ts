import { formatLiveRoomCategoryLabel } from '../data/categoryDisplayShared';
import type { LiveStream } from '../types';
import { webLiveRoomUrl } from './openWebCommerce';

export const LIVE_SHARE_DESCRIPTION = 'Watch live auctions, breaks, and drops on Get Vaulted.';

export function buildLiveRoomShareTitle(stream: LiveStream): string {
  const hostUsername = stream.host.handle.replace(/^@+/, '') || stream.host.name || 'host';
  const categoryName = formatLiveRoomCategoryLabel(stream.categoryTags[0] ?? null, stream.category);
  const showTitle = stream.title?.trim() || 'Live show';
  return `${hostUsername} is live · ${categoryName} · ${showTitle}`;
}

export function buildLiveRoomShareMessage(stream: LiveStream): { title: string; message: string; url: string | null } {
  const title = buildLiveRoomShareTitle(stream);
  const url = webLiveRoomUrl(stream.id);
  const message = url ? `${title}\n${LIVE_SHARE_DESCRIPTION}\n${url}` : `${title}\n${LIVE_SHARE_DESCRIPTION}`;
  return { title, message, url };
}
