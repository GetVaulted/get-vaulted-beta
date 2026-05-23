/** Fallback before commerce HUD `onLayout` measures actual height. */
export const DEFAULT_COMMERCE_OVERLAY_HEIGHT = 118;

export const COMPOSER_BAR_HEIGHT = 44;

/** Space between commerce HUD and chat composer. */
export const COMMERCE_TO_COMPOSER_GAP = 14;

/** Space between chat composer and floating message stack. */
export const CHAT_ABOVE_COMPOSER_GAP = 12;

export type LiveRoomBottomStack = {
  commerceBottom: number;
  composerBottom: number;
  chatBottom: number;
  commerceTop: number;
};

/** Bottom-anchored stack: safe area → commerce → composer → chat feed. */
export function computeLiveRoomBottomStack(args: {
  dockPaddingBottom: number;
  commerceHeight: number;
  keyboardOffset?: number;
}): LiveRoomBottomStack {
  const keyboardOffset = Math.max(0, args.keyboardOffset ?? 0);
  const commerceBottom = args.dockPaddingBottom + keyboardOffset;
  const composerBottom = commerceBottom + args.commerceHeight + COMMERCE_TO_COMPOSER_GAP;
  const chatBottom = composerBottom + COMPOSER_BAR_HEIGHT + CHAT_ABOVE_COMPOSER_GAP;
  return {
    commerceBottom,
    composerBottom,
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
  const scaled = Math.floor(available * 0.38);
  return Math.min(228, Math.max(96, scaled));
}
