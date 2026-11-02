"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vaultRevealDisplayMs, type VaultRevealSpinPayload } from "@/lib/vault-reveal-spin";
import { RevealChatGate } from "../../../shared/reveal-chat-hold";

type ChatLine = { id: string; body?: string | null; messageType?: string | null };

/**
 * Keeps the "@buyer got X" chat line hidden until that buyer's reveal (card or wheel) has finished
 * playing on this screen — whichever order the chat line and the reveal arrive in. A line that has
 * already been shown is never hidden again.
 *
 * @returns the messages to render, plus `holdBuyer` to start a hold before the spin arrives.
 */
export function useRevealChatHold<T extends ChatLine>(
  messages: T[],
  activeSpin: VaultRevealSpinPayload | null,
): { visibleMessages: T[]; holdBuyer: (username: string | null | undefined, durationMs: number) => void } {
  const gateRef = useRef<RevealChatGate | null>(null);
  if (!gateRef.current) gateRef.current = new RevealChatGate(Date.now());
  const gate = gateRef.current;
  const [tick, setTick] = useState(0);

  const holdBuyer = useCallback(
    (username: string | null | undefined, durationMs: number) => {
      gate.holdBuyer(username, durationMs, Date.now());
      setTick((n) => n + 1);
    },
    [gate],
  );

  const visibleMessages = useMemo(() => {
    const now = Date.now();
    // Register the reveal synchronously so a chat line in the same render is already covered.
    gate.syncSpin(activeSpin, activeSpin ? vaultRevealDisplayMs(activeSpin) : 0, now);
    return gate.visible(messages, (m) => m, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, messages, activeSpin, tick]);

  useEffect(() => {
    const next = gate.nextWakeAt(Date.now());
    if (next == null) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, next - Date.now()) + 16);
    return () => window.clearTimeout(id);
  }, [gate, visibleMessages, tick]);

  return { visibleMessages, holdBuyer };
}
