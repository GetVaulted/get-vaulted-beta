import { describe, expect, it } from 'vitest';
import {
  CHAT_ABOVE_COMPOSER_GAP,
  COMPOSER_BAR_HEIGHT,
  computeChatStackMaxHeight,
  computeGiveawaySideTabBottom,
  computeLiveRoomBottomStack,
  DEFAULT_COMMERCE_OVERLAY_HEIGHT,
  GIVEAWAY_ABOVE_CHAT_GAP,
  PINNED_ABOVE_COMPOSER_GAP,
  PINNED_MODERATOR_ROW_HEIGHT,
  SLOW_MODE_ROW_GAP,
  SLOW_MODE_ROW_HEIGHT,
  STAFF_CHAT_TOGGLE_ROW_HEIGHT,
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

  it('places chat flush above the composer when no pin is active', () => {
    const stack = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
    });
    expect(stack.chatBottom).toBe(stack.composerBottom + COMPOSER_BAR_HEIGHT + CHAT_ABOVE_COMPOSER_GAP);
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

  it('inserts the pinned mod bar above the composer and pushes chat up', () => {
    const plain = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
    });
    const pinned = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      pinnedModeratorActive: true,
    });
    expect(pinned.pinnedBarBottom).toBe(plain.composerBottom + COMPOSER_BAR_HEIGHT + PINNED_ABOVE_COMPOSER_GAP);
    expect(pinned.chatBottom).toBe(
      pinned.pinnedBarBottom + PINNED_MODERATOR_ROW_HEIGHT + CHAT_ABOVE_COMPOSER_GAP,
    );
    expect(pinned.chatBottom - plain.chatBottom).toBe(
      PINNED_MODERATOR_ROW_HEIGHT + PINNED_ABOVE_COMPOSER_GAP,
    );
  });

  it('places the slow-mode chip in its own row above the pinned bar (no overlap)', () => {
    const both = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      pinnedModeratorActive: true,
      slowModeActive: true,
    });
    // Slow-mode chip must clear the full pinned row, not sit on top of it.
    expect(both.slowModeBottom).toBeGreaterThanOrEqual(
      both.pinnedBarBottom + PINNED_MODERATOR_ROW_HEIGHT,
    );
    // Chat must reserve the slow-mode row too, so it never overlaps the chip.
    expect(both.chatBottom).toBeGreaterThanOrEqual(both.slowModeBottom + SLOW_MODE_ROW_HEIGHT);
  });

  it('reserves a slow-mode row when slow mode is active without a pinned announcement', () => {
    const plain = computeLiveRoomBottomStack({ dockPaddingBottom: 20, commerceHeight: 140 });
    const slow = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      slowModeActive: true,
    });
    expect(slow.chatBottom - plain.chatBottom).toBe(SLOW_MODE_ROW_HEIGHT + SLOW_MODE_ROW_GAP);
  });

  it('reserves the Everyone/Staff toggle above the composer for host/mod', () => {
    const plain = computeLiveRoomBottomStack({ dockPaddingBottom: 20, commerceHeight: 140 });
    const withStaff = computeLiveRoomBottomStack({
      dockPaddingBottom: 20,
      commerceHeight: 140,
      staffChatToggleActive: true,
    });
    expect(withStaff.chatBottom - plain.chatBottom).toBe(STAFF_CHAT_TOGGLE_ROW_HEIGHT);
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

  it('uses a taller stack when expanded', () => {
    const collapsed = computeChatStackMaxHeight({
      slideHeight: 932,
      topReserve: 100,
      chatBottom: 260,
    });
    const expanded = computeChatStackMaxHeight({
      slideHeight: 932,
      topReserve: 100,
      chatBottom: 260,
      expanded: true,
    });
    expect(expanded).toBeGreaterThan(collapsed);
    expect(expanded).toBeLessThanOrEqual(420);
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
