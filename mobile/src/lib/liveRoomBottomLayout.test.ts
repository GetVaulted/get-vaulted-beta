import { describe, expect, it } from 'vitest';
import {
  computeChatStackMaxHeight,
  computeLiveRoomBottomStack,
  DEFAULT_COMMERCE_OVERLAY_HEIGHT,
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
