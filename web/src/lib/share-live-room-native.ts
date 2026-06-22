import {
  canonicalLiveRoomUrl,
  formatLiveRoomShareDescription,
  formatLiveRoomShareOgTitle,
} from "@/lib/live-room-share-metadata";

export type ShareLiveRoomNativeInput = {
  roomId: string;
  showTitle: string;
  hostUsername: string;
  category?: string | null;
  isLive?: boolean;
};

/** Opens the browser/OS share sheet with URL separated from body text for rich link previews. */
export async function shareLiveRoomNative(input: ShareLiveRoomNativeInput): Promise<boolean> {
  const shareUrl = canonicalLiveRoomUrl(input.roomId);
  const meta = {
    id: input.roomId,
    title: input.showTitle,
    category: input.category,
    sellerUsername: input.hostUsername,
    isLive: input.isLive,
  };
  const shareTitle = formatLiveRoomShareOgTitle(meta);
  const shareDescription = formatLiveRoomShareDescription(meta);

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({
      title: shareTitle,
      text: shareDescription,
      url: shareUrl,
    });
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${shareTitle}\n${shareDescription}\n${shareUrl}`);
    return true;
  }

  return false;
}
