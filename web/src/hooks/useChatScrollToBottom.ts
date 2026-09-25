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

  // Primary trigger: an explicit message-count change (new message arrived).
  useEffect(() => {
    if (!enabled) return;
    if (!pinnedRef.current) return;
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
    });
    // Late-settling layout (avatar/image loads, font swap, wrapped text reflow) can grow
    // scrollHeight after the double-rAF already ran — re-assert a couple more times so a
    // desktop three-column layout with slower paint doesn't end up short of the true bottom.
    const t1 = window.setTimeout(scrollToBottom, 80);
    const t2 = window.setTimeout(scrollToBottom, 250);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enabled, messageCount, scrollToBottom]);

  // Belt-and-suspenders: watch the scrollable element's own content height directly, so any
  // growth we didn't catch via messageCount (late image/avatar load, a message row whose
  // content streams in) still re-pins to bottom while the viewer hasn't scrolled up.
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [enabled, messageCount, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  return { ref, onScroll, scrollToBottom };
}
