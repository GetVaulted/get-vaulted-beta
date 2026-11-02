import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vaultRevealDisplayMs, type VaultRevealSpinPayload } from '../lib/vaultRevealSpin';
import type { ChatMessage } from '../types';
import { RevealChatGate } from '../../../shared/reveal-chat-hold';
import { SURPRISE_CARD_TOTAL_MS } from '../../../shared/surprise-reveal-card';

/**
 * Keeps the "@buyer got X" chat line hidden until that buyer's reveal (card or wheel) has finished
 * playing on this screen — whichever order the chat line and the reveal arrive in. A line that has
 * already been shown is never hidden again.
 */
export function useRevealChatHold(
  messages: ChatMessage[],
  activeSpin: VaultRevealSpinPayload | null,
): { visibleMessages: ChatMessage[]; holdBuyer: (username: string | null | undefined, durationMs?: number) => void } {
  const gateRef = useRef<RevealChatGate | null>(null);
  if (!gateRef.current) gateRef.current = new RevealChatGate(Date.now());
  const gate = gateRef.current;
  const [tick, setTick] = useState(0);

  const holdBuyer = useCallback(
    (username: string | null | undefined, durationMs = SURPRISE_CARD_TOTAL_MS) => {
      gate.holdBuyer(username, durationMs, Date.now());
      setTick((n) => n + 1);
    },
    [gate],
  );

  const visibleMessages = useMemo(() => {
    const now = Date.now();
    gate.syncSpin(activeSpin, activeSpin ? vaultRevealDisplayMs(activeSpin) : 0, now);
    return gate.visible(messages, (m) => ({ body: m.text, messageType: m.messageType ?? null }), now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, messages, activeSpin, tick]);

  useEffect(() => {
    const next = gate.nextWakeAt(Date.now());
    if (next == null) return;
    const id = setTimeout(() => setTick((n) => n + 1), Math.max(0, next - Date.now()) + 16);
    return () => clearTimeout(id);
  }, [gate, visibleMessages, tick]);

  return { visibleMessages, holdBuyer };
}
