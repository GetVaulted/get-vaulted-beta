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

/** Slow-mode countdown chip rendered above the pinned row (or composer when no pin). */
export const SLOW_MODE_ROW_HEIGHT = 28;
export const SLOW_MODE_ROW_GAP = 6;

/** Estimated collapsed giveaway rail height (mobile side tab). */
export const GIVEAWAY_TAB_HEIGHT_ESTIMATE = 96;

/** Gap between chat stack top edge and giveaway tab bottom edge. */
export const GIVEAWAY_ABOVE_CHAT_GAP = 12;

export type LiveRoomBottomStack = {
  commerceBottom: number;
  composerBottom: number;
  /** Bottom offset for the pinned mod announcement bar (when active). */
  pinnedBarBottom: number;
  /** Bottom offset for the slow-mode countdown chip (sits above the pinned bar). */
  slowModeBottom: number;
  chatBottom: number;
  commerceTop: number;
};

/**
 * Bottom-anchored stack: safe area → commerce → composer → pinned bar → slow-mode chip → chat.
 * The pinned bar and slow-mode chip each get their own row so they never overlap, and the chat
 * feed reserves whatever rows are active so it never sits on top of them.
 */
export function computeLiveRoomBottomStack(args: {
  dockPaddingBottom: number;
  commerceHeight: number;
  keyboardOffset?: number;
  compact?: boolean;
  pinnedModeratorActive?: boolean;
  slowModeActive?: boolean;
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
  const slowRowHeight = Math.round(SLOW_MODE_ROW_HEIGHT * overlayScale);
  const slowGap = Math.round(SLOW_MODE_ROW_GAP * overlayScale);
  const commerceBottom = args.dockPaddingBottom + keyboardOffset;
  const composerBottom = commerceBottom + args.commerceHeight + composerGap;
  const composerTop = composerBottom + composerHeight;

  // Walk up the stack, tracking the top edge of the highest row placed so far.
  const pinnedBarBottom = composerTop + pinnedGap;
  const stackTopAfterPinned = args.pinnedModeratorActive
    ? pinnedBarBottom + pinnedRowHeight
    : composerTop;
  const slowModeBottom = stackTopAfterPinned + slowGap;
  const stackTopAfterSlowMode = args.slowModeActive
    ? slowModeBottom + slowRowHeight
    : stackTopAfterPinned;
  const chatBottom = stackTopAfterSlowMode + chatGap;

  return {
    commerceBottom,
    composerBottom,
    pinnedBarBottom,
    slowModeBottom,
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
  /** Taller chat column when the viewer expands the overlay chat stack. */
  expanded?: boolean;
}): number {
  const overlayScale = args.overlayScale && args.overlayScale > 1 ? args.overlayScale : 1;
  const available = args.slideHeight - args.topReserve - args.chatBottom - 12;
  const floor = Math.round(108 * overlayScale);
  if (args.expanded) {
    const scaled = Math.floor(available * (overlayScale > 1 ? 0.72 : 0.65));
    const cap = Math.round(420 * overlayScale);
    return Math.min(cap, Math.max(floor, scaled));
  }
  const scaled = Math.floor(available * (overlayScale > 1 ? 0.48 : 0.42));
  const cap = Math.round(248 * overlayScale);
  return Math.min(cap, Math.max(floor, scaled));
}

/** Left-edge giveaway tab sits above the chat column (not centered over it). */
export function computeGiveawaySideTabBottom(args: {
  chatBottom: number;
  chatMaxHeight: number;
}): number {
  return args.chatBottom + args.chatMaxHeight + GIVEAWAY_ABOVE_CHAT_GAP;
}
