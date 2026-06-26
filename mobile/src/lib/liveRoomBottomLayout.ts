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

/** Estimated collapsed giveaway rail height (mobile side tab). */
export const GIVEAWAY_TAB_HEIGHT_ESTIMATE = 96;

/** Gap between chat stack top edge and giveaway tab bottom edge. */
export const GIVEAWAY_ABOVE_CHAT_GAP = 12;

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
  /** iPad overlay scale — enlarges composer + spacing only on tablet. */
  overlayScale?: number;
}): LiveRoomBottomStack {
  const overlayScale = args.overlayScale && args.overlayScale > 1 ? args.overlayScale : 1;
  const composerHeight = Math.round(COMPOSER_BAR_HEIGHT * overlayScale);
  const keyboardOffset = Math.max(0, args.keyboardOffset ?? 0);
  const composerGap = Math.round(
    (args.compact ? COMPACT_COMPOSER_ABOVE_HUD_GAP : COMPOSER_ABOVE_HUD_GAP) * overlayScale,
  );
  const chatGap = Math.round(
    (args.compact ? COMPACT_CHAT_ABOVE_COMPOSER_GAP : CHAT_ABOVE_COMPOSER_GAP) * overlayScale,
  );
  const pinnedRowHeight = Math.round(PINNED_MODERATOR_ROW_HEIGHT * overlayScale);
  const pinnedGap = Math.round(PINNED_ABOVE_COMPOSER_GAP * overlayScale);
  const commerceBottom = args.dockPaddingBottom + keyboardOffset;
  const composerBottom = commerceBottom + args.commerceHeight + composerGap;
  const pinnedBarBottom = composerBottom + composerHeight + pinnedGap;
  const pinnedReserve = args.pinnedModeratorActive ? pinnedRowHeight + pinnedGap : 0;
  const chatBottom = composerBottom + composerHeight + chatGap + pinnedReserve;
  return {
    commerceBottom,
    composerBottom,
    pinnedBarBottom,
    chatBottom,
    commerceTop: commerceBottom + args.commerceHeight,
  };
}

/** Composer bar height after optional iPad overlay scale. */
export function scaledComposerBarHeight(overlayScale = 1): number {
  return Math.round(COMPOSER_BAR_HEIGHT * (overlayScale > 1 ? overlayScale : 1));
}

/** Cap chat stack height on small screens while preserving separation from commerce HUD. */
export function computeChatStackMaxHeight(args: {
  slideHeight: number;
  topReserve: number;
  chatBottom: number;
  overlayScale?: number;
}): number {
  const overlayScale = args.overlayScale && args.overlayScale > 1 ? args.overlayScale : 1;
  const available = args.slideHeight - args.topReserve - args.chatBottom - 12;
  const scaled = Math.floor(available * (overlayScale > 1 ? 0.48 : 0.42));
  const cap = Math.round(248 * overlayScale);
  const floor = Math.round(108 * overlayScale);
  return Math.min(cap, Math.max(floor, scaled));
}

/** Left-edge giveaway tab sits above the chat column (not centered over it). */
export function computeGiveawaySideTabBottom(args: {
  chatBottom: number;
  chatMaxHeight: number;
}): number {
  return args.chatBottom + args.chatMaxHeight + GIVEAWAY_ABOVE_CHAT_GAP;
}
