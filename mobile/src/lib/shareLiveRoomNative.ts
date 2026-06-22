import { Platform, Share } from 'react-native';
import type { LiveStream } from '../types';
import {
  buildLiveRoomShareOgDescription,
  buildLiveRoomShareOgTitle,
  buildSellerLiveShareOgDescription,
  buildSellerLiveShareOgTitle,
} from './liveRoomShare';
import { canonicalLiveShareUrl } from './liveShareUrl';

export type ShareLiveRoomInput = {
  roomId: string;
  showTitle: string;
  hostUsername: string;
  /** When false, copy reflects a scheduled upcoming show. */
  isLive?: boolean;
};

function isScheduled(isLive: boolean | undefined): boolean {
  return isLive === false;
}

/** Opens the OS share sheet (Messages, WhatsApp, Mail, etc.) with a live-room link tuned for rich previews. */
export async function shareLiveRoomNative(input: ShareLiveRoomInput): Promise<boolean> {
  const url = canonicalLiveShareUrl(input.roomId);
  if (!url) return false;

  const live = !isScheduled(input.isLive);
  const title = buildSellerLiveShareOgTitle(input.hostUsername, live);
  const description = buildSellerLiveShareOgDescription(input.showTitle, live);

  try {
    if (Platform.OS === 'ios') {
      // iMessage unfurls OG tiles when the URL is shared directly (not buried in message text).
      await Share.share({ url });
    } else {
      await Share.share({
        title,
        message: `${title}\n${description}\n${url}`,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** Buyer feed helper — derives share fields from a discovery stream row. */
export async function shareLiveStreamNative(stream: LiveStream): Promise<boolean> {
  const url = canonicalLiveShareUrl(stream.id);
  if (!url) return false;

  const title = buildLiveRoomShareOgTitle(stream);
  const description = buildLiveRoomShareOgDescription(stream);

  try {
    if (Platform.OS === 'ios') {
      await Share.share({ url });
    } else {
      await Share.share({
        title,
        message: `${title}\n${description}\n${url}`,
      });
    }
    return true;
  } catch {
    return false;
  }
}
