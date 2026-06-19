/** Fallback before commerce HUD `onLayout` measures actual height. */
export const DEFAULT_COMMERCE_OVERLAY_HEIGHT = 118;

export const COMPOSER_BAR_HEIGHT = 44;

/** Space between commerce HUD top edge and composer bottom edge. */
export const COMPOSER_ABOVE_HUD_GAP = 8;

/** Space between composer top edge and chat stack bottom edge. */
export const CHAT_ABOVE_COMPOSER_GAP = 18;

export const COMPACT_COMPOSER_ABOVE_HUD_GAP = 6;
export const COMPACT_CHAT_ABOVE_COMPOSER_GAP = 12;

/** Whatnot-style pinned mod row rendered above the composer. */
export const PINNED_MODERATOR_ROW_HEIGHT = 62;
export const PINNED_ABOVE_COMPOSER_GAP = 6;

export type LiveRoomBottomStack = {
  commerceBottom: number;
  composerBottom: number;
  /** Bottom offset for the pinned mod announcement bar (when active). */
  pinnedBarBottom: number;
  chatBottom: number;
  commerceTop: number;
};

/** Bottom-anchored stack: safe area → commerce → composer → pinned bar → chat feed. */
export function computeLiveRoomBottomStack(args: {
  dockPaddingBottom: number;
  commerceHeight: number;
  keyboardOffset?: number;
  compact?: boolean;
  pinnedModeratorActive?: boolean;
}): LiveRoomBottomStack {
  const keyboardOffset = Math.max(0, args.keyboardOffset ?? 0);
  const composerGap = args.compact ? COMPACT_COMPOSER_ABOVE_HUD_GAP : COMPOSER_ABOVE_HUD_GAP;
  const chatGap = args.compact ? COMPACT_CHAT_ABOVE_COMPOSER_GAP : CHAT_ABOVE_COMPOSER_GAP;
  const commerceBottom = args.dockPaddingBottom + keyboardOffset;
  const composerBottom = commerceBottom + args.commerceHeight + composerGap;
  const pinnedBarBottom = composerBottom + COMPOSER_BAR_HEIGHT + PINNED_ABOVE_COMPOSER_GAP;
  const pinnedReserve = args.pinnedModeratorActive
    ? PINNED_MODERATOR_ROW_HEIGHT + PINNED_ABOVE_COMPOSER_GAP
    : 0;
  const chatBottom = composerBottom + COMPOSER_BAR_HEIGHT + chatGap + pinnedReserve;
  return {
    commerceBottom,
    composerBottom,
    pinnedBarBottom,
    chatBottom,
    commerceTop: commerceBottom + args.commerceHeight,
  };
}

/** Cap chat stack height on small screens while preserving separation from commerce HUD. */
export function computeChatStackMaxHeight(args: {
  slideHeight: number;
  topReserve: number;
  chatBottom: number;
}): number {
  const available = args.slideHeight - args.topReserve - args.chatBottom - 12;
  const scaled = Math.floor(available * 0.42);
  return Math.min(248, Math.max(108, scaled));
}
