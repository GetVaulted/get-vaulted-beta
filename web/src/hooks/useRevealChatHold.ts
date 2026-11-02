"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vaultRevealDisplayMs, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import {
  addRevealChatHold,
  isRevealChatLineHeld,
  nextRevealChatRelease,
  releaseRevealChatHold,
  type RevealChatHolds,
} from "../../../shared/reveal-chat-hold";

type ChatLine = { id: string; body?: string | null; messageType?: string | null };

/**
 * Keeps the "@buyer got X" chat line hidden until that buyer's reveal (card or wheel) has finished
 * playing on this screen. A line that has already been shown is never hidden again.
 *
 * @returns the messages to render, plus `holdBuyer` to start a hold before the spin arrives
 * (e.g. on the `variant_purchased` event, which can beat the spin broadcast).
 */
export function useRevealChatHold<T extends ChatLine>(
  messages: T[],
  activeSpin: VaultRevealSpinPayload | null,
): { visibleMessages: T[]; holdBuyer: (username: string | null | undefined, durationMs: number) => void } {
  const holdsRef = useRef<RevealChatHolds>(new Map());
  const shownRef = useRef<Set<string>>(new Set());
  const prevSpinRef = useRef<VaultRevealSpinPayload | null>(null);
  const [tick, setTick] = useState(0);

  const holdBuyer = useCallback((username: string | null | undefined, durationMs: number) => {
    if (addRevealChatHold(holdsRef.current, username, durationMs, Date.now()) != null) setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const prev = prevSpinRef.current;
    if (prev && prev.spinId !== activeSpin?.spinId) {
      releaseRevealChatHold(holdsRef.current, prev.buyerUsername, Date.now());
    }
    if (activeSpin && activeSpin.spinId !== prev?.spinId && activeSpin.buyerUsername) {
      addRevealChatHold(holdsRef.current, activeSpin.buyerUsername, vaultRevealDisplayMs(activeSpin), Date.now());
    }
    prevSpinRef.current = activeSpin;
    setTick((n) => n + 1);
  }, [activeSpin]);

  // Re-render when the next hold expires.
  useEffect(() => {
    const next = nextRevealChatRelease(holdsRef.current, Date.now());
    if (next == null) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, next - Date.now()) + 16);
    return () => window.clearTimeout(id);
  }, [tick, messages]);

  const visibleMessages = useMemo(() => {
    const now = Date.now();
    const shown = shownRef.current;
    if (holdsRef.current.size === 0) {
      for (const m of messages) shown.add(m.id);
      return messages;
    }
    const out = messages.filter((m) => shown.has(m.id) || !isRevealChatLineHeld(holdsRef.current, m, now));
    for (const m of out) shown.add(m.id);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, tick]);

  return { visibleMessages, holdBuyer };
}
