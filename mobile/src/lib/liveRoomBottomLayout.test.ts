import { describe, expect, it } from 'vitest';
import {
  computeChatStackMaxHeight,
  computeGiveawaySideTabBottom,
  computeLiveRoomBottomStack,
  DEFAULT_COMMERCE_OVERLAY_HEIGHT,
  GIVEAWAY_ABOVE_CHAT_GAP,
  PINNED_ABOVE_COMPOSER_GAP,
  PINNED_MODERATOR_ROW_HEIGHT,
} from './liveRoomBottomLayout';

describe('computeLiveRoomBottomStack', () => {
  it('stacks commerce, composer, and chat with safe-area padding', () => {
    const stack = computeLiveRoomBottomStack({
      dockPaddingBottom: 34,
      commerceHeight: DEFAULT_COMMERCE_OVERLAY_HEIGHT,
    });
    expect(stack.commerceBottom).toBe(34);
    expect(stack.composerBottom).toBeGreaterThan(stack.commerceBottom + DEFAULT_COMMERCE_OVERLAY_HEIGHT);
    expect(stack.chatBottom).toBeGreaterThan(stack.composerBottom);
  });

  it('lifts the stack when the keyboard is open', () => {
    const closed = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      keyboardOffset: 0,
    });
    const open = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      keyboardOffset: 280,
    });
    expect(open.commerceBottom).toBe(closed.commerceBottom + 280);
    expect(open.composerBottom).toBe(closed.composerBottom + 280);
  });

  it('reserves space above the composer when a pinned mod announcement is active', () => {
    const plain = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
    });
    const pinned = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      pinnedModeratorActive: true,
    });
    expect(pinned.pinnedBarBottom).toBeGreaterThan(plain.composerBottom);
    expect(pinned.chatBottom - plain.chatBottom).toBe(
      PINNED_MODERATOR_ROW_HEIGHT + PINNED_ABOVE_COMPOSER_GAP,
    );
  });
});

describe('computeChatStackMaxHeight', () => {
  it('caps chat height on small screens', () => {
    const small = computeChatStackMaxHeight({
      slideHeight: 667,
      topReserve: 100,
      chatBottom: 260,
    });
    const large = computeChatStackMaxHeight({
      slideHeight: 932,
      topReserve: 100,
      chatBottom: 260,
    });
    expect(small).toBeGreaterThanOrEqual(96);
    expect(small).toBeLessThan(large);
    expect(large).toBeLessThanOrEqual(248);
  });
});

describe('computeGiveawaySideTabBottom', () => {
  it('sits above the chat stack with a fixed gap', () => {
    const chatBottom = 280;
    const chatMaxHeight = 200;
    expect(
      computeGiveawaySideTabBottom({ chatBottom, chatMaxHeight }),
    ).toBe(chatBottom + chatMaxHeight + GIVEAWAY_ABOVE_CHAT_GAP);
  });
});
