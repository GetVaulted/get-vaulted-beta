"use client";

import { useCallback, useEffect, useRef } from "react";

/** Keep live chat pinned to the newest messages unless the viewer scrolls up. */
export function useChatScrollToBottom(messageCount: number, enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (!enabled) {
      pinnedRef.current = true;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!pinnedRef.current) return;
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, messageCount, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  return { ref, onScroll, scrollToBottom };
}
